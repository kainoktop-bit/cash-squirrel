import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendGmailEmail } from './_gmail.js';

// Replaces Supabase's built-in email-based password recovery (which uses whatever SMTP is
// configured in the Supabase dashboard, separate from this app's own Gmail account) with a
// reset code sent through this app's own email sender instead. This used to go over LINE
// instead of email entirely, specifically to route around a then-broken Gmail account -- but
// that meant any account without LINE already linked (which includes every brand-new signup,
// since linking LINE is itself a step done from inside the app) had no way to reset their
// password at all. Now that Gmail is confirmed delivering again, email works for every account
// that exists, not just LINE-linked ones.
//
// Also handles reporting repeated failed *sign-in* attempts (a separate concern from the
// password-reset code above, but folded into this same file rather than a new one -- this
// project sits right at Vercel's per-deployment function-count limit, so every extra file
// risks breaking every deploy). Sign-in itself still goes straight from the browser to
// Supabase Auth (this app has no backend in front of it), so this can't actually block a
// scripted attacker from hitting Supabase directly -- it's a UX cooldown + email alert layer
// on top of Supabase's own real rate-limiting, not a replacement for it.
//
// Both steps (request + verify) live in one function so this feature only costs a single
// serverless-function slot -- this project sits right at the platform's per-deployment
// function-count limit, so an extra file per step is enough to break every deploy.

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

const MAX_VERIFY_ATTEMPTS = 5;

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // failed attempts older than this don't count toward the next lockout
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

interface NotifSettingsRow {
  passwordResetCode?: { code: string; expiresAt: string; attempts?: number };
  loginSecurity?: { failedAttempts: number; windowStartedAt: string; lockedUntil?: string };
  [key: string]: unknown;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildResetEmailHtml(code: string): string {
  return `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#3D2314;">
    <h2 style="color:#4338CA;">รหัสยืนยันสำหรับตั้งรหัสผ่านใหม่</h2>
    <p style="font-size:13px;color:#7A5C43;">กรอกรหัสนี้ในแอปกระรอกตุนเงินเพื่อตั้งรหัสผ่านใหม่:</p>
    <div style="margin:20px 0;padding:20px;background:#FDF6EC;border-radius:12px;text-align:center;">
      <span style="font-size:32px;font-weight:900;letter-spacing:6px;color:#3D2314;">${code}</span>
    </div>
    <p style="font-size:12px;color:#A88A6E;">รหัสนี้หมดอายุใน 15 นาที ถ้าไม่ได้เป็นคนขอเอง ไม่ต้องทำอะไรครับ ไม่มีใครเปลี่ยนรหัสผ่านของคุณได้จนกว่าจะกรอกรหัสนี้</p>
  </div>`;
}

async function handleRequest(req: VercelRequest, res: VercelResponse) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) {
    res.status(400).json({ error: 'กรุณากรอกอีเมล' });
    return;
  }

  const { data: row, error: rowErr } = await supabaseAdmin
    .from('user_cashflow_data')
    .select('user_id, notif_settings')
    .ilike('email', email)
    .maybeSingle();
  if (rowErr) throw rowErr;

  // Same non-committal response whether the email doesn't exist at all -- don't confirm/deny
  // account existence to an unauthenticated caller.
  if (!row) {
    res.status(200).json({ ok: false, reason: 'not_found' });
    return;
  }

  const notifSettings: NotifSettingsRow = row.notif_settings || {};
  const code = generateCode();
  const updatedSettings: NotifSettingsRow = {
    ...notifSettings,
    passwordResetCode: { code, expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS).toISOString(), attempts: 0 },
  };
  const { error: updateErr } = await supabaseAdmin
    .from('user_cashflow_data')
    .update({ notif_settings: updatedSettings })
    .eq('user_id', row.user_id);
  if (updateErr) throw updateErr;

  const sent = await sendGmailEmail(email, 'รหัสยืนยันสำหรับตั้งรหัสผ่านใหม่ - กระรอกตุนเงิน', buildResetEmailHtml(code));
  if (!sent) {
    res.status(200).json({ ok: false, reason: 'send_failed' });
    return;
  }

  res.status(200).json({ ok: true });
}

function getClientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
  return (first || req.socket?.remoteAddress || '').trim();
}

// Best-effort reverse-IP lookup for the alert email's "which network" line -- a free public API,
// no key required. If it's slow or down, fall back to the bare IP rather than failing the request.
async function lookupIpInfo(ip: string): Promise<string> {
  if (!ip || ip === '127.0.0.1' || ip.startsWith('::')) return 'ไม่ทราบตำแหน่ง';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!geoRes.ok) return ip;
    const data = await geoRes.json();
    const parts = [data.city, data.region, data.country_name, data.org].filter(Boolean);
    return parts.length ? `${parts.join(', ')} (IP: ${ip})` : ip;
  } catch {
    return ip;
  }
}

function buildLoginAlertEmailHtml(time: string, location: string): string {
  return `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#3D2314;">
    <h2 style="color:#DC2626;">แจ้งเตือน: มีความพยายามเข้าสู่ระบบซ้ำหลายครั้ง</h2>
    <p style="font-size:13px;color:#7A5C43;">มีการกรอกรหัสผ่านผิดติดต่อกัน ${MAX_LOGIN_ATTEMPTS} ครั้งสำหรับบัญชีนี้ เมื่อ ${time}</p>
    <div style="margin:16px 0;padding:14px 16px;background:#FDF6EC;border-radius:12px;">
      <p style="font-size:12px;color:#3D2314;margin:0;">ตำแหน่ง/เครือข่ายที่พยายามเข้า: <strong>${location}</strong></p>
    </div>
    <p style="font-size:13px;color:#3D2314;">ถ้าเป็นคุณเองที่พิมพ์รหัสผ่านผิด ไม่ต้องทำอะไรครับ ระบบจะปลดล็อกให้อัตโนมัติใน ${LOGIN_LOCKOUT_MS / 60000} นาที</p>
    <p style="font-size:13px;color:#DC2626;font-weight:bold;">ถ้าไม่ใช่คุณ แนะนำให้เปลี่ยนรหัสผ่านทันทีผ่านหน้า "ลืมรหัสผ่าน" ในแอป</p>
  </div>`;
}

async function handleReportFailedLogin(req: VercelRequest, res: VercelResponse) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) {
    res.status(400).json({ error: 'กรุณากรอกอีเมล' });
    return;
  }

  const { data: row, error: rowErr } = await supabaseAdmin
    .from('user_cashflow_data')
    .select('user_id, notif_settings')
    .ilike('email', email)
    .maybeSingle();
  if (rowErr) throw rowErr;

  // Same non-committal shape whether the account exists or not -- don't let a failed-login
  // report double as an email-enumeration probe.
  if (!row) {
    res.status(200).json({ ok: true, locked: false });
    return;
  }

  const notifSettings: NotifSettingsRow = row.notif_settings || {};
  const existing = notifSettings.loginSecurity;
  const now = Date.now();

  // Still inside an active lockout -- just report it back, don't touch the counters.
  if (existing?.lockedUntil && new Date(existing.lockedUntil).getTime() > now) {
    res.status(200).json({ ok: true, locked: true, lockedUntil: existing.lockedUntil, attemptsRemaining: 0 });
    return;
  }

  const windowStillOpen = !!existing?.windowStartedAt && now - new Date(existing.windowStartedAt).getTime() < LOGIN_ATTEMPT_WINDOW_MS;
  const failedAttempts = (windowStillOpen ? existing?.failedAttempts || 0 : 0) + 1;
  const windowStartedAt = windowStillOpen ? existing!.windowStartedAt : new Date(now).toISOString();
  const justLocked = failedAttempts >= MAX_LOGIN_ATTEMPTS;

  const updatedLoginSecurity: NonNullable<NotifSettingsRow['loginSecurity']> = {
    failedAttempts,
    windowStartedAt,
    ...(justLocked ? { lockedUntil: new Date(now + LOGIN_LOCKOUT_MS).toISOString() } : {}),
  };

  const { error: updateErr } = await supabaseAdmin
    .from('user_cashflow_data')
    .update({ notif_settings: { ...notifSettings, loginSecurity: updatedLoginSecurity } })
    .eq('user_id', row.user_id);
  if (updateErr) console.error('password-reset report_failed_login: failed to persist:', updateErr);

  if (justLocked) {
    const ip = getClientIp(req);
    const location = await lookupIpInfo(ip);
    const time = new Date(now).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
    const sent = await sendGmailEmail(email, 'แจ้งเตือนความปลอดภัย: มีความพยายามเข้าสู่ระบบซ้ำหลายครั้ง - กระรอกตุนเงิน', buildLoginAlertEmailHtml(time, location));
    if (!sent) console.error('password-reset report_failed_login: alert email failed to send');
  }

  res.status(200).json({
    ok: true,
    locked: justLocked,
    lockedUntil: updatedLoginSecurity.lockedUntil,
    attemptsRemaining: justLocked ? 0 : Math.max(0, MAX_LOGIN_ATTEMPTS - failedAttempts),
  });
}

async function handleVerify(req: VercelRequest, res: VercelResponse) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!email || !code) {
    res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน' });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
    return;
  }

  const { data: row, error: rowErr } = await supabaseAdmin
    .from('user_cashflow_data')
    .select('user_id, notif_settings')
    .ilike('email', email)
    .maybeSingle();
  if (rowErr) throw rowErr;
  if (!row) {
    res.status(400).json({ error: 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว' });
    return;
  }

  const notifSettings: NotifSettingsRow = row.notif_settings || {};
  const stored = notifSettings.passwordResetCode;
  const notExpired = !!stored && new Date(stored.expiresAt).getTime() > Date.now();

  // A 6-digit code is only ~1M possibilities -- with no attempt limit, a scripted attacker could
  // brute-force it well within the 15-minute window (Vercel auto-scales, so nothing here would
  // naturally throttle them). Locking the code out after a handful of wrong guesses turns that
  // into "request a fresh code and try again," not "keep guessing until it works."
  if (notExpired && (stored.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
    res.status(400).json({ error: 'กรอกรหัสผิดหลายครั้งเกินไป กรุณาขอรหัสใหม่อีกครั้งค่ะ' });
    return;
  }

  const isValid = notExpired && stored.code === code;
  if (!isValid) {
    if (notExpired) {
      const updatedSettings: NotifSettingsRow = {
        ...notifSettings,
        passwordResetCode: { ...stored, attempts: (stored.attempts || 0) + 1 },
      };
      const { error: attemptErr } = await supabaseAdmin
        .from('user_cashflow_data')
        .update({ notif_settings: updatedSettings })
        .eq('user_id', row.user_id);
      if (attemptErr) console.error('password-reset verify: failed to record attempt:', attemptErr);
    }
    res.status(400).json({ error: 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่อีกครั้งค่ะ' });
    return;
  }

  const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(row.user_id, { password: newPassword });
  if (pwErr) throw pwErr;

  // One-time use -- clear it regardless of the update outcome above having already applied.
  const { passwordResetCode: _omit, ...restSettings } = notifSettings;
  const { error: clearErr } = await supabaseAdmin
    .from('user_cashflow_data')
    .update({ notif_settings: restSettings })
    .eq('user_id', row.user_id);
  if (clearErr) console.error('password-reset verify: failed to clear used code:', clearErr);

  res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const step = typeof req.body?.step === 'string' ? req.body.step : 'request';

  try {
    if (step === 'verify') {
      await handleVerify(req, res);
    } else if (step === 'report_failed_login') {
      await handleReportFailedLogin(req, res);
    } else {
      await handleRequest(req, res);
    }
  } catch (err: any) {
    console.error('password-reset error:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
  }
}

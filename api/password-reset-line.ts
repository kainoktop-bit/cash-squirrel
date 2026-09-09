import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendLineMessagePayload } from './_line.js';

// Replaces Supabase's built-in email-based password recovery, which depends on the project's
// SMTP being healthy -- something that's repeatedly broken in this app's history (revoked App
// Passwords, and eventually a fully banned Gmail account). Sending the reset code over LINE
// instead sidesteps email delivery entirely for any account that's already linked. Accounts
// without a linked LINE can't use this path -- see the 'not_linked' response below.
//
// Both steps (request + verify) live in one function so this feature only costs a single
// serverless-function slot -- this project sits right at the platform's per-deployment
// function-count limit, so an extra file per step is enough to break every deploy.

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

interface NotifSettingsRow {
  lineUserId?: string;
  passwordResetCode?: { code: string; expiresAt: string };
  [key: string]: unknown;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
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

  // Same non-committal response whether the email doesn't exist or just isn't LINE-linked --
  // don't confirm/deny account existence to an unauthenticated caller.
  const notifSettings: NotifSettingsRow = row?.notif_settings || {};
  const lineUserId = notifSettings.lineUserId;
  if (!row || !lineUserId) {
    res.status(200).json({ ok: false, reason: 'not_linked' });
    return;
  }

  const code = generateCode();
  const updatedSettings: NotifSettingsRow = {
    ...notifSettings,
    passwordResetCode: { code, expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS).toISOString() },
  };
  const { error: updateErr } = await supabaseAdmin
    .from('user_cashflow_data')
    .update({ notif_settings: updatedSettings })
    .eq('user_id', row.user_id);
  if (updateErr) throw updateErr;

  const sent = await sendLineMessagePayload(lineUserId, {
    type: 'text',
    text: `🔐 รหัสยืนยันสำหรับตั้งรหัสผ่านใหม่ของคุณคือ\n\n${code}\n\nรหัสนี้หมดอายุใน 15 นาที ถ้าไม่ได้เป็นคนขอเอง ไม่ต้องทำอะไรครับ ไม่มีใครเปลี่ยนรหัสผ่านของคุณได้จนกว่าจะกรอกรหัสนี้`,
  });
  if (!sent) {
    res.status(200).json({ ok: false, reason: 'send_failed' });
    return;
  }

  res.status(200).json({ ok: true });
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
  const isValid = !!stored && stored.code === code && new Date(stored.expiresAt).getTime() > Date.now();
  if (!isValid) {
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
  if (clearErr) console.error('password-reset-line verify: failed to clear used code:', clearErr);

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
    } else {
      await handleRequest(req, res);
    }
  } catch (err: any) {
    console.error('password-reset-line error:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
  }
}

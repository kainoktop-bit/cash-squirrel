import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendLineMessagePayload } from './_line.js';

// Replaces Supabase's built-in email-based password recovery, which depends on the project's
// SMTP being healthy -- something that's repeatedly broken in this app's history (revoked App
// Passwords, and eventually a fully banned Gmail account). Sending the reset code over LINE
// instead sidesteps email delivery entirely for any account that's already linked. Accounts
// without a linked LINE can't use this path -- see the 'not_linked' response below.

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

interface NotifSettingsRow {
  lineUserId?: string;
  passwordResetCode?: { code: string; expiresAt: string };
  [key: string]: unknown;
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) {
    res.status(400).json({ error: 'กรุณากรอกอีเมล' });
    return;
  }

  try {
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
  } catch (err: any) {
    console.error('request-password-reset-line error:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
  }
}

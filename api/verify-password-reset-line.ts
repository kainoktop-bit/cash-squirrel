import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';

// Second half of the LINE-delivered password reset (see request-password-reset-line.ts). Checks
// the code this account was sent, then sets the new password directly via the admin API --
// there's no Supabase recovery session to hand off to here (we never called Supabase's own
// resetPasswordForEmail/verifyOtp), so this endpoint itself is the trusted boundary: verify the
// code first, only then touch the password, in one atomic step.

interface NotifSettingsRow {
  passwordResetCode?: { code: string; expiresAt: string };
  [key: string]: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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

  try {
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
    if (clearErr) console.error('verify-password-reset-line: failed to clear used code:', clearErr);

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('verify-password-reset-line error:', err);
    res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
  }
}

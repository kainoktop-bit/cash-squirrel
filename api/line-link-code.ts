import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { supabaseAdmin } from './_supabaseAdmin.js';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes -- long enough to switch to LINE and paste it in

function generateCode(): string {
  // 6 chars, uppercase letters + digits only -- short enough to type/paste into a LINE chat
  return crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

// Called from Settings when the user wants to link their LINE account. Generates a short-lived
// code and stashes it on their own row; api/line-webhook.ts matches an incoming LINE message
// against pending codes across all users and links whichever one matches.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authHeader = req.headers['authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { data: userResult, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !userResult?.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const userId = userResult.user.id;

  try {
    const { data: row, error: rowErr } = await supabaseAdmin
      .from('user_cashflow_data')
      .select('notif_settings')
      .eq('user_id', userId)
      .maybeSingle();
    if (rowErr) throw rowErr;

    if (!row) {
      // Cloud sync hasn't saved anything for this account yet -- there's no row to attach the
      // code to. Using the app for a moment (any auto-save) resolves this on its own.
      res.status(409).json({ error: 'ยังไม่พบข้อมูลบัญชีของคุณในระบบคลาวด์ ลองใช้งานแอปสักครู่แล้วลองใหม่อีกครั้ง' });
      return;
    }

    const notifSettings = row.notif_settings || {};
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from('user_cashflow_data')
      .update({
        notif_settings: { ...notifSettings, lineLinkCode: code, lineLinkCodeExpiresAt: expiresAt },
      })
      .eq('user_id', userId);
    if (updateErr) throw updateErr;

    res.status(200).json({ code, expiresAt });
  } catch (err: any) {
    console.error('line-link-code error:', err);
    res.status(500).json({ error: err.message || 'สร้างรหัสเชื่อมต่อไม่สำเร็จ' });
  }
}

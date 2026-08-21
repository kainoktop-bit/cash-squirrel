import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendLineMessage } from './_line.js';

// Called from Settings right before the disconnect RPC clears notif_settings.lineUserId --
// has to run first (or by the time it fires there'd be no lineUserId left to send to). Silently
// no-ops (200, not an error) if the account was already unlinked by the time this runs.
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

    const lineUserId = row?.notif_settings?.lineUserId as string | undefined;
    if (!lineUserId) {
      res.status(200).json({ ok: true, skipped: 'not_linked' });
      return;
    }

    const sent = await sendLineMessage(
      lineUserId,
      '🔌 ยกเลิกการเชื่อมต่อ LINE กับกระรอกตุนเงินแล้วครับ\nจะไม่มีการแจ้งเตือนส่งเข้าช่องทางนี้อีก หากต้องการเชื่อมต่อใหม่ ไปที่หน้าตั้งค่าในแอปได้เลยครับ'
    );
    res.status(200).json({ ok: sent });
  } catch (err: any) {
    console.error('notify-line-disconnected error:', err);
    res.status(500).json({ error: err.message || 'แจ้งเตือนไม่สำเร็จ' });
  }
}

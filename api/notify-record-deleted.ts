import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { buildJobDeletedMessage } from './_lineAssistant.js';
import { sendLineMessagePayload } from './_line.js';

// Called from the web app (src/App.tsx's handleDeleteJob) right after a job is deleted. LINE
// has no API to delete/unsend a message the bot already sent, so this pushes a "ยกเลิกงาน" card
// instead -- mirrors api/notify-record-added.ts's shape. Silently no-ops (200, not an error)
// whenever this account isn't LINE-linked, since that's an expected, common state.
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

    const job = (req.body || {}).job;
    if (!job || typeof job.name !== 'string') {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    const message = buildJobDeletedMessage(job);
    const sent = await sendLineMessagePayload(lineUserId, message);
    res.status(200).json({ ok: sent });
  } catch (err: any) {
    console.error('notify-record-deleted error:', err);
    res.status(500).json({ error: err.message || 'แจ้งเตือนไม่สำเร็จ' });
  }
}

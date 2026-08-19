import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { buildJobSavedMessage, buildExpenseSavedMessage, JobCardData } from './_lineAssistant.js';
import { sendLineMessagePayload } from './_line.js';
import type { Expense } from '../src/types.js';

// Called from the web app itself (src/App.tsx's handleAddJob / handleAddExpense) right after
// saving a job or expense through the normal UI -- not the LINE bot or LIFF form. Mirrors the
// same "bank app" push notification those flows already send, so recording something in the web
// app also pings LINE in near-real-time. Silently no-ops (200, not an error) whenever this
// account isn't LINE-linked, since that's an expected, common state, not a failure.
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

    const body = req.body || {};
    const monthNet = typeof body.monthNet === 'number' ? body.monthNet : undefined;

    let message;
    if (body.kind === 'expense' && body.record) {
      message = buildExpenseSavedMessage(body.record as Expense, monthNet);
    } else if (body.kind === 'job' && body.record) {
      message = buildJobSavedMessage(body.record as JobCardData, monthNet);
    } else {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    const sent = await sendLineMessagePayload(lineUserId, message);
    res.status(200).json({ ok: sent });
  } catch (err: any) {
    console.error('notify-record-added error:', err);
    res.status(500).json({ error: err.message || 'แจ้งเตือนไม่สำเร็จ' });
  }
}

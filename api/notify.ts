import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import {
  buildGoalCreatedMessage,
  buildGoalTransactionMessage,
  buildJobSavedMessage,
  buildExpenseSavedMessage,
  buildJobDeletedMessage,
  buildExpenseDeletedMessage,
  JobCardData,
} from './_lineAssistant.js';
import { sendLineMessage, sendLineMessagePayload } from './_line.js';
import type { Expense } from '../src/types.js';

// Combines what used to be four separate best-effort "push to LINE" endpoints (goal events,
// record added, record deleted, line disconnected) into one, dispatched by body.event -- this
// project sits right at the Hobby plan's 12-Vercel-Function-per-deployment limit (every file in
// api/ maps to one function here since this isn't Next.js/SvelteKit), so four near-identical
// files each costing a function slot isn't sustainable. All four share the same shape: auth via
// Bearer token, look up notif_settings.lineUserId, no-op (200) if not linked, build a message,
// send it.
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

  const event = typeof req.body?.event === 'string' ? req.body.event : '';

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

    if (event === 'line-disconnected') {
      const sent = await sendLineMessage(
        lineUserId,
        '🔌 ยกเลิกการเชื่อมต่อ LINE กับกระรอกตุนเงินแล้วครับ\nจะไม่มีการแจ้งเตือนส่งเข้าช่องทางนี้อีก หากต้องการเชื่อมต่อใหม่ ไปที่หน้าตั้งค่าในแอปได้เลยครับ'
      );
      res.status(200).json({ ok: sent });
      return;
    }

    if (event === 'goal-event') {
      let message;
      if (body.kind === 'created' && body.goal && typeof body.goal.name === 'string') {
        message = buildGoalCreatedMessage(body.goal);
      } else if ((body.kind === 'deposit' || body.kind === 'withdraw') && body.goal && body.tx) {
        message = buildGoalTransactionMessage(body.goal, { ...body.tx, type: body.kind });
      } else {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }
      const sent = await sendLineMessagePayload(lineUserId, message);
      res.status(200).json({ ok: sent });
      return;
    }

    if (event === 'record-added') {
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
      return;
    }

    if (event === 'record-deleted') {
      const monthNet = typeof body.monthNet === 'number' ? body.monthNet : undefined;
      let message;
      if (body.kind === 'expense' && body.record && typeof body.record.name === 'string') {
        message = buildExpenseDeletedMessage(body.record, monthNet);
      } else if (body.kind === 'job' && body.record && typeof body.record.name === 'string') {
        message = buildJobDeletedMessage(body.record, monthNet);
      } else {
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }
      const sent = await sendLineMessagePayload(lineUserId, message);
      res.status(200).json({ ok: sent });
      return;
    }

    res.status(400).json({ error: 'Unknown event' });
  } catch (err: any) {
    console.error(`notify (${event}) error:`, err);
    res.status(500).json({ error: err.message || 'แจ้งเตือนไม่สำเร็จ' });
  }
}

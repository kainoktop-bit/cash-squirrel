import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  findUserByLineId,
  buildJobFromDraft,
  persistJob,
  buildJobSavedMessage,
  buildExpenseFromDraft,
  persistExpense,
  buildExpenseSavedMessage,
  JobDraft,
  ExpenseDraft,
} from './_lineAssistant.js';
import { sendLineMessagePayload } from './_line.js';

// Verifies the ID token the LIFF page got from liff.getIDToken() against LINE's own endpoint --
// never trust a userId sent directly by the client, since anyone could just type a different one
// into the request body. The signature check + audience (client_id) match here is what proves
// this request really came from that LINE user's LIFF session.
async function verifyLiffIdToken(idToken: string): Promise<string | null> {
  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) return null;
  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    if (!res.ok) {
      console.error('verifyLiffIdToken: LINE verify endpoint rejected token:', await res.text());
      return null;
    }
    const data = await res.json();
    return typeof data.sub === 'string' ? data.sub : null;
  } catch (err) {
    console.error('verifyLiffIdToken error:', err);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const idToken = typeof body.idToken === 'string' ? body.idToken : '';
  if (!idToken) {
    res.status(400).json({ error: 'ไม่พบข้อมูลยืนยันตัวตนจาก LINE' });
    return;
  }

  const lineUserId = await verifyLiffIdToken(idToken);
  if (!lineUserId) {
    res.status(401).json({ error: 'ยืนยันตัวตนไม่สำเร็จ กรุณาลองเปิดฟอร์มใหม่อีกครั้ง' });
    return;
  }

  let user;
  try {
    user = await findUserByLineId(lineUserId);
  } catch (err) {
    console.error('liff-submit: findUserByLineId failed:', err);
    res.status(500).json({ error: 'ระบบมีปัญหาชั่วคราว ลองใหม่อีกครั้งครับ' });
    return;
  }
  if (!user) {
    res.status(404).json({ error: 'บัญชี LINE นี้ยังไม่ได้เชื่อมต่อกับแอปกระรอกตุนเงิน กรุณาเชื่อมต่อในแอปก่อน' });
    return;
  }

  try {
    if (body.kind === 'expense') {
      const draft: ExpenseDraft = {
        name: typeof body.name === 'string' ? body.name.trim() : '',
        category: typeof body.category === 'string' ? body.category : '',
        amount: Number(body.amount) || 0,
      };
      if (!draft.name || !draft.amount) {
        res.status(400).json({ error: 'กรุณากรอกชื่อรายการและจำนวนเงินให้ครบถ้วน' });
        return;
      }
      const expense = buildExpenseFromDraft(draft);
      const ok = await persistExpense(user, expense);
      if (!ok) {
        res.status(500).json({ error: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
        return;
      }
      await sendLineMessagePayload(lineUserId, buildExpenseSavedMessage(expense));
      res.status(200).json({ ok: true });
      return;
    }

    const draft: JobDraft = {
      name: typeof body.name === 'string' ? body.name.trim() : '',
      client: typeof body.client === 'string' ? body.client.trim() : '',
      type: typeof body.type === 'string' ? body.type : undefined,
      value: Number(body.value) || 0,
      creditTerm: Number(body.creditTerm) || 0,
      paymentStatus: typeof body.paymentStatus === 'string' ? body.paymentStatus : 'pending',
      receivedAmount: body.receivedAmount != null ? Number(body.receivedAmount) : undefined,
    };
    if (!draft.name || !draft.value) {
      res.status(400).json({ error: 'กรุณากรอกชื่องานและมูลค่างานให้ครบถ้วน' });
      return;
    }
    const job = buildJobFromDraft(draft);
    const ok = await persistJob(user, job);
    if (!ok) {
      res.status(500).json({ error: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งครับ' });
      return;
    }
    await sendLineMessagePayload(lineUserId, buildJobSavedMessage(job));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('liff-submit handler error:', err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้งครับ' });
  }
}

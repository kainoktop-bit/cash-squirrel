import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from './_supabaseAdmin.js';

const FREE_TRIAL_DAYS = 30;

async function isProUser(userId: string, createdAt: string | undefined): Promise<boolean> {
  const isInFreeTrial = !!createdAt && new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 86400000 > Date.now();
  if (isInFreeTrial) return true;

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('current_period_end')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  return !!sub && new Date(sub.current_period_end).getTime() > Date.now();
}

interface VoiceJobFields {
  name?: string;
  client?: string;
  type?: string;
  value?: number;
  creditTerm?: number;
  note?: string;
  paymentStatus?: string;
  receivedAmount?: number;
  declined?: boolean;
}

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

  const pro = await isProUser(userResult.user.id, userResult.user.created_at);
  if (!pro) {
    res.status(403).json({ error: 'ฟีเจอร์นี้สำหรับสมาชิก Pro เท่านั้น' });
    return;
  }

  const { audioBase64, mimeType, priorFields, targetField, questionText } = (req.body || {}) as {
    audioBase64?: string;
    mimeType?: string;
    priorFields?: VoiceJobFields;
    targetField?: string;
    questionText?: string;
  };
  if (!audioBase64 || !mimeType) {
    res.status(400).json({ error: 'Missing audio data' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing GEMINI_API_KEY environment variable' });
    return;
  }

  // The wizard on the client asks about one field at a time, in a fixed order, so every
  // call here is "answering a specific question" -- give the model that context directly
  // instead of leaving it to guess which field the user meant to fill in.
  const contextBlock = targetField && questionText
    ? `\n\nบริบท: นี่เป็นการสนทนาแบบถามทีละข้อ ผู้ใช้เพิ่งถูกถามคำถามนี้: "${questionText}" (ซึ่งถามเกี่ยวกับฟิลด์ "${targetField}") คลิปเสียงนี้คือคำตอบของผู้ใช้ต่อคำถามนั้นโดยตรง ให้ตีความคำตอบในบริบทของคำถามนั้นเป็นหลัก (เช่นถ้าถามว่าได้รับเงินหรือยัง แล้วผู้ใช้ตอบแค่ "มัดจำมา 2000" ให้เข้าใจว่า paymentStatus เป็น partial และ receivedAmount เป็น 2000) แต่ถ้าผู้ใช้พูดข้อมูลฟิลด์อื่นแทรกมาด้วยโดยบังเอิญก็ให้ดึงออกมาด้วย
- ข้อมูลที่รู้แล้วจากรอบก่อนหน้า: ${JSON.stringify(priorFields || {})}
- ถ้าผู้ใช้ปฏิเสธหรือขอข้ามคำถามนี้อย่างชัดเจน (เช่น "ไม่มี", "ไม่ระบุ", "ข้าม", "ไม่ใส่", "ไม่รู้") ให้ตั้ง "declined" เป็น true`
    : '';

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `คุณเป็นผู้ช่วยกรอกฟอร์มบันทึกงานฟรีแลนซ์ในแอปกระรอกตุนเงิน ฟังคลิปเสียงภาษาไทยนี้ที่ผู้ใช้พูดอธิบายงานที่รับ แล้วแยกข้อมูลออกมาเป็น JSON ตาม schema ที่กำหนด${contextBlock}

กฎสำคัญ (สำคัญมาก ทำตามเป๊ะ ๆ):
- ถ้าข้อมูลไหนไม่ได้พูดถึงในคลิปเสียงนี้เลย ให้เว้นว่าง ("") หรือไม่ใส่ฟิลด์นั้นเลย ห้ามเดาหรือแต่งข้อมูลขึ้นเองเด็ดขาด ห้ามใส่ค่า default ใด ๆ
- "value" คือมูลค่างานเป็นตัวเลขบาทล้วน ๆ ถ้าไม่ได้พูดถึงมูลค่าเลยให้เว้นว่างไว้ (อย่าใส่ 0 ถ้าไม่ได้พูดถึง)
- "creditTerm" คือจำนวนวันเครดิตเทอมที่จะได้รับเงินหลังส่งงาน ถ้าพูดว่า "รับเงินทันที" ให้ใส่ 0, ถ้าไม่ได้พูดถึงเครดิตเทอมเลยให้เว้นว่างไว้
- "paymentStatus" ใส่ "paid" ถ้าจ่ายครบแล้ว, "partial" ถ้ามัดจำ/จ่ายมาบางส่วน, "pending" ถ้าพูดชัดเจนว่ายังไม่ได้จ่าย — แต่ถ้า**ไม่ได้พูดถึงเรื่องการจ่ายเงินเลยแม้แต่นิดเดียว** ให้เว้นว่าง ("") ห้ามเดาว่าเป็น pending เอง
- "receivedAmount" คือจำนวนเงินที่ได้รับแล้วจริงเป็นบาท (ถ้า paymentStatus เป็น paid ให้เท่ากับ value, ถ้า partial ใส่ยอดมัดจำที่พูดถึง)
- "note" ใส่รายละเอียดเพิ่มเติมที่พูดถึงแต่ไม่เข้าฟิลด์อื่น ๆ (ถ้ามี)`,
            },
            { inlineData: { data: audioBase64, mimeType } },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'ชื่องานหรือชื่อโปรเจกต์' },
            client: { type: 'STRING', description: 'ชื่อลูกค้าหรือแบรนด์' },
            type: { type: 'STRING', description: 'ประเภทงาน เช่น Sponsored Post, Video Production, Consulting / Advisory' },
            value: { type: 'NUMBER', description: 'มูลค่างานเป็นบาท เว้นว่างถ้าไม่ได้พูดถึง' },
            creditTerm: { type: 'NUMBER', description: 'จำนวนวันเครดิตเทอม เว้นว่างถ้าไม่ได้พูดถึง' },
            note: { type: 'STRING', description: 'รายละเอียดเพิ่มเติม' },
            paymentStatus: { type: 'STRING', description: '"paid" | "partial" | "pending" -- เว้นว่างถ้าไม่ได้พูดถึงเรื่องการจ่ายเงินเลย' },
            receivedAmount: { type: 'NUMBER', description: 'จำนวนเงินที่ได้รับแล้วจริงเป็นบาท' },
            declined: { type: 'BOOLEAN', description: 'true ถ้าผู้ใช้ปฏิเสธ/ขอข้ามคำถามล่าสุดอย่างชัดเจน' },
          },
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty response from Gemini');
    const parsed = JSON.parse(text);
    res.status(200).json(parsed);
  } catch (err: any) {
    console.error('parse-voice-job error:', err);
    res.status(500).json({ error: err.message || 'แปลงเสียงไม่สำเร็จ ลองอีกครั้งนะครับ' });
  }
}

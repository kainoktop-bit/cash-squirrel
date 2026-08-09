import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from './_supabaseAdmin.js';

const FREE_TRIAL_DAYS = 30;
const MAX_TURNS = 3; // hard cap so a confused model can't loop the user forever

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

  const { audioBase64, mimeType, priorFields, priorQuestion, turn } = (req.body || {}) as {
    audioBase64?: string;
    mimeType?: string;
    priorFields?: VoiceJobFields;
    priorQuestion?: string;
    turn?: number;
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

  const currentTurn = turn || 1;
  const isFollowUp = !!priorQuestion;

  const contextBlock = isFollowUp
    ? `\n\nนี่คือรอบสนทนาต่อเนื่อง ไม่ใช่รอบแรก:
- ข้อมูลที่รู้แล้วจากรอบก่อนหน้า: ${JSON.stringify(priorFields || {})}
- คำถามที่เพิ่งถามผู้ใช้ไปคือ: "${priorQuestion}"
- คลิปเสียงนี้คือคำตอบของผู้ใช้ต่อคำถามนั้น ให้เอาข้อมูลใหม่ไปรวมกับของเดิม (คงค่าฟิลด์เดิมไว้ถ้ารอบนี้ไม่ได้พูดถึงอีก อย่าล้างข้อมูลเดิมทิ้ง)`
    : '';

  const askForMore = currentTurn < MAX_TURNS
    ? `หลังรวมข้อมูลแล้ว เช็คว่า "value" (มูลค่างาน) และสถานะการจ่ายเงิน ("paymentStatus") รู้ครบหรือยัง ถ้ายังไม่รู้อย่างใดอย่างหนึ่ง ให้ถามคำถามสั้น ๆ เป็นกันเองภาษาไทยกลับไปหาผู้ใช้ใน "followUpQuestion" (ถามทีละเรื่องเดียวพอ อย่าถามรวดเดียวหลายเรื่อง) ถ้าทั้งสองอย่างรู้แล้ว หรือถือว่าข้อมูลพอจะบันทึกงานได้แล้ว ให้ "followUpQuestion" เป็นค่าว่าง ("")`
    : `นี่คือรอบสุดท้ายแล้ว ไม่ว่าข้อมูลจะครบหรือไม่ ให้ "followUpQuestion" เป็นค่าว่าง ("") เสมอ`;

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

กฎสำคัญ:
- ถ้าข้อมูลไหนไม่ได้พูดถึงในเสียงเลย (ทั้งรอบนี้และรอบก่อนหน้า) ให้เว้นว่าง ("") หรือใส่ 0 ห้ามเดาหรือแต่งข้อมูลขึ้นเองเด็ดขาด
- "value" คือมูลค่างานเป็นตัวเลขบาทล้วน ๆ (ไม่ใส่หน่วย ไม่ใส่คอมมา)
- "creditTerm" คือจำนวนวันเครดิตเทอมที่จะได้รับเงินหลังส่งงาน ถ้าพูดว่า "รับเงินทันที" หรือไม่ได้พูดถึงเครดิตเทอมเลย ให้ใส่ 0
- "paymentStatus" ใส่ "paid" ถ้าจ่ายครบแล้ว, "partial" ถ้ามัดจำ/จ่ายมาบางส่วน, "pending" ถ้ายังไม่ได้จ่ายเลยหรือไม่ได้พูดถึงเรื่องนี้
- "receivedAmount" คือจำนวนเงินที่ได้รับแล้วจริงเป็นบาท (ถ้า paymentStatus เป็น paid ให้เท่ากับ value, ถ้า partial ใส่ยอดมัดจำที่พูดถึง, ถ้า pending ใส่ 0)
- "note" ใส่รายละเอียดเพิ่มเติมที่พูดถึงแต่ไม่เข้าฟิลด์อื่น ๆ (ถ้ามี)
- ${askForMore}`,
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
            value: { type: 'NUMBER', description: 'มูลค่างานเป็นบาท' },
            creditTerm: { type: 'NUMBER', description: 'จำนวนวันเครดิตเทอม' },
            note: { type: 'STRING', description: 'รายละเอียดเพิ่มเติม' },
            paymentStatus: { type: 'STRING', description: '"paid" | "partial" | "pending"' },
            receivedAmount: { type: 'NUMBER', description: 'จำนวนเงินที่ได้รับแล้วจริงเป็นบาท' },
            followUpQuestion: { type: 'STRING', description: 'คำถามสั้น ๆ ถามข้อมูลที่ยังขาด หรือค่าว่างถ้าข้อมูลครบแล้ว' },
          },
          required: ['name'],
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

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

  const { audioBase64, mimeType } = (req.body || {}) as { audioBase64?: string; mimeType?: string };
  if (!audioBase64 || !mimeType) {
    res.status(400).json({ error: 'Missing audio data' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing GEMINI_API_KEY environment variable' });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `คุณเป็นผู้ช่วยกรอกฟอร์มบันทึกงานฟรีแลนซ์ในแอปกระรอกตุนเงิน ฟังคลิปเสียงภาษาไทยนี้ที่ผู้ใช้พูดอธิบายงานที่รับ แล้วแยกข้อมูลออกมาเป็น JSON ตาม schema ที่กำหนด

กฎสำคัญ:
- ถ้าข้อมูลไหนไม่ได้พูดถึงในเสียงเลย ให้เว้นว่าง ("") หรือใส่ 0 ห้ามเดาหรือแต่งข้อมูลขึ้นเองเด็ดขาด
- "value" คือมูลค่างานเป็นตัวเลขบาทล้วน ๆ (ไม่ใส่หน่วย ไม่ใส่คอมมา)
- "creditTerm" คือจำนวนวันเครดิตเทอมที่จะได้รับเงินหลังส่งงาน ถ้าพูดว่า "รับเงินทันที" หรือไม่ได้พูดถึงเครดิตเทอมเลย ให้ใส่ 0
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
            value: { type: 'NUMBER', description: 'มูลค่างานเป็นบาท' },
            creditTerm: { type: 'NUMBER', description: 'จำนวนวันเครดิตเทอม' },
            note: { type: 'STRING', description: 'รายละเอียดเพิ่มเติม' },
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

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

// Gemini's TTS returns headerless 16-bit PCM mono at 24kHz -- wrap it in a standard WAV
// header so the browser's <audio>/Audio() can play it directly with no client-side decoding.
function pcmToWavBase64(pcmBase64: string, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): string {
  const pcmBuffer = Buffer.from(pcmBase64, 'base64');
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buffer, 44);

  return buffer.toString('base64');
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

  const { text } = (req.body || {}) as { text?: string };
  if (!text) {
    res.status(400).json({ error: 'Missing text' });
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
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ role: 'user', parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!audioPart?.inlineData?.data) throw new Error('No audio returned from Gemini');

    const wavBase64 = pcmToWavBase64(audioPart.inlineData.data);
    res.status(200).json({ audioBase64: wavBase64 });
  } catch (err: any) {
    console.error('speak-text error:', err);
    res.status(500).json({ error: err.message || 'สร้างเสียงพูดไม่สำเร็จ' });
  }
}

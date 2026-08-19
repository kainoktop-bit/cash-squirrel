import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
}

// One-time setup helper, not part of the notification system itself: message the LINE
// Official Account and it replies with your LINE user ID, so you can copy it into the
// LINE_RECIPIENTS env var without digging through logs or building a real webhook consumer.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelSecret || !accessToken) {
    res.status(500).json({ error: 'Missing LINE_CHANNEL_SECRET or LINE_CHANNEL_ACCESS_TOKEN' });
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-line-signature'];
  const expectedSignature = crypto.createHmac('sha256', channelSecret).update(rawBody).digest('base64');
  if (typeof signature !== 'string' || signature !== expectedSignature) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  try {
    const body = JSON.parse(rawBody.toString('utf-8')) as { events?: LineEvent[] };
    const events = body.events || [];

    await Promise.all(
      events.map(async (event) => {
        if (event.type !== 'message' || !event.replyToken || event.source?.type !== 'user' || !event.source.userId) {
          return;
        }
        await fetch(LINE_REPLY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `LINE User ID ของคุณคือ:\n${event.source!.userId}\n\nคัดลอกไปตั้งค่าที่แอปได้เลยครับ` }],
          }),
        });
      })
    );

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('line-webhook handler error:', err);
    res.status(500).json({ error: err.message || 'Webhook handler failed' });
  }
}

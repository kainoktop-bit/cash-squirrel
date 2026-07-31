import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { stripe } from './_stripe.js';
import { supabaseAdmin } from './_supabaseAdmin.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

const RENEWAL_PERIOD_DAYS = 30;

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers['stripe-signature'];

  if (!webhookSecret || !signature) {
    res.status(400).json({ error: 'Missing webhook secret or signature' });
    return;
  }

  let event: Stripe.Event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, signature as string, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).json({ error: `Webhook Error: ${err.message}` });
    return;
  }

  try {
    // The Pro plan is a one-time monthly payment (paid manually each month, supports
    // PromptPay), not a Stripe subscription -- so we only care about completed one-time
    // Checkout Sessions here and extend access by RENEWAL_PERIOD_DAYS from now.
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;

      if (userId && session.mode === 'payment' && session.payment_status === 'paid') {
        const currentPeriodEnd = new Date(Date.now() + RENEWAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);

        await supabaseAdmin.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_customer_id: (session.customer as string) || null,
            stripe_subscription_id: null,
            status: 'active',
            plan: 'pro_monthly',
            current_period_end: currentPeriodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('stripe-webhook handler error:', err);
    res.status(500).json({ error: err.message || 'Webhook handler failed' });
  }
}

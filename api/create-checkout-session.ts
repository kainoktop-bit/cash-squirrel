import type { VercelRequest, VercelResponse } from '@vercel/node';
import { stripe } from './_stripe';

const TRIAL_PERIOD_DAYS = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { userId, email } = req.body || {};
  if (!userId || !email) {
    res.status(400).json({ error: 'Missing userId or email' });
    return;
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    res.status(500).json({ error: 'Server is not configured with STRIPE_PRICE_ID' });
    return;
  }

  try {
    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: userId,
      customer_email: email,
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: { userId },
      },
      metadata: { userId },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('create-checkout-session error:', err);
    res.status(500).json({ error: err.message || 'Failed to create checkout session' });
  }
}

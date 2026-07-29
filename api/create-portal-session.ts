import type { VercelRequest, VercelResponse } from '@vercel/node';
import { stripe } from './_stripe';
import { supabaseAdmin } from './_supabaseAdmin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { userId } = req.body || {};
  if (!userId) {
    res.status(400).json({ error: 'Missing userId' });
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data?.stripe_customer_id) {
      res.status(404).json({ error: 'No subscription found for this account yet' });
      return;
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${origin}/`,
    });

    res.status(200).json({ url: portalSession.url });
  } catch (err: any) {
    console.error('create-portal-session error:', err);
    res.status(500).json({ error: err.message || 'Failed to create portal session' });
  }
}

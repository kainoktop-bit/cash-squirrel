import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendGmailEmail } from './_gmail.js';

// TEMPORARY diagnostic endpoint -- checking whether this app's own Gmail SMTP account (used for
// the daily/monthly report emails) is actually able to send right now, since a banned/suspended
// Gmail account was raised as a possible cause behind users being unable to sign up (a SEPARATE
// concern -- Supabase Auth's own confirmation emails go through whatever SMTP is configured in
// the Supabase dashboard, which this app's code has no visibility into -- but this at least
// answers the half we CAN check from here). Sends one real test email. Remove after use.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const to = typeof req.query.to === 'string' ? req.query.to : '';
  if (!to) {
    res.status(400).json({ error: 'Pass ?to=<email>' });
    return;
  }

  const hasCreds = !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASSWORD;
  if (!hasCreds) {
    res.status(200).json({ hasCreds: false, sent: false, note: 'GMAIL_USER/GMAIL_APP_PASSWORD not set at all' });
    return;
  }

  const sent = await sendGmailEmail(to, 'Gmail SMTP test - กระรอกตุนเงิน', '<p>Test email -- if you received this, Gmail sending is working.</p>');
  res.status(200).json({ hasCreds: true, gmailUser: process.env.GMAIL_USER, sent });
}

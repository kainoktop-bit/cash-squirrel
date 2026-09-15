import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';

// TEMPORARY diagnostic endpoint -- checking whether monthlyReportEnabled has the same
// silently-reverted-to-off problem dailyDigestEnabled just had. Sanitized booleans/dates only,
// no financial data. Delete once confirmed either way.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const email = typeof req.query.email === 'string' ? req.query.email : '';
  if (!email) {
    res.status(400).json({ error: 'Pass ?email=' });
    return;
  }

  try {
    const { data: row, error } = await supabaseAdmin
      .from('user_cashflow_data')
      .select('notif_settings')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      res.status(404).json({ error: 'No row for that email' });
      return;
    }

    const notifSettings = row.notif_settings || {};
    res.status(200).json({
      dailyDigestEnabled: !!notifSettings.dailyDigestEnabled,
      lastDigestSentDate: notifSettings.lastDigestSentDate || null,
      monthlyReportEnabled: !!notifSettings.monthlyReportEnabled,
      lastMonthlyReportSentMonth: notifSettings.lastMonthlyReportSentMonth || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
}

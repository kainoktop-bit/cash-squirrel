import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';

// TEMPORARY diagnostic endpoint -- created to figure out why api/send-overdue-digest.ts silently
// sent nothing today for a specific account, when other LINE pushes were confirmed still working.
// Returns only small sanitized booleans/counts, never raw job/financial data. Delete this file
// (and its route) once the digest bug is actually found and fixed -- it is not meant to stay.
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
      .select('user_id, email, jobs, notif_settings')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      res.status(404).json({ error: 'No row for that email' });
      return;
    }

    const notifSettings = row.notif_settings || {};
    const jobs: any[] = row.jobs || [];

    const { data: subs } = await supabaseAdmin
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', row.user_id)
      .eq('status', 'active');

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id);

    const now = new Date();
    const bangkokTodayStr = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

    function diffDaysFromToday(targetDateStr: string): number {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(targetDateStr + 'T00:00:00');
      return Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    const attention = jobs
      .map((j) => {
        const targetDateStr = j.dueDate || j.payDate;
        if (!(j.pending > 0) || !targetDateStr) return null;
        const diffDays = diffDaysFromToday(targetDateStr);
        if (diffDays > 2) return null;
        return { id: j.id, diffDays };
      })
      .filter((j) => j !== null);

    res.status(200).json({
      nowUtc: now.toISOString(),
      bangkokTodayStr,
      userId: row.user_id,
      accountCreatedAt: authUser?.user?.created_at || null,
      hasActiveSub: (subs || []).length > 0,
      dailyDigestEnabled: !!notifSettings.dailyDigestEnabled,
      lastDigestSentDate: notifSettings.lastDigestSentDate || null,
      hasAlertEmail: !!notifSettings.alertEmail,
      hasLineUserId: !!notifSettings.lineUserId,
      totalJobsCount: jobs.length,
      jobsNeedingAttentionCount: attention.length,
      jobsNeedingAttention: attention,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
}

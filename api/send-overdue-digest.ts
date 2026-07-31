import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';

const FREE_TRIAL_DAYS = 30;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'กระรอกตุนเงิน <onboarding@resend.dev>';

interface JobRow {
  id: string;
  name: string;
  client: string;
  status: string;
  pending: number;
  paymentStatus?: string;
  dueDate?: string | null;
  payDate: string | null;
  followUpCount?: number;
  lastFollowUpDate?: string;
}

interface StatusOptionRow {
  id: string;
  behavior: 'done' | 'partial' | 'pending';
}

interface NotifSettingsRow {
  enabled?: boolean;
  alertEmail?: string;
  dailyDigestEnabled?: boolean;
  lastDigestSentDate?: string;
  pendingQueue?: unknown[];
}

// Bangkok is UTC+7 with no DST; a fixed offset is enough to get "today" right locally.
function todayInBangkok(): string {
  const now = new Date();
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bangkok.toISOString().split('T')[0];
}

function findOverdueJobs(jobs: JobRow[], statuses: StatusOptionRow[]): JobRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return jobs.filter((j) => {
    const statusOpt = statuses.find((s) => s.id === j.status);
    const behavior = statusOpt ? statusOpt.behavior : 'pending';
    const isUnpaid = behavior !== 'done' && j.pending > 0 && j.paymentStatus !== 'paid';

    const targetDateStr = j.dueDate || j.payDate;
    if (!isUnpaid || !targetDateStr) return false;

    const targetDate = new Date(targetDateStr + 'T00:00:00');
    const diffDays = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays <= -1;
  });
}

function daysOverdue(job: JobRow): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDateStr = job.dueDate || job.payDate!;
  const targetDate = new Date(targetDateStr + 'T00:00:00');
  return Math.abs(Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
}

function buildDigestHtml(jobs: JobRow[]): string {
  const rows = jobs
    .map(
      (j) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;">${escapeHtml(j.client || 'ไม่ระบุ')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;">${escapeHtml(j.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;text-align:right;">฿${j.pending.toLocaleString('th-TH')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;text-align:right;color:#A63F1B;">เลย ${daysOverdue(j)} วัน</td>
    </tr>`
    )
    .join('');

  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#3D2314;">
    <h2 style="color:#E65F2B;">สรุปงานค้างชำระเลยกำหนด (${jobs.length} รายการ)</h2>
    <p>ระบบตรวจพบดีลงานที่เลยกำหนดเครดิตเทอมแล้วยังไม่ได้รับเงินครบ ลองติดต่อทวงถามลูกค้าได้เลยครับ</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#FDF6EC;">
          <th style="padding:8px 12px;text-align:left;">ลูกค้า</th>
          <th style="padding:8px 12px;text-align:left;">งาน</th>
          <th style="padding:8px 12px;text-align:right;">ยอดค้าง</th>
          <th style="padding:8px 12px;text-align:right;">สถานะ</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#7A5C43;font-size:12px;margin-top:24px;">อีเมลนี้ส่งอัตโนมัติจากกระรอกตุนเงิน ปิดการแจ้งเตือนได้ที่หน้าตั้งค่าระบบในแอป</p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function sendDigestEmail(to: string, jobs: JobRow[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing RESEND_API_KEY environment variable');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject: `สรุปงานค้างชำระเลยกำหนด ${jobs.length} รายการ - กระรอกตุนเงิน`,
      html: buildDigestHtml(jobs),
    }),
  });

  return res.ok;
}

async function listAllAuthUsers(): Promise<Map<string, string>> {
  const createdAtByUserId = new Map<string, string>();
  let page = 1;
  const perPage = 200;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const u of data.users) {
      createdAtByUserId.set(u.id, u.created_at);
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return createdAtByUserId;
}

function isPro(
  userId: string,
  createdAtByUserId: Map<string, string>,
  activeSubByUserId: Map<string, { current_period_end: string }>
): boolean {
  const createdAt = createdAtByUserId.get(userId);
  const isInFreeTrial = !!createdAt && new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 86400000 > Date.now();

  const sub = activeSubByUserId.get(userId);
  const isPaidActive = !!sub && new Date(sub.current_period_end).getTime() > Date.now();

  return isInFreeTrial || isPaidActive;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const [{ data: rows, error: rowsErr }, { data: subs, error: subsErr }, createdAtByUserId] = await Promise.all([
      supabaseAdmin.from('user_cashflow_data').select('user_id, email, jobs, statuses, notif_settings'),
      supabaseAdmin.from('subscriptions').select('user_id, status, current_period_end').eq('status', 'active'),
      listAllAuthUsers(),
    ]);

    if (rowsErr) throw rowsErr;
    if (subsErr) throw subsErr;

    const activeSubByUserId = new Map((subs || []).map((s) => [s.user_id, { current_period_end: s.current_period_end }]));

    const todayStr = todayInBangkok();
    let processed = 0;
    let sent = 0;
    let skipped = 0;

    for (const row of rows || []) {
      processed += 1;
      const notifSettings: NotifSettingsRow = row.notif_settings || {};

      if (!isPro(row.user_id, createdAtByUserId, activeSubByUserId)) {
        skipped += 1;
        continue;
      }
      if (!notifSettings.dailyDigestEnabled) {
        skipped += 1;
        continue;
      }
      if (notifSettings.lastDigestSentDate === todayStr) {
        skipped += 1;
        continue;
      }

      try {
        const jobs: JobRow[] = row.jobs || [];
        const statuses: StatusOptionRow[] = row.statuses || [];
        const overdueJobs = findOverdueJobs(jobs, statuses);

        if (overdueJobs.length === 0) {
          skipped += 1;
          continue;
        }

        const recipient = notifSettings.alertEmail || row.email;
        if (!recipient) {
          skipped += 1;
          continue;
        }

        const ok = await sendDigestEmail(recipient, overdueJobs);
        if (!ok) {
          skipped += 1;
          continue;
        }

        const updatedJobs = jobs.map((j) =>
          overdueJobs.some((o) => o.id === j.id)
            ? { ...j, followUpCount: (j.followUpCount || 0) + 1, lastFollowUpDate: todayStr }
            : j
        );

        await supabaseAdmin
          .from('user_cashflow_data')
          .update({
            jobs: updatedJobs,
            notif_settings: { ...notifSettings, lastDigestSentDate: todayStr },
          })
          .eq('user_id', row.user_id);

        sent += 1;
      } catch (perUserErr: any) {
        console.error(`send-overdue-digest: failed for user ${row.user_id}:`, perUserErr);
        skipped += 1;
      }
    }

    res.status(200).json({ processed, sent, skipped });
  } catch (err: any) {
    console.error('send-overdue-digest handler error:', err);
    res.status(500).json({ error: err.message || 'Digest job failed' });
  }
}

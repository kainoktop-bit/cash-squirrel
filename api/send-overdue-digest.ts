import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendGmailEmail } from './_gmail.js';
import { sendLineMessageToEmail } from './_line.js';

const FREE_TRIAL_DAYS = 30;

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
  lineUserId?: string;
}

// Bangkok is UTC+7 with no DST; a fixed offset is enough to get "today" right locally.
function todayInBangkok(): string {
  const now = new Date();
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return bangkok.toISOString().split('T')[0];
}

// How many days until (positive) or since (negative) the job's due date. 0 = due today.
function diffDaysFromToday(targetDateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(targetDateStr + 'T00:00:00');
  return Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface JobWithDiff extends JobRow {
  diffDays: number;
}

// Overdue jobs, jobs due today, and jobs due within the next 2 days -- catching it a day or two
// early is far more useful than only finding out once it's already overdue.
function findJobsNeedingAttention(jobs: JobRow[], statuses: StatusOptionRow[]): JobWithDiff[] {
  return jobs
    .map((j) => {
      const statusOpt = statuses.find((s) => s.id === j.status);
      const behavior = statusOpt ? statusOpt.behavior : 'pending';
      const isUnpaid = behavior !== 'done' && j.pending > 0 && j.paymentStatus !== 'paid';

      const targetDateStr = j.dueDate || j.payDate;
      if (!isUnpaid || !targetDateStr) return null;

      const diffDays = diffDaysFromToday(targetDateStr);
      if (diffDays > 2) return null;
      return { ...j, diffDays };
    })
    .filter((j): j is JobWithDiff => j !== null);
}

function dueLabel(diffDays: number): string {
  if (diffDays < 0) return `เลยกำหนดมาแล้ว ${Math.abs(diffDays)} วัน`;
  if (diffDays === 0) return 'ครบกำหนดวันนี้';
  return `อีก ${diffDays} วัน`;
}

function buildJobRows(jobs: JobWithDiff[], dateColor: string): string {
  return jobs
    .map(
      (j) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;">${escapeHtml(j.client || 'ไม่ระบุ')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;">${escapeHtml(j.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;text-align:right;">฿${j.pending.toLocaleString('th-TH')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #E8DFD3;text-align:right;color:${dateColor};font-weight:bold;">${dueLabel(j.diffDays)}</td>
    </tr>`
    )
    .join('');
}

function buildSection(title: string, badgeBg: string, badgeColor: string, jobs: JobWithDiff[], dateColor: string): string {
  if (jobs.length === 0) return '';
  return `
    <div style="margin-top:20px;">
      <span style="display:inline-block;background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:bold;padding:4px 10px;border-radius:6px;">${title} (${jobs.length} รายการ)</span>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">
        <thead>
          <tr style="background:#FDF6EC;">
            <th style="padding:8px 12px;text-align:left;">ลูกค้า</th>
            <th style="padding:8px 12px;text-align:left;">งาน</th>
            <th style="padding:8px 12px;text-align:right;">ยอดค้าง</th>
            <th style="padding:8px 12px;text-align:right;">กำหนดชำระ</th>
          </tr>
        </thead>
        <tbody>${buildJobRows(jobs, dateColor)}</tbody>
      </table>
    </div>`;
}

function buildDigestHtml(jobs: JobWithDiff[]): string {
  const overdue = jobs.filter((j) => j.diffDays < 0);
  const dueToday = jobs.filter((j) => j.diffDays === 0);
  const dueSoon = jobs.filter((j) => j.diffDays > 0);

  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#3D2314;">
    <span style="display:inline-block;background:#FEF2F2;color:#DC2626;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:6px;">OVERDUE CREDIT ALERT</span>
    <h2 style="color:#E65F2B;margin:12px 0 4px;">🚨 สรุปดีลงานที่ต้องติดตามเครดิตเทอม</h2>
    <p style="margin-top:0;">ระบบตรวจพบดีลงานที่เลยกำหนด ครบกำหนดวันนี้ หรือใกล้ครบกำหนดใน 1-2 วัน ลองติดต่อทวงถามลูกค้าล่วงหน้าได้เลยครับ</p>

    ${buildSection('⚠️ เกินกำหนดชำระเงินแล้ว', '#FEF2F2', '#DC2626', overdue, '#DC2626')}
    ${buildSection('⏰ ครบกำหนดวันนี้', '#FEF9E7', '#B45309', dueToday, '#B45309')}
    ${buildSection('📅 ใกล้ครบกำหนด (1-2 วัน)', '#EEF2FF', '#4338CA', dueSoon, '#4338CA')}

    <div style="margin-top:24px;padding:16px;background:#FDF6EC;border-radius:12px;">
      <p style="font-size:12px;font-weight:bold;color:#3D2314;margin:0 0 8px;">💡 คำแนะนำในการดำเนินการทวงถาม</p>
      <ol style="font-size:12px;color:#7A5C43;margin:0;padding-left:18px;line-height:1.7;">
        <li>เปิดแอปธนาคารหรือเช็คสเตทเมนต์ของคุณ เพื่อยืนยันว่าไม่มียอดดังกล่าวโอนเข้ามาจริง ๆ</li>
        <li>ทักไปทวงถามลูกค้าอย่างสุภาพ พร้อมแนบใบแจ้งหนี้หรือหลักฐานงานที่ส่งไปแล้ว</li>
        <li>บันทึกไว้ในแอปทันทีที่ได้รับเงิน เพื่อให้ระบบหยุดแจ้งเตือนรายการนั้น</li>
      </ol>
    </div>

    <p style="color:#7A5C43;font-size:12px;margin-top:24px;">อีเมลนี้ส่งอัตโนมัติจากกระรอกตุนเงิน ปิดการแจ้งเตือนได้ที่หน้าตั้งค่าระบบในแอป</p>
  </div>`;
}

// Condensed plain-text version for LINE -- same info as the email, no HTML.
function buildDigestLineText(jobs: JobWithDiff[]): string {
  const overdue = jobs.filter((j) => j.diffDays < 0);
  const dueToday = jobs.filter((j) => j.diffDays === 0);
  const dueSoon = jobs.filter((j) => j.diffDays > 0);

  const lines: string[] = ['🚨 สรุปดีลงานที่ต้องติดตามเครดิตเทอม', ''];

  const addSection = (title: string, section: JobWithDiff[]) => {
    if (section.length === 0) return;
    lines.push(`${title} (${section.length} รายการ)`);
    for (const j of section) {
      lines.push(`• ${j.client || 'ไม่ระบุ'} - ${j.name} - ฿${j.pending.toLocaleString('th-TH')} (${dueLabel(j.diffDays)})`);
    }
    lines.push('');
  };

  addSection('⚠️ เกินกำหนดชำระเงินแล้ว', overdue);
  addSection('⏰ ครบกำหนดวันนี้', dueToday);
  addSection('📅 ใกล้ครบกำหนด (1-2 วัน)', dueSoon);

  lines.push('เปิดแอปกระรอกตุนเงินเพื่อดูรายละเอียด');
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function sendDigestEmail(to: string, jobs: JobWithDiff[]): Promise<boolean> {
  const overdueCount = jobs.filter((j) => j.diffDays < 0).length;
  const subject = overdueCount > 0
    ? `สรุปงานค้างชำระเลยกำหนด ${overdueCount} รายการ - กระรอกตุนเงิน`
    : `สรุปดีลงานที่ใกล้ครบกำหนดชำระเงิน ${jobs.length} รายการ - กระรอกตุนเงิน`;
  return sendGmailEmail(to, subject, buildDigestHtml(jobs));
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
  res.setHeader('Cache-Control', 'no-store');
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
        const attentionJobs = findJobsNeedingAttention(jobs, statuses);

        if (attentionJobs.length === 0) {
          skipped += 1;
          continue;
        }

        const recipient = notifSettings.alertEmail || row.email;
        if (!recipient) {
          skipped += 1;
          continue;
        }

        const ok = await sendDigestEmail(recipient, attentionJobs);
        if (!ok) {
          skipped += 1;
          continue;
        }

        // Best-effort, doesn't affect the email flow's success/failure -- an unmapped
        // email or a LINE API hiccup just means no LINE message this time.
        if (row.email) {
          sendLineMessageToEmail(row.email, buildDigestLineText(attentionJobs), notifSettings.lineUserId).catch((err) =>
            console.error(`send-overdue-digest: LINE send failed for ${row.email}:`, err)
          );
        }

        // Only count genuinely overdue items as a "follow-up" -- a heads-up for something due
        // in 1-2 days isn't a follow-up attempt yet.
        const overdueIds = new Set(attentionJobs.filter((j) => j.diffDays < 0).map((j) => j.id));
        const updatedJobs = jobs.map((j) =>
          overdueIds.has(j.id)
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

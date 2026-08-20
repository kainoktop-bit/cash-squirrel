import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { sendGmailEmail } from './_gmail.js';
import { sendLineMessageToEmail } from './_line.js';
import { formatMonthKey } from '../src/utils.js';
import {
  JobRow,
  ExpenseRow,
  GoalRow,
  SettingsRow,
  MonthlySummary,
  nowInBangkok,
  jobsInMonth,
  expensesInMonth,
  computeMonthlySummary,
  formatCurrency,
} from './_monthlySummary.js';

const FREE_TRIAL_DAYS = 30;

interface NotifSettingsRow {
  alertEmail?: string;
  monthlyReportEnabled?: boolean;
  lastMonthlyReportSentMonth?: string;
  lineUserId?: string;
  [key: string]: unknown;
}

// The month this cron should report on: the previous calendar month relative to Bangkok "today".
function targetMonthKey(): string {
  const bkk = nowInBangkok();
  const d = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildReportHtml(monthLabel: string, s: MonthlySummary): string {
  const totalExpense = s.fixedExpenseCalculated + s.variableExpense;
  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#3D2314;">
    <span style="display:inline-block;background:#ECFDF5;color:#059669;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:6px;">MONTHLY FINANCIAL REPORT</span>
    <h2 style="color:#059669;margin:12px 0 4px;">สรุปงบกระแสเงินสดรอบเดือน ${monthLabel}</h2>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <tr>
        <td style="width:50%;padding:16px;background:#ECFDF5;border-radius:12px 0 0 12px;text-align:center;">
          <div style="font-size:11px;color:#059669;font-weight:bold;">รายรับจริง (RECEIVED)</div>
          <div style="font-size:22px;color:#047857;font-weight:900;margin-top:4px;">${formatCurrency(s.received)}</div>
        </td>
        <td style="width:50%;padding:16px;background:#FEF2F2;border-radius:0 12px 12px 0;text-align:center;">
          <div style="font-size:11px;color:#DC2626;font-weight:bold;">รายจ่ายจริง (EXPENSES)</div>
          <div style="font-size:22px;color:#B91C1C;font-weight:900;margin-top:4px;">${formatCurrency(totalExpense)}</div>
        </td>
      </tr>
    </table>
    <div style="margin-top:12px;padding:16px;background:#EEF2FF;border-radius:12px;text-align:center;">
      <div style="font-size:11px;color:#4338CA;font-weight:bold;">กระแสเงินสดสุทธิคงเหลือ (NET CASH FLOW)</div>
      <div style="font-size:26px;color:#3730A3;font-weight:900;margin-top:4px;">${formatCurrency(Math.max(0, s.netFlow))}</div>
    </div>
    <div style="margin-top:20px;padding:16px;background:#FDF6EC;border-radius:12px;">
      <div style="font-size:12px;font-weight:bold;color:#3D2314;margin-bottom:8px;">รายละเอียดการเงินแยกตามส่วน</div>
      <table style="width:100%;font-size:13px;">
        <tr><td style="padding:4px 0;color:#7A5C43;">มูลค่ารวมสัญญาดีลทั้งหมด</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${formatCurrency(s.income)}</td></tr>
        <tr><td style="padding:4px 0;color:#7A5C43;">ยอดโอนรับแล้วจริง</td><td style="padding:4px 0;text-align:right;font-weight:bold;color:#059669;">${formatCurrency(s.received)}</td></tr>
        <tr><td style="padding:4px 0;color:#7A5C43;">หัก ค่าใช้จ่ายคงที่รายเดือน</td><td style="padding:4px 0;text-align:right;font-weight:bold;color:#DC2626;">${formatCurrency(s.fixedExpenseCalculated)}</td></tr>
        <tr><td style="padding:4px 0;color:#7A5C43;">ค่าใช้จ่ายผันแปร</td><td style="padding:4px 0;text-align:right;font-weight:bold;color:#DC2626;">${formatCurrency(s.variableExpense)}</td></tr>
        <tr><td style="padding:4px 0;color:#7A5C43;">ยอดออมสะสมโดยประมาณ</td><td style="padding:4px 0;text-align:right;font-weight:bold;">${formatCurrency(s.actualSavings)}</td></tr>
      </table>
    </div>
    <p style="color:#7A5C43;font-size:12px;margin-top:24px;">แนบไฟล์ Excel สรุปรายรับ-รายจ่ายของเดือนนี้มาด้วยแล้ว ตัวเลขชุดนี้คำนวณจากข้อมูลเดียวกับที่แสดงในแอปกระรอกตุนเงินเสมอ ปิดการแจ้งเตือนได้ที่หน้ารายงานในแอป</p>
  </div>`;
}

// Condensed plain-text version for LINE -- same numbers as the email, no HTML/attachment.
function buildReportLineText(monthLabel: string, s: MonthlySummary): string {
  const totalExpense = s.fixedExpenseCalculated + s.variableExpense;
  return [
    `📊 สรุปงบกระแสเงินสดรอบเดือน ${monthLabel}`,
    '',
    `รายรับจริง: ${formatCurrency(s.received)}`,
    `รายจ่ายจริง: ${formatCurrency(totalExpense)}`,
    `กระแสเงินสดสุทธิคงเหลือ: ${formatCurrency(Math.max(0, s.netFlow))}`,
    '',
    'รายละเอียด:',
    `• มูลค่ารวมสัญญาดีลทั้งหมด: ${formatCurrency(s.income)}`,
    `• ยอดโอนรับแล้วจริง: ${formatCurrency(s.received)}`,
    `• หัก ค่าใช้จ่ายคงที่รายเดือน: ${formatCurrency(s.fixedExpenseCalculated)}`,
    `• ค่าใช้จ่ายผันแปร: ${formatCurrency(s.variableExpense)}`,
    `• ยอดออมสะสมโดยประมาณ: ${formatCurrency(s.actualSavings)}`,
    '',
    'ไฟล์ Excel ฉบับเต็มส่งไปในอีเมลแล้ว เปิดแอปกระรอกตุนเงินเพื่อดูรายละเอียดเพิ่มเติม',
  ].join('\n');
}

// Same 3-sheet shape as the Tax tab's Excel export (src/components/TaxTab.tsx handleExportExcel),
// scoped to just the target month instead of a whole tax year.
function buildMonthlyExcelBase64(monthLabel: string, s: MonthlySummary, jobs: JobRow[], expenses: ExpenseRow[]): string {
  const summaryRows: (string | number)[][] = [
    [`สรุปงบกระแสเงินสดรอบเดือน ${monthLabel}`, ''],
    ['มูลค่ารวมสัญญาดีลทั้งหมด', s.income],
    ['ยอดโอนรับแล้วจริง', s.received],
    ['หัก ค่าใช้จ่ายคงที่รายเดือน', s.fixedExpenseCalculated],
    ['ค่าใช้จ่ายผันแปร', s.variableExpense],
    ['กระแสเงินสดสุทธิคงเหลือ', Math.max(0, s.netFlow)],
    ['ยอดออมสะสมโดยประมาณ', s.actualSavings]
  ];

  const incomeHeaders = [
    'ชื่อโปรเจกต์', 'ประเภทงาน', 'ลูกค้า', 'มูลค่ารวม (บาท)', 'หัก ณ ที่จ่าย (%)',
    'จำนวนภาษีหัก ณ ที่จ่าย (บาท)', 'ยอดได้รับแล้ว (บาท)', 'ยอดค้างชำระ (บาท)',
    'สถานะโครงการ', 'เครดิตเทอม (วัน)', 'วันเริ่มงาน', 'วันดีล/วันเผยแพร่', 'กำหนดชำระเงิน', 'หมายเหตุ'
  ];
  const incomeRows = jobs.map((j) => {
    let statusText = j.status;
    if (j.status === 'done') statusText = 'จ่ายแล้ว';
    else if (j.status === 'partial') statusText = 'มัดจำ/จ่ายบางส่วน';
    else if (j.status === 'pending') statusText = 'ยังไม่จ่าย';
    return [
      j.name, j.type || 'ทั่วไป', j.client || '-', j.value || 0, j.whtRate || 0,
      j.whtAmount || 0, j.received || 0, j.pending || 0, statusText || '-',
      j.creditTerm || 0, j.startDate || '-', j.postDate || '-', j.payDate || '-', j.note || ''
    ];
  });

  const expenseHeaders = ['ชื่อรายการ', 'หมวดหมู่', 'จำนวนเงิน (บาท)', 'วันที่', 'หมายเหตุ'];
  const expenseRows = expenses.map((e) => [e.name || '-', e.category || '-', e.amount || 0, e.date || '-', e.note || '']);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'สรุปเดือน');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([incomeHeaders, ...incomeRows]), 'รายรับ');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([expenseHeaders, ...expenseRows]), 'รายจ่าย');

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

async function sendReportEmail(
  to: string,
  monthLabel: string,
  summary: MonthlySummary,
  excelBase64: string
): Promise<boolean> {
  return sendGmailEmail(
    to,
    `[กระรอกตุนเงิน] สรุปงบกระแสเงินสดรอบเดือน ${monthLabel}`,
    buildReportHtml(monthLabel, summary),
    [
      {
        filename: `บัญชีเดือน_${monthLabel.replace(/\s+/g, '_')}_กระรอกตุนเงิน.xlsx`,
        content: excelBase64,
      },
    ]
  );
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
    const monthKey = targetMonthKey();
    const monthLabel = formatMonthKey(monthKey);

    const [{ data: rows, error: rowsErr }, { data: subs, error: subsErr }, createdAtByUserId] = await Promise.all([
      supabaseAdmin.from('user_cashflow_data').select('user_id, email, jobs, goals, settings, expenses, notif_settings'),
      supabaseAdmin.from('subscriptions').select('user_id, status, current_period_end').eq('status', 'active'),
      listAllAuthUsers(),
    ]);

    if (rowsErr) throw rowsErr;
    if (subsErr) throw subsErr;

    const activeSubByUserId = new Map((subs || []).map((s) => [s.user_id, { current_period_end: s.current_period_end }]));

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
      if (!notifSettings.monthlyReportEnabled) {
        skipped += 1;
        continue;
      }
      if (notifSettings.lastMonthlyReportSentMonth === monthKey) {
        skipped += 1;
        continue;
      }

      try {
        const jobs: JobRow[] = row.jobs || [];
        const expenses: ExpenseRow[] = row.expenses || [];
        const goals: GoalRow[] = row.goals || [];
        const settings: SettingsRow = row.settings || {};

        const summary = computeMonthlySummary(jobs, expenses, goals, settings, monthKey);

        if (summary.received === 0 && summary.variableExpense === 0) {
          skipped += 1;
          continue;
        }

        const recipient = notifSettings.alertEmail || row.email;
        if (!recipient) {
          skipped += 1;
          continue;
        }

        const monthJobs = jobsInMonth(jobs, monthKey);
        const monthExpenses = expensesInMonth(expenses, monthKey);

        const excelBase64 = buildMonthlyExcelBase64(monthLabel, summary, monthJobs, monthExpenses);

        const ok = await sendReportEmail(recipient, monthLabel, summary, excelBase64);
        if (!ok) {
          skipped += 1;
          continue;
        }

        // Best-effort, doesn't affect the email flow's success/failure -- an unmapped
        // email or a LINE API hiccup just means no LINE message this time.
        if (row.email) {
          sendLineMessageToEmail(row.email, buildReportLineText(monthLabel, summary), notifSettings.lineUserId).catch((err) =>
            console.error(`send-monthly-report: LINE send failed for ${row.email}:`, err)
          );
        }

        await supabaseAdmin
          .from('user_cashflow_data')
          .update({
            notif_settings: { ...notifSettings, lastMonthlyReportSentMonth: monthKey },
          })
          .eq('user_id', row.user_id);

        sent += 1;
      } catch (perUserErr: any) {
        console.error(`send-monthly-report: failed for user ${row.user_id}:`, perUserErr);
        skipped += 1;
      }
    }

    res.status(200).json({ processed, sent, skipped, monthKey });
  } catch (err: any) {
    console.error('send-monthly-report handler error:', err);
    res.status(500).json({ error: err.message || 'Monthly report job failed' });
  }
}

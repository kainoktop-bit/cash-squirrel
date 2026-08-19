import { supabaseAdmin } from './_supabaseAdmin.js';
import { calculatePayDate, getRelativeDaysText, getThaiMonthName } from '../src/utils.js';
import type { Expense } from '../src/types.js';
import type { LineMessage } from './_line.js';
import {
  JobRow,
  ExpenseRow,
  GoalRow,
  SettingsRow,
  currentMonthKey,
  previousMonthKey,
  computeMonthlySummary,
  formatCurrency,
} from './_monthlySummary.js';

// No AI/Gemini calls anywhere in this file by design -- adding a job/expense is a fully
// deterministic step-by-step questionnaire (one field at a time, simple keyword/number parsing),
// and everything else is fixed Quick Reply commands. This traded away free-form natural-language
// understanding on purpose: the Gemini free tier kept hitting rate limits under real testing, and
// the user chose reliability over flexibility for now.

interface StatusRow {
  id: string;
  label: string;
  behavior: 'done' | 'partial' | 'pending';
}

type JobStep = 'name' | 'client' | 'value' | 'creditTerm' | 'paymentStatus' | 'receivedAmount';
type ExpenseStep = 'name' | 'category' | 'amount';

interface PendingJobState {
  draft: JobDraft;
  step: JobStep;
}

interface PendingExpenseState {
  draft: ExpenseDraft;
  step: ExpenseStep;
}

interface NotifSettingsRow {
  lineUserId?: string;
  lineLinkCode?: string;
  lineLinkCodeExpiresAt?: string;
  linePendingJob?: PendingJobState | null;
  linePendingExpense?: PendingExpenseState | null;
  [key: string]: unknown;
}

interface UserRow {
  user_id: string;
  email?: string;
  jobs?: JobRow[];
  goals?: GoalRow[];
  settings?: SettingsRow;
  expenses?: ExpenseRow[];
  statuses?: StatusRow[];
  notif_settings?: NotifSettingsRow;
}

interface JobDraft {
  name?: string;
  client?: string;
  type?: string;
  value?: number;
  creditTerm?: number;
  paymentStatus?: string; // 'paid' | 'partial' | 'pending'
  receivedAmount?: number;
  note?: string;
}

interface ExpenseDraft {
  name?: string;
  category?: string;
  amount?: number;
  note?: string;
}

// Mirrors ExpenseRecordView.tsx's EXPENSE_CATEGORIES -- kept in sync manually since one lives in
// the web app's UI and the other is shown as a numbered pick-list in LINE.
const EXPENSE_CATEGORIES = [
  'ค่าอุปกรณ์/ซอฟต์แวร์',
  'ค่าโฆษณา/ยิงแอด',
  'ค่าเดินทาง/น้ำมัน',
  'อาหาร/รับรองลูกค้า',
  'จ้างงานต่อ (Outsource)',
  'ภาษี/ธรรมเนียม',
  'ค่าบริการ/สาธารณูปโภค',
  'อื่นๆ',
];

// Throws on a genuine Supabase/query error (caller must not treat that the same as "not
// linked" -- doing so once told an already-linked user their account wasn't found, which reads
// as the bot lying). Only a real empty result means "not linked", so the caller can fall back
// to the link-code flow.
async function findUserByLineId(lineUserId: string): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin
    .from('user_cashflow_data')
    .select('user_id, email, jobs, goals, settings, expenses, statuses, notif_settings')
    .eq('notif_settings->>lineUserId', lineUserId)
    .maybeSingle();
  if (error) {
    console.error('findUserByLineId error:', error);
    throw new Error(`findUserByLineId: ${error.message}`);
  }
  return (data as UserRow) || null;
}

interface DataSnapshot {
  wip: { name: string; client: string; value: number }[];
  unpaid: { name: string; client: string; pending: number; dueText: string }[];
  overdue: { name: string; client: string; pending: number; overdueText: string }[];
  dueToday: { name: string; client: string; pending: number }[];
  thisMonth: ReturnType<typeof computeMonthlySummary> & { monthKey: string };
  lastMonth: ReturnType<typeof computeMonthlySummary> & { monthKey: string };
  totalPendingAllTime: number;
}

// All the deterministic math lives here in plain JS -- matches the app's own formulas exactly
// (via computeMonthlySummary), so answers can't drift from what the app itself shows.
function buildDataSnapshot(user: UserRow): DataSnapshot {
  const jobs = user.jobs || [];
  const statuses = user.statuses || [];
  const isUnpaidBehavior = (statusId: string) => statusBehavior(statuses, statusId) !== 'done';

  const wip = jobs
    .filter((j) => j.isPosted === false)
    .map((j) => ({ name: j.name, client: j.client || '', value: j.value || 0 }));

  const unpaidJobs = jobs.filter((j) => (j.pending || 0) > 0 && isUnpaidBehavior(j.status || ''));
  const unpaid = unpaidJobs.map((j) => {
    const dateStr = j.dueDate || j.payDate;
    return { name: j.name, client: j.client || '', pending: j.pending || 0, dueText: dateStr ? getRelativeDaysText(dateStr).text : 'ไม่ระบุวันครบกำหนด' };
  });

  const overdue = unpaidJobs
    .filter((j) => {
      const dateStr = j.dueDate || j.payDate;
      return dateStr ? getRelativeDaysText(dateStr).isOverdue : false;
    })
    .map((j) => {
      const rel = getRelativeDaysText(j.dueDate || j.payDate);
      return { name: j.name, client: j.client || '', pending: j.pending || 0, overdueText: rel.text };
    });

  const dueToday = unpaidJobs
    .filter((j) => {
      const dateStr = j.dueDate || j.payDate;
      return dateStr ? getRelativeDaysText(dateStr).text === 'วันนี้' : false;
    })
    .map((j) => ({ name: j.name, client: j.client || '', pending: j.pending || 0 }));

  const thisMonthKey = currentMonthKey();
  const lastMonthKey = previousMonthKey();
  const thisMonth = { ...computeMonthlySummary(jobs, user.expenses || [], user.goals || [], user.settings || {}, thisMonthKey), monthKey: thisMonthKey };
  const lastMonth = { ...computeMonthlySummary(jobs, user.expenses || [], user.goals || [], user.settings || {}, lastMonthKey), monthKey: lastMonthKey };

  const totalPendingAllTime = unpaidJobs.reduce((sum, j) => sum + (j.pending || 0), 0);

  return { wip, unpaid, overdue, dueToday, thisMonth, lastMonth, totalPendingAllTime };
}

// Tappable shortcuts (LINE Quick Reply) -- every one of these is answered deterministically,
// zero AI calls involved anywhere in this flow.
const QUICK_REPLY: import('./_line.js').LineQuickReply = {
  items: [
    { type: 'action', action: { type: 'message', label: '➕ เพิ่มงาน', text: 'เพิ่มงาน' } },
    { type: 'action', action: { type: 'message', label: '➕ เพิ่มรายจ่าย', text: 'เพิ่มรายจ่าย' } },
    { type: 'action', action: { type: 'message', label: '📋 งานค้างจ่าย', text: 'งานค้างจ่าย' } },
    { type: 'action', action: { type: 'message', label: '📊 สรุปเดือนนี้', text: 'สรุปเดือนนี้' } },
    { type: 'action', action: { type: 'message', label: '📦 งานสต็อก', text: 'งานสต็อก' } },
  ],
};

function withQuickReply(message: LineMessage): LineMessage {
  return { ...message, quickReply: QUICK_REPLY };
}

function formatUnpaidQuickReply(snapshot: DataSnapshot): string {
  if (snapshot.unpaid.length === 0) return '🎉 ตอนนี้ไม่มีงานค้างจ่ายเลยครับ';
  const lines = snapshot.unpaid.map((j) => `💸 ${j.name}${j.client ? ` (${j.client})` : ''}\n   ค้าง ${formatCurrency(j.pending)} • กำหนดชำระ ${j.dueText}`);
  return ['📋 งานที่ยังไม่จ่ายทั้งหมด', '', ...lines, '', `รวมค้างรับทั้งหมด: ${formatCurrency(snapshot.totalPendingAllTime)}`].join('\n');
}

function formatThisMonthQuickReply(snapshot: DataSnapshot): string {
  const s = snapshot.thisMonth;
  return [
    `📊 สรุปเดือนนี้ (${s.monthKey})`,
    '',
    `💰 รับแล้วจริง: ${formatCurrency(s.received)}`,
    `💸 รายจ่ายรวม: ${formatCurrency(s.fixedExpenseCalculated + s.variableExpense)}`,
    `📈 กระแสเงินสดสุทธิ: ${formatCurrency(s.netFlow)}`,
    `🐿️ ยอดออมสะสมโดยประมาณ: ${formatCurrency(s.actualSavings)}`,
  ].join('\n');
}

function formatWipQuickReply(snapshot: DataSnapshot): string {
  if (snapshot.wip.length === 0) return '📦 ตอนนี้ไม่มีงานในสต็อก (ยังไม่โพสต์) เลยครับ';
  const lines = snapshot.wip.map((j) => `📦 ${j.name}${j.client ? ` (${j.client})` : ''}\n   มูลค่า ${formatCurrency(j.value)}`);
  return ['📦 งานที่ยังไม่โพสต์ (สต็อกงาน)', '', ...lines].join('\n');
}

const QUICK_ACTIONS: Record<string, (snapshot: DataSnapshot) => string> = {
  งานค้างจ่าย: formatUnpaidQuickReply,
  สรุปเดือนนี้: formatThisMonthQuickReply,
  งานสต็อก: formatWipQuickReply,
};

const HELP_TEXT = [
  '🐿️ ไม่เข้าใจคำสั่งนี้ครับ ลองกดปุ่มด้านล่าง หรือพิมพ์:',
  '➕ "เพิ่มงาน" เพื่อบันทึกรายรับ',
  '➕ "เพิ่มรายจ่าย" เพื่อบันทึกรายจ่าย',
  '📋 "งานค้างจ่าย"',
  '📊 "สรุปเดือนนี้"',
  '📦 "งานสต็อก"',
].join('\n');

// Pulls the first number out of free text ("5000", "5,000 บาท", "ห้าพัน" -- no, just digits).
function parseNumber(text: string): number | null {
  const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : null;
}

const JOB_STEP_PROMPTS: Record<JobStep, string> = {
  name: '📝 ชื่องาน/โปรเจกต์อะไรครับ',
  client: '👤 ลูกค้าชื่ออะไรครับ (ถ้าไม่มีพิมพ์ "-")',
  value: '💰 มูลค่างานเท่าไหร่ครับ (พิมพ์ตัวเลข เช่น 5000)',
  creditTerm: '📅 เครดิตเทอมกี่วันครับ (พิมพ์ 0 ถ้าได้เงินทันที)',
  paymentStatus: 'ได้รับเงินแล้วหรือยังครับ?\n1) จ่ายครบแล้ว\n2) มัดจำบางส่วน\n3) ยังไม่จ่าย\n(พิมพ์ 1, 2 หรือ 3)',
  receivedAmount: '💵 มัดจำมาแล้วกี่บาทครับ',
};

const JOB_STEP_ORDER: JobStep[] = ['name', 'client', 'value', 'creditTerm', 'paymentStatus'];

const EXPENSE_STEP_PROMPTS: Record<ExpenseStep, string> = {
  name: '📝 ชื่อรายการรายจ่ายอะไรครับ',
  category: `📂 เลือกหมวดหมู่ครับ (พิมพ์ตัวเลข)\n${EXPENSE_CATEGORIES.map((c, i) => `${i + 1}) ${c}`).join('\n')}`,
  amount: '💰 จำนวนเงินเท่าไหร่ครับ (พิมพ์ตัวเลข)',
};

const EXPENSE_STEP_ORDER: ExpenseStep[] = ['name', 'category', 'amount'];

async function updateNotifSettings(userId: string, notifSettings: NotifSettingsRow): Promise<void> {
  const { error } = await supabaseAdmin.from('user_cashflow_data').update({ notif_settings: notifSettings }).eq('user_id', userId);
  if (error) console.error('updateNotifSettings error:', error);
}

async function savePendingJob(user: UserRow, state: PendingJobState): Promise<void> {
  const notifSettings: NotifSettingsRow = user.notif_settings || {};
  await updateNotifSettings(user.user_id, { ...notifSettings, linePendingJob: state });
}

async function clearPendingJob(user: UserRow): Promise<void> {
  const notifSettings: NotifSettingsRow = { ...(user.notif_settings || {}) };
  delete notifSettings.linePendingJob;
  await updateNotifSettings(user.user_id, notifSettings);
}

async function savePendingExpense(user: UserRow, state: PendingExpenseState): Promise<void> {
  const notifSettings: NotifSettingsRow = user.notif_settings || {};
  await updateNotifSettings(user.user_id, { ...notifSettings, linePendingExpense: state });
}

async function clearPendingExpense(user: UserRow): Promise<void> {
  const notifSettings: NotifSettingsRow = { ...(user.notif_settings || {}) };
  delete notifSettings.linePendingExpense;
  await updateNotifSettings(user.user_id, notifSettings);
}

// Builds a real Job record the same way JobsTab.tsx's add-job form does (WHT is not captured
// via chat, so it's left at 0 -- editable in-app afterward same as any other field).
function buildJobFromDraft(draft: JobDraft): JobRow & { id: string; client: string; note: string; postDate: string; isPosted: boolean } {
  const today = (() => {
    const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
  })();

  const valueNum = draft.value || 0;
  const creditTerm = draft.creditTerm ?? 0;
  let status: string = 'pending';
  let received = 0;
  if (draft.paymentStatus === 'paid') {
    status = 'done';
    received = valueNum;
  } else if (draft.paymentStatus === 'partial') {
    status = 'partial';
    received = draft.receivedAmount || 0;
  }
  const pending = Math.max(0, valueNum - received);
  const payDate = calculatePayDate(today, creditTerm, false);

  return {
    id: `job-line-${Date.now()}`,
    name: draft.name || 'งานใหม่จาก LINE',
    type: draft.type || 'ยังไม่ระบุ',
    client: draft.client || '',
    value: valueNum,
    received,
    pending,
    status,
    creditTerm,
    postDate: today,
    isPosted: true,
    payDate,
    note: draft.note || '',
  };
}

async function persistJob(user: UserRow, job: ReturnType<typeof buildJobFromDraft>): Promise<boolean> {
  const jobs = [...(user.jobs || []), job];
  const { error } = await supabaseAdmin.from('user_cashflow_data').update({ jobs }).eq('user_id', user.user_id);
  if (error) {
    console.error('persistJob error:', error);
    return false;
  }
  return true;
}

// Bangkok "20 ส.ค. 2569 00:18" style timestamp, matching what people expect from a receipt card.
function formatThaiTimestamp(): string {
  const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const day = bkk.getUTCDate();
  const month = getThaiMonthName(bkk.getUTCMonth(), true);
  const year = bkk.getUTCFullYear() + 543;
  const hh = String(bkk.getUTCHours()).padStart(2, '0');
  const mm = String(bkk.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hh}:${mm}`;
}

// A simple label-left / value-right row, like a bank transfer receipt statement.
function buildStatementRow(label: string, value: string, opts?: { size?: string; color?: string; bold?: boolean }) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#7A5C43', flex: 2, gravity: 'center' },
      { type: 'text', text: value, size: opts?.size || 'sm', color: opts?.color || '#3D2314', weight: opts?.bold === false ? 'regular' : 'bold', flex: 3, align: 'end', wrap: true },
    ],
  };
}

// Squirrel-branded Flex "receipt" card shown right after a job is saved -- styled like a bank
// transfer notification (big amount up top, clean label/value rows below) since that's the
// clearest, most familiar shape for this kind of confirmation. Falls back to a plain-text
// summary when APP_URL isn't configured (no working deep link yet).
function buildJobSavedMessage(job: ReturnType<typeof buildJobFromDraft>): LineMessage {
  const statusLabel = job.status === 'done' ? 'จ่ายครบแล้ว' : job.status === 'partial' ? 'ได้รับมัดจำแล้ว' : 'ยังไม่ได้รับเงิน';
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    const lines = [
      'บันทึกงานสำเร็จแล้วครับ! ✅',
      '',
      `ชื่องาน: ${job.name}`,
      ...(job.client ? [`ลูกค้า: ${job.client}`] : []),
      `มูลค่า: ${formatCurrency(job.value)}`,
      `สถานะ: ${statusLabel}`,
      ...(job.pending > 0 ? [`ยอดค้างรับ: ${formatCurrency(job.pending)}`] : []),
    ];
    return { type: 'text', text: lines.join('\n') };
  }

  const contents = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FBF2E4',
      paddingAll: '20px',
      spacing: 'md',
      contents: [
        buildStatementRow('รับเงิน', `+${formatCurrency(job.value)}`, { size: 'xxl', color: '#0E9F6E' }),
        { type: 'separator', margin: 'md', color: '#E8DFD3' },
        buildStatementRow('ชื่องาน', job.name, { bold: false }),
        ...(job.client ? [buildStatementRow('ลูกค้า', job.client, { bold: false })] : []),
        buildStatementRow('สถานะ', statusLabel, { bold: false }),
        ...(job.pending > 0 ? [buildStatementRow('ค้างรับ', formatCurrency(job.pending), { bold: false, color: '#C17817' })] : []),
        buildStatementRow('วันที่ทำรายการ', formatThaiTimestamp(), { bold: false }),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#E65F2B',
          action: { type: 'uri', label: 'เปิดดูในเว็บ', uri: `${appUrl.replace(/\/$/, '')}/?job=${encodeURIComponent(job.id)}` },
        },
      ],
    },
  };

  return { type: 'flex', altText: `บันทึกงาน "${job.name}" สำเร็จแล้วครับ`, contents };
}

async function saveDraftNow(user: UserRow, draft: JobDraft): Promise<LineMessage> {
  const job = buildJobFromDraft(draft);
  const ok = await persistJob(user, job);
  if (!ok) return { type: 'text', text: 'บันทึกงานไม่สำเร็จครับ ลองใหม่อีกครั้ง หรือบันทึกผ่านแอปแทนได้เลยครับ' };
  await clearPendingJob(user);
  return buildJobSavedMessage(job);
}

// Builds a real Expense record the same way ExpenseRecordView.tsx's add-expense form does.
function buildExpenseFromDraft(draft: ExpenseDraft): Expense {
  const today = (() => {
    const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
  })();

  return {
    id: `expense-line-${Date.now()}`,
    name: draft.name || 'รายจ่ายจาก LINE',
    category: draft.category || 'อื่นๆ',
    amount: draft.amount || 0,
    date: today,
    note: draft.note || '',
  };
}

async function persistExpense(user: UserRow, expense: Expense): Promise<boolean> {
  const expenses = [...(user.expenses || []), expense];
  const { error } = await supabaseAdmin.from('user_cashflow_data').update({ expenses }).eq('user_id', user.user_id);
  if (error) {
    console.error('persistExpense error:', error);
    return false;
  }
  return true;
}

// Same squirrel-branded Flex "receipt" style as the job-saved card, but in the app's rust/clay
// accent (--pink-acc in src/index.css) instead of acorn orange, so income vs expense reads apart
// at a glance. No specific-record deep link yet (only jobs support ?job=<id> in App.tsx), so the
// button just opens the app.
function buildExpenseSavedMessage(expense: Expense): LineMessage {
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    const lines = ['บันทึกรายจ่ายสำเร็จแล้วครับ! 🧾', '', `รายการ: ${expense.name}`, `หมวด: ${expense.category}`, `จำนวน: ${formatCurrency(expense.amount)}`, `วันที่: ${expense.date}`];
    return { type: 'text', text: lines.join('\n') };
  }

  const contents = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FBF2E4',
      paddingAll: '20px',
      spacing: 'md',
      contents: [
        buildStatementRow('จ่ายเงิน', `-${formatCurrency(expense.amount)}`, { size: 'xxl', color: '#A63F1B' }),
        { type: 'separator', margin: 'md', color: '#E8DFD3' },
        buildStatementRow('รายการ', expense.name, { bold: false }),
        buildStatementRow('หมวด', expense.category, { bold: false }),
        buildStatementRow('วันที่ทำรายการ', formatThaiTimestamp(), { bold: false }),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#A63F1B',
          action: { type: 'uri', label: 'เปิดแอป', uri: appUrl.replace(/\/$/, '') },
        },
      ],
    },
  };

  return { type: 'flex', altText: `บันทึกรายจ่าย "${expense.name}" สำเร็จแล้วครับ`, contents };
}

async function saveExpenseDraftNow(user: UserRow, draft: ExpenseDraft): Promise<LineMessage> {
  const expense = buildExpenseFromDraft(draft);
  const ok = await persistExpense(user, expense);
  if (!ok) return { type: 'text', text: 'บันทึกรายจ่ายไม่สำเร็จครับ ลองใหม่อีกครั้ง หรือบันทึกผ่านแอปแทนได้เลยครับ' };
  await clearPendingExpense(user);
  return buildExpenseSavedMessage(expense);
}

function statusBehavior(statuses: StatusRow[], statusId: string): 'done' | 'partial' | 'pending' {
  return statuses.find((s) => s.id === statusId)?.behavior || 'pending';
}

const CANCEL_KEYWORDS = ['ยกเลิก', 'cancel', 'ไม่เอาแล้ว', 'เริ่มใหม่'];

// Advances the job-entry questionnaire by exactly one step given the answer to the step it's
// currently on. Returns either a follow-up prompt (still collecting) or the final saved message.
async function advanceJobStep(user: UserRow, pending: PendingJobState, trimmed: string): Promise<LineMessage> {
  const draft: JobDraft = { ...pending.draft };
  const step = pending.step;

  if (step === 'name') {
    if (!trimmed) return { type: 'text', text: JOB_STEP_PROMPTS.name };
    draft.name = trimmed;
  } else if (step === 'client') {
    draft.client = trimmed === '-' || /^(ไม่มี|ไม่ระบุ|ข้าม)$/.test(trimmed) ? '' : trimmed;
  } else if (step === 'value') {
    const n = parseNumber(trimmed);
    if (n == null) return { type: 'text', text: 'กรุณาพิมพ์เป็นตัวเลขครับ เช่น 5000' };
    draft.value = n;
  } else if (step === 'creditTerm') {
    const n = parseNumber(trimmed);
    if (n == null) return { type: 'text', text: 'กรุณาพิมพ์เป็นตัวเลขครับ เช่น 0 หรือ 30' };
    draft.creditTerm = n;
  } else if (step === 'paymentStatus') {
    if (/(^|\D)1(\D|$)|ครบ|จ่ายแล้ว|paid/i.test(trimmed)) {
      draft.paymentStatus = 'paid';
    } else if (/(^|\D)2(\D|$)|มัดจำ|บางส่วน|partial/i.test(trimmed)) {
      draft.paymentStatus = 'partial';
    } else if (/(^|\D)3(\D|$)|ยังไม่|ค้าง|pending/i.test(trimmed)) {
      draft.paymentStatus = 'pending';
    } else {
      return { type: 'text', text: JOB_STEP_PROMPTS.paymentStatus };
    }
  } else if (step === 'receivedAmount') {
    const n = parseNumber(trimmed);
    if (n == null) return { type: 'text', text: 'กรุณาพิมพ์เป็นตัวเลขครับ เช่น 1000' };
    draft.receivedAmount = n;
    return await saveDraftNow(user, draft);
  }

  if (step === 'paymentStatus' && draft.paymentStatus === 'partial') {
    await savePendingJob(user, { draft, step: 'receivedAmount' });
    return { type: 'text', text: JOB_STEP_PROMPTS.receivedAmount };
  }
  if (step === 'paymentStatus') {
    return await saveDraftNow(user, draft);
  }

  const nextIdx = JOB_STEP_ORDER.indexOf(step) + 1;
  const next = JOB_STEP_ORDER[nextIdx];
  await savePendingJob(user, { draft, step: next });
  return { type: 'text', text: JOB_STEP_PROMPTS[next] };
}

async function advanceExpenseStep(user: UserRow, pending: PendingExpenseState, trimmed: string): Promise<LineMessage> {
  const draft: ExpenseDraft = { ...pending.draft };
  const step = pending.step;

  if (step === 'name') {
    if (!trimmed) return { type: 'text', text: EXPENSE_STEP_PROMPTS.name };
    draft.name = trimmed;
  } else if (step === 'category') {
    const n = parseInt(trimmed, 10);
    if (Number.isInteger(n) && n >= 1 && n <= EXPENSE_CATEGORIES.length) {
      draft.category = EXPENSE_CATEGORIES[n - 1];
    } else if (trimmed) {
      draft.category = trimmed;
    } else {
      return { type: 'text', text: EXPENSE_STEP_PROMPTS.category };
    }
  } else if (step === 'amount') {
    const n = parseNumber(trimmed);
    if (n == null) return { type: 'text', text: 'กรุณาพิมพ์เป็นตัวเลขครับ เช่น 500' };
    draft.amount = n;
    return await saveExpenseDraftNow(user, draft);
  }

  const nextIdx = EXPENSE_STEP_ORDER.indexOf(step) + 1;
  const next = EXPENSE_STEP_ORDER[nextIdx];
  await savePendingExpense(user, { draft, step: next });
  return { type: 'text', text: EXPENSE_STEP_PROMPTS[next] };
}

// Entry point called from api/line-webhook.ts. Returns null when this LINE user isn't linked
// to any app account yet, so the caller can fall back to the link-code flow. Every non-null
// reply gets the Quick Reply shortcuts attached so they're always one tap away.
export async function handleAssistantMessage(lineUserId: string, text: string): Promise<LineMessage | null> {
  const result = await handleAssistantMessageInner(lineUserId, text);
  return result ? withQuickReply(result) : null;
}

async function handleAssistantMessageInner(lineUserId: string, text: string): Promise<LineMessage | null> {
  let user: UserRow | null;
  try {
    user = await findUserByLineId(lineUserId);
  } catch (err) {
    // A real query error, not "this LINE user isn't linked" -- must never fall through to the
    // link-code flow, since that would wrongly tell an already-linked user they aren't linked.
    console.error('handleAssistantMessage: findUserByLineId failed:', err);
    return { type: 'text', text: 'ขอโทษครับ ระบบมีปัญหาชั่วคราวตอนนี้ ลองพิมพ์คำถามใหม่อีกครั้งครับ' };
  }
  if (!user) return null;

  const notifSettings: NotifSettingsRow = user.notif_settings || {};
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (QUICK_ACTIONS[trimmed]) {
    const snapshot = buildDataSnapshot(user);
    return { type: 'text', text: QUICK_ACTIONS[trimmed](snapshot) };
  }

  if (trimmed === 'เพิ่มงาน') {
    await savePendingJob(user, { draft: {}, step: 'name' });
    return { type: 'text', text: JOB_STEP_PROMPTS.name };
  }

  if (trimmed === 'เพิ่มรายจ่าย') {
    await savePendingExpense(user, { draft: {}, step: 'name' });
    return { type: 'text', text: EXPENSE_STEP_PROMPTS.name };
  }

  if (notifSettings.linePendingJob) {
    if (CANCEL_KEYWORDS.some((k) => lower.includes(k))) {
      await clearPendingJob(user);
      return { type: 'text', text: 'ยกเลิกการบันทึกงานแล้วครับ' };
    }
    return await advanceJobStep(user, notifSettings.linePendingJob, trimmed);
  }

  if (notifSettings.linePendingExpense) {
    if (CANCEL_KEYWORDS.some((k) => lower.includes(k))) {
      await clearPendingExpense(user);
      return { type: 'text', text: 'ยกเลิกการบันทึกรายจ่ายแล้วครับ' };
    }
    return await advanceExpenseStep(user, notifSettings.linePendingExpense, trimmed);
  }

  return { type: 'text', text: HELP_TEXT };
}

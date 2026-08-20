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

// No AI/Gemini calls anywhere in this file by design, and no chat-based add-job/add-expense
// questionnaire either -- that flow was removed in favor of the LIFF form (api/liff-submit.ts),
// which has a proper multi-field UI and can't leave someone stuck mid-conversation answering the
// wrong question. Everything here is either a fixed Quick Reply command or a friendly fallback.

interface StatusRow {
  id: string;
  label: string;
  behavior: 'done' | 'partial' | 'pending';
}

interface NotifSettingsRow {
  lineUserId?: string;
  lineLinkCode?: string;
  lineLinkCodeExpiresAt?: string;
  [key: string]: unknown;
}

export interface UserRow {
  user_id: string;
  email?: string;
  jobs?: JobRow[];
  goals?: GoalRow[];
  settings?: SettingsRow;
  expenses?: ExpenseRow[];
  statuses?: StatusRow[];
  notif_settings?: NotifSettingsRow;
}

export interface JobDraft {
  name?: string;
  client?: string;
  type?: string;
  value?: number;
  creditTerm?: number;
  paymentStatus?: string; // 'paid' | 'partial' | 'pending'
  receivedAmount?: number;
  whtRate?: number; // หัก ณ ที่จ่าย % -- 0 unless the caller (e.g. the LIFF form) sets it
  note?: string;
}

export interface ExpenseDraft {
  name?: string;
  category?: string;
  amount?: number;
  note?: string;
}

// Throws on a genuine Supabase/query error (caller must not treat that the same as "not
// linked" -- doing so once told an already-linked user their account wasn't found, which reads
// as the bot lying). Only a real empty result means "not linked", so the caller can fall back
// to the link-code flow.
export async function findUserByLineId(lineUserId: string): Promise<UserRow | null> {
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
// zero AI calls involved anywhere in this flow. The form button only appears once LIFF_ID is
// configured (api/liff-submit.ts). It deliberately opens a LIFF page rather than deep-linking
// into the web app's own Supabase-session-based UI: a LIFF page verifies identity from the LINE
// session itself (via an ID token, checked server-side), so it always saves to the account this
// LINE user is linked to -- no separate login, and no risk of landing in whatever account
// happens to be logged into the browser on that device.
function getQuickReply(): import('./_line.js').LineQuickReply {
  const liffId = process.env.LIFF_ID;
  const items: import('./_line.js').LineQuickReply['items'] = [];
  if (liffId) {
    items.push({ type: 'action', action: { type: 'uri', label: '📝 ฟอร์มบันทึก', uri: `https://liff.line.me/${liffId}` } });
  }
  items.push(
    { type: 'action', action: { type: 'message', label: '📋 งานค้างจ่าย', text: 'งานค้างจ่าย' } },
    { type: 'action', action: { type: 'message', label: '📊 สรุปเดือนนี้', text: 'สรุปเดือนนี้' } },
    { type: 'action', action: { type: 'message', label: '📦 งานสต็อก', text: 'งานสต็อก' } }
  );
  return { items: items.slice(0, 13) };
}

function withQuickReply(message: LineMessage): LineMessage {
  return { ...message, quickReply: getQuickReply() };
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
    `📈 กระแสเงินสดสุทธิ: ${formatCurrency(Math.max(0, s.netFlow))}`,
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

// Shown for literally anything that isn't one of the 3 Quick Reply query commands -- a greeting,
// a random question, or anything else. Since there's no more pending chat flow to get stuck in,
// this is always a safe, friendly fallback rather than a leftover mid-conversation prompt.
const HELP_TEXT = [
  '🐿️ สวัสดีครับ! กระรอกตุนเงินพร้อมช่วยดูแลเงินให้แล้วครับ',
  'กดปุ่มด้านล่างได้เลย:',
  '📝 ฟอร์มบันทึก - เพิ่มงานหรือรายจ่ายใหม่',
  '📋 งานค้างจ่าย',
  '📊 สรุปเดือนนี้',
  '📦 งานสต็อก',
].join('\n');

// Builds a real Job record the same way JobsTab.tsx's add-job form does (WHT is not captured
// via chat, so it's left at 0 -- editable in-app afterward same as any other field).
export function buildJobFromDraft(draft: JobDraft): JobRow & { id: string; client: string; note: string; postDate: string; isPosted: boolean } {
  const today = (() => {
    const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, '0')}-${String(bkk.getUTCDate()).padStart(2, '0')}`;
  })();

  const valueNum = draft.value || 0;
  const creditTerm = draft.creditTerm ?? 0;
  // Same formula as JobsTab.tsx's add-job form: whtAmount deducted from value first, then
  // "received" for a fully-paid job is the NET amount after tax, matching what actually lands
  // in the bank -- not the gross contract value.
  const whtRate = draft.whtRate || 0;
  const whtAmount = Math.round(valueNum * (whtRate / 100));
  const netReceivable = valueNum - whtAmount;
  let status: string = 'pending';
  let received = 0;
  if (draft.paymentStatus === 'paid') {
    status = 'done';
    received = netReceivable;
  } else if (draft.paymentStatus === 'partial') {
    status = 'partial';
    received = draft.receivedAmount || 0;
  }
  const pending = Math.max(0, netReceivable - received);
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
    whtRate,
    whtAmount,
    postDate: today,
    isPosted: true,
    payDate,
    note: draft.note || '',
  };
}

export async function persistJob(user: UserRow, job: ReturnType<typeof buildJobFromDraft>): Promise<boolean> {
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

// Minimal shape buildJobSavedMessage actually needs -- looser than buildJobFromDraft's return
// type so api/notify-record-added.ts can hand it a plain Job object straight from the web app
// (src/types.ts's Job satisfies this structurally) without going through the draft/chat flow.
export interface JobCardData {
  id: string;
  name: string;
  client: string;
  value: number;
  pending?: number;
  status?: string;
  whtRate?: number;
  whtAmount?: number;
  isPosted?: boolean; // false = "สต็อกเตรียมผลิต" (WIP), same flag as JobsTab.tsx's formIsPosted
}

// Squirrel-branded Flex "receipt" card shown right after a job is saved -- styled like a bank
// transfer notification (big amount up top, clean label/value rows below) since that's the
// clearest, most familiar shape for this kind of confirmation. Falls back to a plain-text
// summary when APP_URL isn't configured (no working deep link yet). monthNet, when given, adds
// a running "คงเหลือเดือนนี้" line -- receivedAfterVariableExpense from computeMonthlySummary
// (received minus already-logged variable expenses, not netFlow), matching the Dashboard's
// "คงเหลือหลังหักรายจ่าย" figure. Computed by the caller so this stays a pure display function.
export function buildJobSavedMessage(job: JobCardData, monthNet?: number): LineMessage {
  const isWip = job.isPosted === false;
  const statusLabel = isWip ? 'สต็อกเตรียมผลิต (ยังไม่ส่งงาน)' : job.status === 'done' ? 'จ่ายครบแล้ว' : job.status === 'partial' ? 'ได้รับมัดจำแล้ว' : 'ยังไม่ได้รับเงิน';
  const appUrl = process.env.APP_URL;
  // A WIP job hasn't actually been delivered/paid yet -- heading it "รับเงิน +value" like a
  // completed transaction would be misleading, so it gets its own indigo framing, clearly apart
  // from both the green (income) and rust (expense) cards rather than reusing either palette.
  const headerLabel = isWip ? 'เพิ่มงานใหม่ (สต็อก)' : 'รับเงิน';
  const headerColor = isWip ? '#4338CA' : '#0E9F6E';

  if (!appUrl) {
    const lines = [
      isWip ? '📦 บันทึกงานเข้าสต็อกแล้วครับ!' : 'บันทึกงานสำเร็จแล้วครับ! ✅',
      '',
      `ชื่องาน: ${job.name}`,
      ...(job.client ? [`ลูกค้า: ${job.client}`] : []),
      `มูลค่า: ${formatCurrency(job.value)}`,
      ...(job.whtRate ? [`หัก ณ ที่จ่าย ${job.whtRate}%: -${formatCurrency(job.whtAmount || 0)}`] : []),
      `สถานะ: ${statusLabel}`,
      ...(!isWip && (job.pending || 0) > 0 ? [`ยอดค้างรับ: ${formatCurrency(job.pending || 0)}`] : []),
      ...(monthNet != null ? [`คงเหลือเดือนนี้: ${formatCurrency(Math.max(0, monthNet))}`] : []),
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
        buildStatementRow(headerLabel, `${isWip ? '' : '+'}${formatCurrency(job.value)}`, { size: 'xxl', color: headerColor }),
        { type: 'separator', margin: 'md', color: '#E8DFD3' },
        buildStatementRow('ชื่องาน', job.name, { bold: false }),
        ...(job.client ? [buildStatementRow('ลูกค้า', job.client, { bold: false })] : []),
        ...(job.whtRate ? [buildStatementRow(`หัก ณ ที่จ่าย ${job.whtRate}%`, `-${formatCurrency(job.whtAmount || 0)}`, { bold: false, color: '#C17817' })] : []),
        buildStatementRow('สถานะ', statusLabel, { bold: false }),
        ...(!isWip && (job.pending || 0) > 0 ? [buildStatementRow('ค้างรับ', formatCurrency(job.pending || 0), { bold: false, color: '#C17817' })] : []),
        buildStatementRow('วันที่ทำรายการ', formatThaiTimestamp(), { bold: false }),
        ...(monthNet != null ? [{ type: 'separator', margin: 'md', color: '#E8DFD3' }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: '#0E9F6E' })] : []),
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
          action: { type: 'uri', label: 'เปิดแอป', uri: `${appUrl.replace(/\/$/, '')}/?job=${encodeURIComponent(job.id)}` },
        },
      ],
    },
  };

  return { type: 'flex', altText: isWip ? `เพิ่มงาน "${job.name}" เข้าสต็อกแล้วครับ` : `บันทึกงาน "${job.name}" สำเร็จแล้วครับ`, contents };
}

// Builds a real Expense record the same way ExpenseRecordView.tsx's add-expense form does.
export function buildExpenseFromDraft(draft: ExpenseDraft): Expense {
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

export async function persistExpense(user: UserRow, expense: Expense): Promise<boolean> {
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
export function buildExpenseSavedMessage(expense: Expense, monthNet?: number): LineMessage {
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    const lines = [
      'บันทึกรายจ่ายสำเร็จแล้วครับ! 🧾',
      '',
      `รายการ: ${expense.name}`,
      `หมวด: ${expense.category}`,
      `จำนวน: ${formatCurrency(expense.amount)}`,
      `วันที่: ${expense.date}`,
      ...(monthNet != null ? [`คงเหลือเดือนนี้: ${formatCurrency(Math.max(0, monthNet))}`] : []),
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
        buildStatementRow('จ่ายเงิน', `-${formatCurrency(expense.amount)}`, { size: 'xxl', color: '#A63F1B' }),
        { type: 'separator', margin: 'md', color: '#E8DFD3' },
        buildStatementRow('รายการ', expense.name, { bold: false }),
        buildStatementRow('หมวด', expense.category, { bold: false }),
        buildStatementRow('วันที่ทำรายการ', formatThaiTimestamp(), { bold: false }),
        ...(monthNet != null ? [{ type: 'separator', margin: 'md', color: '#E8DFD3' }, buildStatementRow('คงเหลือเดือนนี้', formatCurrency(Math.max(0, monthNet)), { color: '#0E9F6E' })] : []),
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

function statusBehavior(statuses: StatusRow[], statusId: string): 'done' | 'partial' | 'pending' {
  return statuses.find((s) => s.id === statusId)?.behavior || 'pending';
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

  const trimmed = text.trim();

  if (QUICK_ACTIONS[trimmed]) {
    const snapshot = buildDataSnapshot(user);
    return { type: 'text', text: QUICK_ACTIONS[trimmed](snapshot) };
  }

  return { type: 'text', text: HELP_TEXT };
}

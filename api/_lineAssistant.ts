import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { calculatePayDate, getRelativeDaysText } from '../src/utils.js';
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

interface StatusRow {
  id: string;
  label: string;
  behavior: 'done' | 'partial' | 'pending';
}

interface NotifSettingsRow {
  lineUserId?: string;
  lineLinkCode?: string;
  lineLinkCodeExpiresAt?: string;
  linePendingJob?: JobDraft | null;
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

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

async function findUserByLineId(lineUserId: string): Promise<UserRow | null> {
  const { data, error } = await supabaseAdmin
    .from('user_cashflow_data')
    .select('user_id, email, jobs, goals, settings, expenses, statuses, notif_settings')
    .eq('notif_settings->>lineUserId', lineUserId)
    .maybeSingle();
  if (error) {
    console.error('findUserByLineId error:', error);
    return null;
  }
  return (data as UserRow) || null;
}

type Intent = 'add_job' | 'query_wip' | 'query_unpaid' | 'query_overdue' | 'query_month_summary' | 'other';

async function classifyIntent(text: string): Promise<{ intent: Intent; targetMonth: 'current' | 'last' }> {
  const ai = getGeminiClient();
  if (!ai) return { intent: 'other', targetMonth: 'current' };
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `จัดหมวดหมู่ข้อความนี้จากแชท LINE ของแอปกระรอกตุนเงิน (แอปจัดการเงินสำหรับฟรีแลนซ์): "${text}"

เลือกหมวดหมู่ที่ตรงที่สุดจากนี้เท่านั้น:
- "add_job": ผู้ใช้ต้องการบันทึกงาน/ดีลใหม่ (พูดถึงการรับงาน ได้เงิน ลูกค้า มูลค่างาน)
- "query_wip": ถามเกี่ยวกับงานที่ยังไม่โพสต์/อยู่ระหว่างเตรียมผลิต (เช่น "งานสต็อกมีอะไรบ้าง")
- "query_unpaid": ถามเกี่ยวกับงานที่ยังไม่ได้รับเงิน/ค้างจ่าย
- "query_overdue": ถามเกี่ยวกับงานที่เลยกำหนดชำระแล้ว
- "query_month_summary": ถามสรุปรายรับ/รายงานประจำเดือน
- "other": ทักทาย หรือไม่ชัดเจนว่าต้องการอะไร

ถ้าเป็น query_month_summary ให้ระบุ targetMonth เป็น "last" ถ้าพูดถึงเดือนที่แล้ว มิฉะนั้นเป็น "current"`,
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            intent: { type: 'STRING' },
            targetMonth: { type: 'STRING' },
          },
          required: ['intent'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    const validIntents: Intent[] = ['add_job', 'query_wip', 'query_unpaid', 'query_overdue', 'query_month_summary', 'other'];
    const intent: Intent = validIntents.includes(parsed.intent) ? parsed.intent : 'other';
    return { intent, targetMonth: parsed.targetMonth === 'last' ? 'last' : 'current' };
  } catch (err) {
    console.error('classifyIntent error:', err);
    return { intent: 'other', targetMonth: 'current' };
  }
}

async function extractJobDraft(text: string): Promise<JobDraft> {
  const ai = getGeminiClient();
  if (!ai) return {};
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `แยกข้อมูลงานฟรีแลนซ์จากข้อความนี้: "${text}"

กฎสำคัญ: ถ้าข้อมูลไหนไม่ได้พูดถึงในข้อความ ห้ามเดา ให้เว้นว่างหรือไม่ใส่ฟิลด์นั้นเลย
- name: ชื่องานหรือโปรเจกต์
- client: ชื่อลูกค้าหรือแบรนด์
- type: ประเภทงาน เช่น Sponsored Post, Video Production, Consulting / Advisory
- value: มูลค่างานเป็นตัวเลขบาทล้วนๆ
- creditTerm: จำนวนวันเครดิตเทอม (0 ถ้าพูดว่าได้เงินทันที)
- paymentStatus: "paid" ถ้าจ่ายครบแล้ว, "partial" ถ้ามัดจำ, "pending" ถ้าพูดชัดเจนว่ายังไม่จ่าย -- เว้นว่างถ้าไม่ได้พูดถึงการจ่ายเงินเลย
- receivedAmount: จำนวนเงินที่ได้รับแล้วจริงเป็นบาท
- note: รายละเอียดอื่นๆ ที่พูดถึงแต่ไม่เข้าฟิลด์ไหน`,
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            client: { type: 'STRING' },
            type: { type: 'STRING' },
            value: { type: 'NUMBER' },
            creditTerm: { type: 'NUMBER' },
            paymentStatus: { type: 'STRING' },
            receivedAmount: { type: 'NUMBER' },
            note: { type: 'STRING' },
          },
        },
      },
    });
    return JSON.parse(response.text || '{}');
  } catch (err) {
    console.error('extractJobDraft error:', err);
    return {};
  }
}

function formatJobDraft(draft: JobDraft): string {
  const lines: string[] = [];
  lines.push(`ชื่องาน: ${draft.name || '-'}`);
  if (draft.client) lines.push(`ลูกค้า: ${draft.client}`);
  if (draft.type) lines.push(`ประเภท: ${draft.type}`);
  lines.push(`มูลค่า: ${draft.value != null ? formatCurrency(draft.value) : '-'}`);
  lines.push(`เครดิตเทอม: ${draft.creditTerm != null ? `${draft.creditTerm} วัน` : 'ยังไม่ระบุ (จะถือว่าได้เงินทันที)'}`);
  const statusLabel = draft.paymentStatus === 'paid' ? 'จ่ายครบแล้ว' : draft.paymentStatus === 'partial' ? `มัดจำ ${draft.receivedAmount ? formatCurrency(draft.receivedAmount) : ''}` : 'ยังไม่จ่าย';
  lines.push(`สถานะจ่ายเงิน: ${statusLabel}`);
  if (draft.note) lines.push(`โน้ต: ${draft.note}`);
  return lines.join('\n');
}

async function updateNotifSettings(userId: string, notifSettings: NotifSettingsRow): Promise<void> {
  const { error } = await supabaseAdmin.from('user_cashflow_data').update({ notif_settings: notifSettings }).eq('user_id', userId);
  if (error) console.error('updateNotifSettings error:', error);
}

async function savePendingJob(user: UserRow, draft: JobDraft): Promise<void> {
  const notifSettings: NotifSettingsRow = user.notif_settings || {};
  await updateNotifSettings(user.user_id, { ...notifSettings, linePendingJob: draft });
}

async function clearPendingJob(user: UserRow): Promise<void> {
  const notifSettings: NotifSettingsRow = { ...(user.notif_settings || {}) };
  delete notifSettings.linePendingJob;
  await updateNotifSettings(user.user_id, notifSettings);
}

// Builds a real Job record the same way JobsTab.tsx's add-job form does (WHT is not captured
// via chat, so it's left at 0 -- editable in-app afterward same as any other field) and
// appends it to the account's jobs array.
async function saveJobDraft(user: UserRow, draft: JobDraft): Promise<string> {
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

  const newJob: JobRow & { id: string; client: string; note: string; postDate: string; isPosted: boolean } = {
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

  const jobs = [...(user.jobs || []), newJob];
  const { error } = await supabaseAdmin.from('user_cashflow_data').update({ jobs }).eq('user_id', user.user_id);
  if (error) {
    console.error('saveJobDraft error:', error);
    return 'บันทึกงานไม่สำเร็จครับ ลองใหม่อีกครั้ง หรือบันทึกผ่านแอปแทนได้เลยครับ';
  }

  await clearPendingJob(user);
  return `บันทึกงานสำเร็จแล้วครับ! ✅\n\n${formatJobDraft(draft)}`;
}

function statusBehavior(statuses: StatusRow[], statusId: string): 'done' | 'partial' | 'pending' {
  return statuses.find((s) => s.id === statusId)?.behavior || 'pending';
}

function formatWipJobsReply(jobs: JobRow[]): string {
  const wip = jobs.filter((j) => j.isPosted === false);
  if (wip.length === 0) return '🌰 ตอนนี้ไม่มีงานที่อยู่ในสต็อก/เตรียมผลิตเลยครับ';
  const lines = wip.map((j) => `• ${j.name}${j.client ? ` (${j.client})` : ''} -- ${formatCurrency(j.value)}`);
  return `📦 งานสต็อก/เตรียมผลิต (${wip.length} รายการ):\n${lines.join('\n')}`;
}

function formatUnpaidJobsReply(jobs: JobRow[], statuses: StatusRow[]): string {
  const unpaid = jobs.filter((j) => (j.pending || 0) > 0 && statusBehavior(statuses, j.status || '') !== 'done');
  if (unpaid.length === 0) return '🌰 ไม่มีงานค้างจ่ายเลยครับ เคลียร์หมดแล้ว!';
  const total = unpaid.reduce((sum, j) => sum + (j.pending || 0), 0);
  const lines = unpaid.map((j) => `• ${j.name}${j.client ? ` (${j.client})` : ''} -- ค้าง ${formatCurrency(j.pending || 0)}`);
  return `💰 งานที่ยังไม่จ่าย (${unpaid.length} รายการ รวม ${formatCurrency(total)}):\n${lines.join('\n')}`;
}

function formatOverdueJobsReply(jobs: JobRow[], statuses: StatusRow[]): string {
  const overdue = jobs.filter((j) => {
    if ((j.pending || 0) <= 0 || statusBehavior(statuses, j.status || '') === 'done') return false;
    const dateStr = j.dueDate || j.payDate;
    return dateStr ? getRelativeDaysText(dateStr).isOverdue : false;
  });
  if (overdue.length === 0) return '🌰 ไม่มีงานที่เลยกำหนดชำระเลยครับ';
  const lines = overdue.map((j) => {
    const rel = getRelativeDaysText(j.dueDate || j.payDate);
    return `• ${j.name}${j.client ? ` (${j.client})` : ''} -- ค้าง ${formatCurrency(j.pending || 0)} (${rel.text})`;
  });
  return `⚠️ งานที่เลยกำหนดชำระ (${overdue.length} รายการ):\n${lines.join('\n')}`;
}

function formatMonthSummaryLine(monthKey: string, summary: ReturnType<typeof computeMonthlySummary>): string {
  return [
    `📊 สรุปเดือน ${monthKey}`,
    '',
    `รับแล้วจริง: ${formatCurrency(summary.received)}`,
    `รายจ่ายรวม: ${formatCurrency(summary.fixedExpenseCalculated + summary.variableExpense)}`,
    `กระแสเงินสดสุทธิ: ${formatCurrency(summary.netFlow)}`,
    `ยอดออมสะสมโดยประมาณ: ${formatCurrency(summary.actualSavings)}`,
  ].join('\n');
}

// Entry point called from api/line-webhook.ts. Returns null when this LINE user isn't linked
// to any app account yet, so the caller can fall back to the link-code flow.
export async function handleAssistantMessage(lineUserId: string, text: string): Promise<string | null> {
  const user = await findUserByLineId(lineUserId);
  if (!user) return null;

  const notifSettings: NotifSettingsRow = user.notif_settings || {};
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (notifSettings.linePendingJob) {
    const draft = notifSettings.linePendingJob;
    if (['ยืนยัน', 'ยัน', 'yes', 'y', 'ok', 'โอเค', 'ตกลง'].some((k) => lower.includes(k))) {
      return await saveJobDraft(user, draft);
    }
    if (['ยกเลิก', 'cancel', 'ไม่เอา', 'ไม่ใช่'].some((k) => lower.includes(k))) {
      await clearPendingJob(user);
      return 'ยกเลิกการบันทึกงานแล้วครับ';
    }
    return `ยังมีงานค้างยืนยันอยู่ครับ:\n\n${formatJobDraft(draft)}\n\nพิมพ์ "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก" เพื่อเริ่มใหม่ครับ`;
  }

  const { intent, targetMonth } = await classifyIntent(trimmed);

  switch (intent) {
    case 'add_job': {
      const draft = await extractJobDraft(trimmed);
      if (!draft.name || draft.value == null) {
        return 'รบกวนบอกรายละเอียดเพิ่มอีกนิดครับ อย่างน้อยต้องมี "ชื่องาน" กับ "มูลค่างาน" เช่น\n"รับงานสปอนเซอร์จาก ABC 5000 บาท เครดิต 30 วัน"';
      }
      await savePendingJob(user, draft);
      return `ตรวจสอบข้อมูลก่อนบันทึกครับ:\n\n${formatJobDraft(draft)}\n\nพิมพ์ "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก" เพื่อเริ่มใหม่ครับ`;
    }
    case 'query_wip':
      return formatWipJobsReply(user.jobs || []);
    case 'query_unpaid':
      return formatUnpaidJobsReply(user.jobs || [], user.statuses || []);
    case 'query_overdue':
      return formatOverdueJobsReply(user.jobs || [], user.statuses || []);
    case 'query_month_summary': {
      const monthKey = targetMonth === 'last' ? previousMonthKey() : currentMonthKey();
      const summary = computeMonthlySummary(user.jobs || [], user.expenses || [], user.goals || [], user.settings || {}, monthKey);
      return formatMonthSummaryLine(monthKey, summary);
    }
    default:
      return 'พิมพ์คำสั่งแบบนี้ได้ครับ:\n• "รับงานสปอนเซอร์จาก ABC 5000 บาท" (เพิ่มงาน)\n• "งานสต็อกมีอะไรบ้าง" (งานที่ยังไม่โพสต์)\n• "งานที่ยังไม่จ่ายมีอะไรบ้าง"\n• "งานที่เลยกำหนดมีอะไรบ้าง"\n• "รายงานเดือนนี้" หรือ "รายงานเดือนที่แล้ว"';
  }
}

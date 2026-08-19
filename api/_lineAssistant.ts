import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { calculatePayDate, getRelativeDaysText } from '../src/utils.js';
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

interface StatusRow {
  id: string;
  label: string;
  behavior: 'done' | 'partial' | 'pending';
}

// Fields the assistant will actively follow up on (one at a time) when a job draft is missing
// them -- everything else in JobDraft stays optional/best-effort.
type MissingField = 'client' | 'paymentStatus';

interface PendingJobState {
  draft: JobDraft;
  askedField?: MissingField;
}

interface NotifSettingsRow {
  lineUserId?: string;
  lineLinkCode?: string;
  lineLinkCodeExpiresAt?: string;
  linePendingJob?: PendingJobState | null;
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

// Only decides whether this message is trying to RECORD a new job (a write, so it needs the
// careful extract -> confirm -> save flow below) versus everything else, which goes to the
// free-form data-grounded Q&A instead. Keeping this gate narrow and binary -- rather than
// sorting every message into a fixed set of query buckets -- is what lets Q&A understand
// arbitrary phrasing instead of only near-exact matches to canned examples.
async function isAddJobRequest(text: string): Promise<boolean> {
  const ai = getGeminiClient();
  if (!ai) return false;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `ข้อความนี้จากแชท LINE ของแอปกระรอกตุนเงิน (แอปบันทึกรายรับ-รายจ่ายสำหรับฟรีแลนซ์): "${text}"

ผู้ใช้กำลังจะ "บันทึกงาน/ดีลใหม่" (บรรยายว่ารับงานอะไร จากใคร มูลค่าเท่าไหร่ เพื่อบันทึกเป็นรายการใหม่) ใช่หรือไม่?
ถ้าเป็นแค่การถามคำถาม/สอบถามข้อมูล (ไม่ว่าจะถามเรื่องอะไรก็ตาม) ให้ตอบ false ไม่ใช่แค่คำถามที่ตรงกับตัวอย่างเป๊ะๆ เท่านั้น`,
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { isAddJob: { type: 'BOOLEAN' } },
          required: ['isAddJob'],
        },
      },
    });
    const parsed = JSON.parse(response.text || '{}');
    return !!parsed.isAddJob;
  } catch (err) {
    console.error('isAddJobRequest error:', err);
    return false;
  }
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

// All the deterministic math lives here in plain JS -- Gemini is only ever handed the already-
// computed results below, never asked to sum/compare numbers itself, so answers can't drift
// from what the app itself shows (the exact bug class this session kept running into).
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

async function answerFromData(text: string, snapshot: DataSnapshot): Promise<string> {
  const ai = getGeminiClient();
  if (!ai) return 'ระบบตอบคำถามไม่พร้อมใช้งานตอนนี้ครับ ลองใหม่อีกครั้ง';

  const formatted = {
    งานที่ยังไม่โพสต์_สต็อกงาน: snapshot.wip.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} มูลค่า ${formatCurrency(j.value)}`),
    งานที่ยังไม่จ่ายเงิน: snapshot.unpaid.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ค้าง ${formatCurrency(j.pending)} กำหนดชำระ ${j.dueText}`),
    งานที่เลยกำหนดชำระแล้ว: snapshot.overdue.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ค้าง ${formatCurrency(j.pending)} (${j.overdueText})`),
    งานที่ครบกำหนดชำระวันนี้: snapshot.dueToday.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ${formatCurrency(j.pending)}`),
    ยอดค้างรับทั้งหมดรวมทุกงาน: formatCurrency(snapshot.totalPendingAllTime),
    สรุปเดือนนี้: { เดือน: snapshot.thisMonth.monthKey, รับแล้วจริง: formatCurrency(snapshot.thisMonth.received), รายจ่ายรวม: formatCurrency(snapshot.thisMonth.fixedExpenseCalculated + snapshot.thisMonth.variableExpense), กระแสเงินสดสุทธิ: formatCurrency(snapshot.thisMonth.netFlow), ยอดออมสะสมโดยประมาณ: formatCurrency(snapshot.thisMonth.actualSavings) },
    สรุปเดือนที่แล้ว: { เดือน: snapshot.lastMonth.monthKey, รับแล้วจริง: formatCurrency(snapshot.lastMonth.received), รายจ่ายรวม: formatCurrency(snapshot.lastMonth.fixedExpenseCalculated + snapshot.lastMonth.variableExpense), กระแสเงินสดสุทธิ: formatCurrency(snapshot.lastMonth.netFlow), ยอดออมสะสมโดยประมาณ: formatCurrency(snapshot.lastMonth.actualSavings) },
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `คุณเป็นผู้ช่วยของแอปกระรอกตุนเงิน (แอปบันทึกรายรับ-รายจ่ายสำหรับฟรีแลนซ์) ตอบคำถามผู้ใช้ในแชท LINE

กฎสำคัญ:
- ตอบจาก "ข้อมูลบัญชีจริง" ด้านล่างเท่านั้น ห้ามเดาหรือสร้างตัวเลข/รายการที่ไม่มีในข้อมูลนี้ขึ้นมาเอง
- ถ้าคำถามต้องการข้อมูลที่ไม่มีอยู่ในนี้เลย ให้บอกตรงๆ ว่าไม่มีข้อมูลส่วนนั้น อย่าแต่งคำตอบขึ้นมา
- ตอบสั้น กระชับ เป็นธรรมชาติแบบคุยกันในแชท ภาษาไทย ไม่ต้องทักทายซ้ำ
- ถ้ารายการว่างเปล่า (ไม่มีงานในหมวดที่ถาม) ให้ตอบว่าไม่มีอย่างชัดเจน เป็นข่าวดีไม่ใช่ข้อผิดพลาด

ข้อมูลบัญชีจริง (JSON):
${JSON.stringify(formatted, null, 2)}

คำถามจากผู้ใช้: "${text}"`,
            },
          ],
        },
      ],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    return response.text?.trim() || 'ขอโทษครับ ตอบคำถามนี้ไม่ได้ ลองถามใหม่อีกครั้งครับ';
  } catch (err) {
    console.error('answerFromData error:', err);
    return 'ขอโทษครับ ตอบคำถามนี้ไม่ได้ตอนนี้ ลองใหม่อีกครั้งครับ';
  }
}

async function extractJobDraft(text: string): Promise<JobDraft> {
  const ai = getGeminiClient();
  if (!ai) return {};
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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

// Once a job draft is asking about a specific field, this reply is almost certainly the answer
// to that field -- but stays a full extraction (not a plain string assignment) so a natural
// reply like "เก็บครบแล้วครับ 5000" still gets read correctly instead of being taken literally.
async function extractFollowUpAnswer(question: string, answerText: string): Promise<JobDraft> {
  const ai = getGeminiClient();
  if (!ai) return {};
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `กำลังบันทึกงานฟรีแลนซ์ในแชท คุณเพิ่งถามผู้ใช้ว่า: "${question}"
ผู้ใช้ตอบว่า: "${answerText}"

แยกข้อมูลที่เกี่ยวข้องออกมาเป็นฟิลด์ต่อไปนี้ (เว้นว่างถ้าคำตอบไม่ได้พูดถึงฟิลด์นั้นเลย ห้ามเดา):
- client: ชื่อลูกค้าหรือแบรนด์
- paymentStatus: "paid" ถ้าจ่ายครบแล้ว, "partial" ถ้ามัดจำบางส่วน, "pending" ถ้ายังไม่จ่าย
- receivedAmount: จำนวนเงินที่ได้รับแล้วจริงเป็นบาท ถ้ามีพูดถึง
- creditTerm: จำนวนวันเครดิตเทอม ถ้ามีพูดถึง (0 ถ้าได้เงินทันที)
- name, type, value, note: เติมด้วยถ้าคำตอบบังเอิญพูดถึงเรื่องพวกนี้เพิ่มเติมมาด้วย`,
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
    console.error('extractFollowUpAnswer error:', err);
    return {};
  }
}

function mergeDraft(base: JobDraft, extra: JobDraft): JobDraft {
  const merged: JobDraft = { ...base };
  (Object.keys(extra) as (keyof JobDraft)[]).forEach((key) => {
    const value = extra[key];
    if (value !== undefined && value !== null && value !== ('' as unknown)) {
      (merged as Record<string, unknown>)[key] = value;
    }
  });
  return merged;
}

const FIELD_QUESTIONS: Record<MissingField, string> = {
  client: 'ลูกค้าชื่ออะไรครับ',
  paymentStatus: 'ได้รับเงินแล้วหรือยังครับ (จ่ายครบแล้ว / มัดจำบางส่วน / ยังไม่จ่าย)',
};

function missingRequiredFields(draft: JobDraft): MissingField[] {
  const missing: MissingField[] = [];
  if (!draft.client) missing.push('client');
  if (!draft.paymentStatus) missing.push('paymentStatus');
  return missing;
}

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

// Squirrel-branded Flex "receipt" card shown right after a job is saved -- reuses the app's
// own warm cream/acorn-orange palette (src/index.css :root) so it reads as the same product.
// Falls back to a plain-text summary when APP_URL isn't configured (no working deep link yet).
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

  const rows: [string, string][] = [
    ['ชื่องาน', job.name],
    ...(job.client ? ([['ลูกค้า', job.client]] as [string, string][]) : []),
    ['มูลค่า', formatCurrency(job.value)],
    ['สถานะ', statusLabel],
    ...(job.pending > 0 ? ([['ยอดค้างรับ', formatCurrency(job.pending)]] as [string, string][]) : []),
  ];

  const bodyContents = rows.map(([label, value]) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#7A5C43', flex: 2 },
      { type: 'text', text: value, size: 'sm', color: '#3D2314', flex: 3, wrap: true, weight: 'bold' },
    ],
  }));

  const contents = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#E65F2B',
      paddingAll: '16px',
      contents: [{ type: 'text', text: '🐿️ บันทึกงานสำเร็จ', color: '#FFFFFF', weight: 'bold', size: 'md' }],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FBF2E4',
      spacing: 'md',
      paddingAll: '16px',
      contents: bodyContents,
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

function statusBehavior(statuses: StatusRow[], statusId: string): 'done' | 'partial' | 'pending' {
  return statuses.find((s) => s.id === statusId)?.behavior || 'pending';
}

const DECLINE_KEYWORDS = ['ไม่ต้องถาม', 'พอแล้ว', 'แค่นี้พอ', 'บันทึกเลย', 'ไม่ต้องละเอียด', 'เอาแค่นี้', 'ข้ามไป', 'ไม่ทราบ', 'ไม่รู้เหมือนกัน'];
const CANCEL_KEYWORDS = ['ยกเลิก', 'cancel', 'ไม่เอาแล้ว', 'เริ่มใหม่'];

// Entry point called from api/line-webhook.ts. Returns null when this LINE user isn't linked
// to any app account yet, so the caller can fall back to the link-code flow.
export async function handleAssistantMessage(lineUserId: string, text: string): Promise<LineMessage | null> {
  const user = await findUserByLineId(lineUserId);
  if (!user) return null;

  const notifSettings: NotifSettingsRow = user.notif_settings || {};
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (notifSettings.linePendingJob) {
    const pending = notifSettings.linePendingJob;

    if (CANCEL_KEYWORDS.some((k) => lower.includes(k))) {
      await clearPendingJob(user);
      return { type: 'text', text: 'ยกเลิกการบันทึกงานแล้วครับ' };
    }

    if (DECLINE_KEYWORDS.some((k) => lower.includes(k))) {
      return await saveDraftNow(user, pending.draft);
    }

    // Otherwise this message answers whatever field was last asked -- merge it in and either
    // ask the next missing field or, once everything required is there, save immediately
    // (no separate "confirm" step; the saved-job card itself is the receipt to review/edit).
    const answered = pending.askedField ? await extractFollowUpAnswer(FIELD_QUESTIONS[pending.askedField], trimmed) : await extractJobDraft(trimmed);
    const merged = mergeDraft(pending.draft, answered);
    const stillMissing = missingRequiredFields(merged);

    if (stillMissing.length === 0) {
      return await saveDraftNow(user, merged);
    }

    const nextField = stillMissing[0];
    await savePendingJob(user, { draft: merged, askedField: nextField });
    return { type: 'text', text: FIELD_QUESTIONS[nextField] };
  }

  if (await isAddJobRequest(trimmed)) {
    const draft = await extractJobDraft(trimmed);
    if (!draft.name || draft.value == null) {
      return { type: 'text', text: 'รบกวนบอกรายละเอียดเพิ่มอีกนิดครับ อย่างน้อยต้องมี "ชื่องาน" กับ "มูลค่างาน" เช่น\n"รับงานสปอนเซอร์จาก ABC 5000 บาท เครดิต 30 วัน"' };
    }

    const missing = missingRequiredFields(draft);
    if (missing.length === 0) {
      return await saveDraftNow(user, draft);
    }

    const nextField = missing[0];
    await savePendingJob(user, { draft, askedField: nextField });
    return { type: 'text', text: FIELD_QUESTIONS[nextField] };
  }

  const snapshot = buildDataSnapshot(user);
  const answerText = await answerFromData(trimmed, snapshot);
  return { type: 'text', text: answerText };
}

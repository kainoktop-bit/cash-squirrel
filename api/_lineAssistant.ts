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

  if (await isAddJobRequest(trimmed)) {
    const draft = await extractJobDraft(trimmed);
    if (!draft.name || draft.value == null) {
      return 'รบกวนบอกรายละเอียดเพิ่มอีกนิดครับ อย่างน้อยต้องมี "ชื่องาน" กับ "มูลค่างาน" เช่น\n"รับงานสปอนเซอร์จาก ABC 5000 บาท เครดิต 30 วัน"';
    }
    await savePendingJob(user, draft);
    return `ตรวจสอบข้อมูลก่อนบันทึกครับ:\n\n${formatJobDraft(draft)}\n\nพิมพ์ "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก" เพื่อเริ่มใหม่ครับ`;
  }

  const snapshot = buildDataSnapshot(user);
  return await answerFromData(trimmed, snapshot);
}

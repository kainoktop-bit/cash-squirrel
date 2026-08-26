import { GoogleGenAI } from '@google/genai';
import { supabaseAdmin } from './_supabaseAdmin.js';
import { calculatePayDate, getRelativeDaysText, getThaiMonthName, formatMonthKey } from '../src/utils.js';
import type { Expense, Goal } from '../src/types.js';
import type { LineMessage } from './_line.js';
import {
  JobRow,
  ExpenseRow,
  SettingsRow,
  currentMonthKey,
  previousMonthKey,
  computeMonthlySummary,
  jobsInMonth,
  dateKeyInMonth,
  formatCurrency,
} from './_monthlySummary.js';

// No chat-based add-job/add-expense questionnaire -- that flow was removed in favor of the LIFF
// form (api/liff-submit.ts), which has a proper multi-field UI and can't leave someone stuck
// mid-conversation answering the wrong question. Everything here is either a fixed Quick Reply
// command (zero AI cost) or, for anything else, a Gemini-answered question grounded in the
// user's real data -- with a static fallback (HELP_TEXT) if Gemini is unconfigured or errors
// (e.g. free-tier quota), so a Gemini outage degrades to "here are the buttons" instead of
// a raw error or a stuck conversation.

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
  goals?: Goal[];
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

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// The free-tier Gemini quota returns HTTP 429 under bursts -- one short retry smooths that over
// without adding much latency to a chat reply.
async function callWithRetry<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isRateLimited = message.includes('"code":429') || message.includes('RESOURCE_EXHAUSTED');
    if (isRateLimited && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      return callWithRetry(fn, attempt + 1);
    }
    throw err;
  }
}

interface DataSnapshot {
  wip: { name: string; client: string; value: number }[];
  unpaid: { name: string; client: string; pending: number; dueDate: string | null; dueText: string }[];
  overdue: { name: string; client: string; pending: number; overdueText: string }[];
  dueToday: { name: string; client: string; pending: number }[];
  thisMonth: ReturnType<typeof computeMonthlySummary> & { monthKey: string };
  lastMonth: ReturnType<typeof computeMonthlySummary> & { monthKey: string };
  thisMonthJobs: { name: string; client: string; value: number; pending: number; status: string; isPosted?: boolean; isUnpaid: boolean }[];
  upcomingForecast: { monthKey: string; expectedIncome: number }[];
  goals: { name: string; type: string; target: number; current: number; deadline: string; allocatedPercentage?: number }[];
  totalPendingAllTime: number;
}

function addMonthsToKey(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
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
    return { name: j.name, client: j.client || '', pending: j.pending || 0, dueDate: dateStr || null, dueText: dateStr ? getRelativeDaysText(dateStr).text : 'ไม่ระบุวันครบกำหนด' };
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

  // Scoped by payDate||postDate falling in this month -- same job set computeMonthlySummary
  // itself sums for thisMonth's income/received, just kept as a list instead of a total.
  const thisMonthJobs = jobsInMonth(jobs, thisMonthKey).map((j) => ({
    name: j.name,
    client: j.client || '',
    value: j.value || 0,
    pending: j.pending || 0,
    status: j.status || '',
    isPosted: j.isPosted,
    isUnpaid: (j.pending || 0) > 0 && isUnpaidBehavior(j.status || ''),
  }));

  const totalPendingAllTime = unpaidJobs.reduce((sum, j) => sum + (j.pending || 0), 0);

  // Same idea as the Dashboard's 4-month "เรดาร์เสบียง" forecast: for each of the next 3 months,
  // sum already-confirmed received amounts plus pending amounts for jobs that have actually been
  // posted (skips WIP jobs with no real due date yet) whose payDate/postDate falls in that month.
  const upcomingForecast = [1, 2, 3].map((n) => {
    const monthKey = addMonthsToKey(thisMonthKey, n);
    const expectedIncome = jobs.reduce((sum, j) => {
      const dateKey = j.payDate || j.postDate;
      if (!dateKeyInMonth(dateKey, monthKey)) return sum;
      if ((j.received || 0) > 0) return sum + (j.received || 0);
      if ((j.pending || 0) > 0 && j.isPosted !== false) return sum + (j.pending || 0);
      return sum;
    }, 0);
    return { monthKey, expectedIncome };
  });

  const goals = (user.goals || []).map((g) => ({
    name: g.name,
    type: g.type,
    target: g.target,
    current: g.current,
    deadline: g.deadline,
    allocatedPercentage: g.allocatedPercentage,
  }));

  return { wip, unpaid, overdue, dueToday, thisMonth, lastMonth, thisMonthJobs, upcomingForecast, goals, totalPendingAllTime };
}

// Free-form Q&A, grounded strictly in this user's real data -- never lets Gemini invent numbers
// or line items that aren't in the snapshot. Returns null (not an error string) whenever Gemini
// is unconfigured or the call fails for any reason (including a 429 after the retry above is
// exhausted), so the caller can fall back to the static HELP_TEXT greeting instead of showing a
// raw "couldn't answer" message or leaving the user stuck.

// LINE's chat UI renders plain text only -- markdown shows up as literal asterisks/hashes, which
// reads as an obviously-AI-generated wall of symbols. The prompt already says not to use it, but
// that's not 100% reliable, so strip the common cases as a backstop.
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[*-]\s+/gm, '');
}

async function answerFromData(text: string, snapshot: DataSnapshot): Promise<string | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  const formatted = {
    งานที่ยังไม่โพสต์_สต็อกงาน: snapshot.wip.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} มูลค่า ${formatCurrency(j.value)}`),
    งานที่ยังไม่จ่ายเงิน: snapshot.unpaid.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ค้าง ${formatCurrency(j.pending)} กำหนดชำระ ${j.dueText}${j.dueDate ? ` (วันที่ ${j.dueDate}, เดือน ${j.dueDate.slice(0, 7)})` : ''}`),
    งานที่เลยกำหนดชำระแล้ว: snapshot.overdue.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ค้าง ${formatCurrency(j.pending)} (${j.overdueText})`),
    งานที่ครบกำหนดชำระวันนี้: snapshot.dueToday.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} ${formatCurrency(j.pending)}`),
    งานที่เข้าเดือนนี้: snapshot.thisMonthJobs.map((j) => `${j.name}${j.client ? ` (${j.client})` : ''} มูลค่า ${formatCurrency(j.value)} ${j.isUnpaid ? `(ค้าง ${formatCurrency(j.pending)})` : j.isPosted === false ? '(ในสต็อก)' : '(จ่ายแล้ว)'}`),
    ยอดค้างรับทั้งหมดรวมทุกงาน: formatCurrency(snapshot.totalPendingAllTime),
    สรุปเดือนนี้: { เดือน: snapshot.thisMonth.monthKey, รับแล้วจริง: formatCurrency(snapshot.thisMonth.received), รายจ่ายรวม: formatCurrency(snapshot.thisMonth.fixedExpenseCalculated + snapshot.thisMonth.variableExpense), กระแสเงินสดสุทธิ: formatCurrency(Math.max(0, snapshot.thisMonth.netFlow)), ยอดออมสะสมโดยประมาณ: formatCurrency(snapshot.thisMonth.actualSavings) },
    สรุปเดือนที่แล้ว: { เดือน: snapshot.lastMonth.monthKey, รับแล้วจริง: formatCurrency(snapshot.lastMonth.received), รายจ่ายรวม: formatCurrency(snapshot.lastMonth.fixedExpenseCalculated + snapshot.lastMonth.variableExpense), กระแสเงินสดสุทธิ: formatCurrency(Math.max(0, snapshot.lastMonth.netFlow)), ยอดออมสะสมโดยประมาณ: formatCurrency(snapshot.lastMonth.actualSavings) },
    พยากรณ์รายรับเดือนถัดไป_3เดือน: snapshot.upcomingForecast.map((f) => `${formatMonthKey(f.monthKey)} (เดือน ${f.monthKey}): คาดว่าจะได้รับ ${formatCurrency(f.expectedIncome)} (รวมยอดที่รับแล้ว+ยอดค้างรับของงานที่ส่งมอบแล้วซึ่งมีกำหนดชำระในเดือนนี้ ไม่รวมงานสต็อกที่ยังไม่ส่งมอบเพราะยังไม่รู้วันชำระแน่นอน)`),
    เป้าหมายออม: snapshot.goals.map((g) => `${g.name} เป้าหมาย ${formatCurrency(g.target)} สะสมแล้ว ${formatCurrency(g.current)} (${g.target > 0 ? Math.round((g.current / g.target) * 100) : 0}%) กำหนดเสร็จ ${g.deadline}${g.allocatedPercentage ? ` แบ่งจากกำไรอัตโนมัติ ${g.allocatedPercentage}%` : ''}`),
  };

  try {
    const response = await callWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `คุณคือ "พี่กระรอก" มาสคอตของแอปกระรอกตุนเงิน (แอปบันทึกรายรับ-รายจ่ายสำหรับฟรีแลนซ์) ตอบคำถามผู้ใช้ในแชท LINE

บุคลิก:
- เป็นเพื่อนสนิทที่คอยช่วยดูแลเรื่องเงินให้ พูดจาแบบกันเองสุดๆ เหมือนแชทคุยกับเพื่อน ไม่ใช่ผู้ช่วย AI ที่เป็นทางการ
- ใช้ภาษาพูดธรรมดาแบบคนไทยคุยกันจริงๆ ไม่ต้องเกร็งหรือดูเป็นทางการ จะใช้ "ครับ" บ้างก็ได้แต่ไม่ต้องทุกประโยค เน้นความเป็นธรรมชาติเป็นหลัก
- แซวหรือเปรียบเทียบธีมกระรอก/เก็บเสบียง/โพรงไม้ได้บ้างเป็นครั้งคราวให้ดูมีคาแรคเตอร์ แต่อย่าใส่ทุกประโยคจนดูฝืน
- ถ้าข่าวไม่ดี (เช่น มีงานค้างจ่าย เกินกำหนด) ให้บอกตรงไปตรงมาด้วยความเข้าใจและให้กำลังใจ ไม่ตำหนิหรือทำให้รู้สึกแย่
- ความเป็นกันเองต้องไม่ทำให้คำตอบยืดยาวหรือคลุมเครือ -- ยังต้องตอบสั้น กระชับ ตรงประเด็นตามกฎด้านล่างเสมอ

กฎสำคัญ:
- ห้ามใช้สัญลักษณ์จัดรูปแบบแบบ markdown เด็ดขาด (ห้ามใช้ ** ทำตัวหนา, ห้ามใช้ # หัวข้อ, ห้ามใช้ * หรือ - นำหน้าเป็น bullet) เพราะแชท LINE ไม่รองรับ markdown จะเห็นเป็นสัญลักษณ์ดิบๆ แทน ให้เขียนเป็นข้อความธรรมดาล้วนๆ ใช้การขึ้นบรรทัดใหม่แทนถ้าต้องแยกรายการ
- ตอบจาก "ข้อมูลบัญชีจริง" ด้านล่างเท่านั้น ห้ามเดาหรือสร้างตัวเลข/รายการที่ไม่มีในข้อมูลนี้ขึ้นมาเองเด็ดขาด ห้ามให้ข้อมูลเท็จหรือคาดเดาแทนการบอกว่าไม่รู้
- ถ้าคำถามต้องการข้อมูลที่ไม่มีอยู่ในนี้เลย ให้บอกตรงๆ ว่าไม่มีข้อมูลส่วนนั้น อย่าแต่งคำตอบขึ้นมา
- ตอบสั้น กระชับ ตรงประเด็นกับสิ่งที่ถาม อย่าตอบกำกวมหรือคลุมเครือ เป็นธรรมชาติแบบคุยกันในแชท ภาษาไทย ไม่ต้องทักทายซ้ำ
- ถ้ารายการว่างเปล่า (ไม่มีงานในหมวดที่ถาม) ให้ตอบว่าไม่มีอย่างชัดเจน เป็นข่าวดีไม่ใช่ข้อผิดพลาด
- "กระแสเงินสดสุทธิ" ในข้อมูลนี้ไม่ใช่ตัวเลขเดียวกับ "กำไร/กำไรสุทธิ" เป๊ะๆ -- มันคือ (เงินที่รับแล้วจริง) ลบ (รายจ่ายที่บันทึกไว้ในระบบเท่านั้น) และไม่ติดลบต่ำกว่า 0 ถ้าผู้ใช้ถามถึงกำไร ให้ตอบด้วยตัวเลขนี้ได้แต่ต้องบอกด้วยว่านี่คือกระแสเงินสดสุทธิจากรายการที่บันทึกไว้ ไม่ใช่กำไรทางบัญชีที่แม่นยำ 100% เพราะอาจมีรายจ่ายที่ผู้ใช้ยังไม่ได้บันทึกเข้าระบบ (เช่น ค่าจ้างฟรีแลนซ์ช่วยงาน ต้นทุนอื่นๆ) ซึ่งจะไม่ถูกรวมในตัวเลขนี้
- ถ้าถามว่าตัวเลขใดตัวเลขหนึ่ง "รวมอะไรบ้าง" หรือครบถ้วนหรือไม่ ให้อธิบายตามจริงว่าเป็นผลรวมของอะไร (เช่น รายจ่ายรวม = ค่าใช้จ่ายคงที่ + ค่าใช้จ่ายผันแปรที่บันทึกไว้ในแอป) และบอกตรงๆ ว่าถ้ามีรายจ่ายอะไรที่ยังไม่ได้บันทึกเป็นรายการในแอป ตัวเลขนี้จะไม่รวมส่วนนั้น
- ถ้าคำถามเกี่ยวกับการเพิ่ม/แก้ไข/ลบข้อมูล ให้แนะนำให้กดปุ่ม "📝 ฟอร์มบันทึก" แทน เพราะที่นี่ตอบได้แค่คำถาม แก้ไขข้อมูลไม่ได้
- ปุ่มลัดที่มีอยู่จริงในแชทมีแค่นี้เท่านั้น: "📝 ฟอร์มบันทึก", "📋 งานค้างจ่าย", "📊 สรุปเดือนนี้", "📅 งานเดือนนี้", "📦 งานสต็อก" ห้ามอ้างถึงหรือแนะนำปุ่มชื่ออื่นที่ไม่มีอยู่ในรายการนี้เด็ดขาด (เช่นห้ามพูดถึงปุ่ม "สรุปรายรับ" เพราะไม่มีจริง)
- ถ้าคำถามถามถึงอนาคต (เดือนหน้า เดือนถัดไป หรือเดือนที่ระบุชื่อ) ให้เช็คจาก "พยากรณ์รายรับเดือนถัดไป_3เดือน" และ "งานที่ยังไม่จ่ายเงิน" (ที่มีระบุเดือนกำกับไว้) ก่อนเสมอ ห้ามบอกว่าไม่มีข้อมูลทั้งที่จริงมีอยู่ในสองส่วนนี้

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
      })
    );
    const raw = response.text?.trim();
    return raw ? stripMarkdown(raw) : null;
  } catch (err) {
    console.error('answerFromData error:', err);
    return null;
  }
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
    { type: 'action', action: { type: 'message', label: '📅 งานเดือนนี้', text: 'งานเดือนนี้' } },
    { type: 'action', action: { type: 'message', label: '📦 งานสต็อก', text: 'งานสต็อก' } }
  );
  return { items: items.slice(0, 13) };
}

function withQuickReply(message: LineMessage): LineMessage {
  return { ...message, quickReply: getQuickReply() };
}

function buildSectionLabel(text: string, color: string) {
  return { type: 'text', text, size: 'xs', weight: 'bold', color, margin: 'lg' };
}

// Shared cream "bank statement" bubble shell every Quick Reply report below is built on --
// same visual language as buildJobSavedMessage (statement rows, separators, open-app footer),
// so every report reads as one consistent card style instead of a mix of card and plain text.
function buildReceiptCard(bodyContents: any[], altText: string): LineMessage {
  const contents: any = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', backgroundColor: '#FBF2E4', paddingAll: '20px', spacing: 'sm', contents: bodyContents },
  };
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    contents.footer = {
      type: 'box',
      layout: 'vertical',
      paddingAll: '12px',
      contents: [{ type: 'button', style: 'primary', color: '#E65F2B', action: { type: 'uri', label: 'เปิดแอป', uri: appUrl.replace(/\/$/, '') } }],
    };
  }
  return { type: 'flex', altText, contents };
}

function buildJobRow(name: string, client: string, amount: number, color: string) {
  return buildStatementRow(name + (client ? ` (${client})` : ''), formatCurrency(amount), { bold: false, color });
}

function buildUnpaidJobsMessage(snapshot: DataSnapshot): LineMessage {
  if (snapshot.unpaid.length === 0) return { type: 'text', text: '🎉 ตอนนี้ไม่มีงานค้างจ่ายเลยครับ' };
  const bodyContents: any[] = [
    buildStatementRow('งานค้างจ่าย', `ทั้งหมด ${snapshot.unpaid.length} งาน`, { size: 'xl', color: '#3D2314' }),
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    ...snapshot.unpaid.flatMap((j) => [
      buildJobRow(j.name, j.client, j.pending, '#A63F1B'),
      { type: 'text', text: `กำหนดชำระ ${j.dueText}`, size: 'xxs', color: '#A88A6E', align: 'end' },
    ]),
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    buildStatementRow('รวมค้างรับทั้งหมด', formatCurrency(snapshot.totalPendingAllTime), { color: '#A63F1B' }),
  ];
  return buildReceiptCard(bodyContents, `งานค้างจ่ายทั้งหมด ${snapshot.unpaid.length} งาน • รวม ${formatCurrency(snapshot.totalPendingAllTime)}`);
}

function buildThisMonthSummaryMessage(snapshot: DataSnapshot): LineMessage {
  const s = snapshot.thisMonth;
  const monthLabel = formatMonthKey(s.monthKey);
  const bodyContents: any[] = [
    buildStatementRow('สรุปเดือนนี้', monthLabel, { size: 'xl', color: '#3D2314' }),
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    buildStatementRow('รับแล้วจริง', formatCurrency(s.received), { bold: false, color: '#0E9F6E' }),
    buildStatementRow('รายจ่ายรวม', formatCurrency(s.fixedExpenseCalculated + s.variableExpense), { bold: false, color: '#A63F1B' }),
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    buildStatementRow('กระแสเงินสดสุทธิ', formatCurrency(Math.max(0, s.netFlow)), { color: '#3D2314' }),
    buildStatementRow('ยอดออมสะสมโดยประมาณ', formatCurrency(s.actualSavings), { bold: false, color: '#0E9F6E' }),
  ];
  return buildReceiptCard(bodyContents, `สรุปเดือนนี้ (${monthLabel}) • รับแล้ว ${formatCurrency(s.received)} • คงเหลือ ${formatCurrency(Math.max(0, s.netFlow))}`);
}

function buildWipJobsMessage(snapshot: DataSnapshot): LineMessage {
  if (snapshot.wip.length === 0) return { type: 'text', text: '📦 ตอนนี้ไม่มีงานในสต็อก (ยังไม่โพสต์) เลยครับ' };
  const bodyContents: any[] = [
    buildStatementRow('งานในสต็อก', `ทั้งหมด ${snapshot.wip.length} งาน`, { size: 'xl', color: '#3D2314' }),
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    ...snapshot.wip.map((j) => buildJobRow(j.name, j.client, j.value, '#4338CA')),
  ];
  return buildReceiptCard(bodyContents, `งานในสต็อก ${snapshot.wip.length} งาน (ยังไม่ส่งงาน)`);
}

// Flex "receipt" card version of the month's job list -- grouped into unpaid/paid/stock
// sections so it reads as a clean report instead of a wall of plain-text lines.
function buildThisMonthJobsMessage(snapshot: DataSnapshot): LineMessage {
  const s = snapshot.thisMonth;
  const monthLabel = formatMonthKey(s.monthKey);

  if (snapshot.thisMonthJobs.length === 0) {
    return { type: 'text', text: `📅 เดือนนี้ (${monthLabel}) ยังไม่มีงานเข้าเลยครับ` };
  }

  const wip = snapshot.thisMonthJobs.filter((j) => j.isPosted === false);
  const invoiced = snapshot.thisMonthJobs.filter((j) => j.isPosted !== false);
  const unpaid = invoiced.filter((j) => j.isUnpaid);
  const paid = invoiced.filter((j) => !j.isUnpaid);
  const unpaidSum = unpaid.reduce((sum, j) => sum + j.pending, 0);

  const bodyContents: any[] = [
    buildStatementRow('งานเดือนนี้', monthLabel, { size: 'xl', color: '#3D2314' }),
    { type: 'text', text: `ทั้งหมด ${snapshot.thisMonthJobs.length} งาน`, size: 'xs', color: '#A88A6E' },
  ];

  if (unpaid.length > 0) {
    bodyContents.push(
      { type: 'separator', margin: 'lg', color: '#E8DFD3' },
      buildSectionLabel(`💸 ยังไม่จ่าย (${unpaid.length} • ค้างรวม ${formatCurrency(unpaidSum)})`, '#A63F1B'),
      ...unpaid.map((j) => buildJobRow(j.name, j.client, j.pending, '#A63F1B'))
    );
  }
  if (paid.length > 0) {
    bodyContents.push(
      { type: 'separator', margin: 'lg', color: '#E8DFD3' },
      buildSectionLabel(`✅ จ่ายแล้ว (${paid.length})`, '#0E9F6E'),
      ...paid.map((j) => buildJobRow(j.name, j.client, j.value, '#0E9F6E'))
    );
  }
  if (wip.length > 0) {
    bodyContents.push(
      { type: 'separator', margin: 'lg', color: '#E8DFD3' },
      buildSectionLabel(`📦 ในสต็อก (${wip.length})`, '#4338CA'),
      ...wip.map((j) => buildJobRow(j.name, j.client, j.value, '#4338CA'))
    );
  }

  bodyContents.push(
    { type: 'separator', margin: 'lg', color: '#E8DFD3' },
    buildStatementRow('รวมมูลค่าทั้งหมด', formatCurrency(s.income), { color: '#3D2314' })
  );

  const altText = unpaid.length > 0
    ? `งานเดือนนี้ (${monthLabel}) ${snapshot.thisMonthJobs.length} งาน • ยังไม่จ่าย ${unpaid.length} งาน ค้าง ${formatCurrency(unpaidSum)}`
    : `งานเดือนนี้ (${monthLabel}) ${snapshot.thisMonthJobs.length} งาน`;
  return buildReceiptCard(bodyContents, altText);
}

const QUICK_ACTIONS: Record<string, (snapshot: DataSnapshot) => LineMessage> = {
  งานค้างจ่าย: buildUnpaidJobsMessage,
  สรุปเดือนนี้: buildThisMonthSummaryMessage,
  งานสต็อก: buildWipJobsMessage,
  งานเดือนนี้: buildThisMonthJobsMessage,
};

// Fallback for anything that isn't a Quick Reply command AND Gemini couldn't answer (unconfigured
// or erroring, e.g. quota) -- a greeting, a random question, or anything else. Since there's no
// pending chat flow to get stuck in, this is always a safe, friendly fallback rather than a
// leftover mid-conversation prompt.
const HELP_TEXT = [
  '🐿️ สวัสดีครับ! กระรอกตุนเงินพร้อมช่วยดูแลเงินให้แล้วครับ',
  'กดปุ่มด้านล่างได้เลย:',
  '📝 ฟอร์มบันทึก - เพิ่มงานหรือรายจ่ายใหม่',
  '📋 งานค้างจ่าย',
  '📊 สรุปเดือนนี้',
  '📅 งานเดือนนี้',
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

// LINE can't delete/unsend a message the bot already pushed -- there's no such API. This sends
// a follow-up "ยกเลิกแล้ว" card instead, so the chat at least shows the job was voided rather
// than leaving the original "บันทึกงานสำเร็จ" card looking like it's still active.
export function buildJobDeletedMessage(job: { name: string; client?: string; value: number }): LineMessage {
  const bodyContents = [
    buildStatementRow('ยกเลิกงาน', formatCurrency(job.value), { size: 'xl', color: '#78716C' }),
    { type: 'separator', margin: 'md', color: '#E8DFD3' },
    buildStatementRow('ชื่องาน', job.name, { bold: false }),
    ...(job.client ? [buildStatementRow('ลูกค้า', job.client, { bold: false })] : []),
    buildStatementRow('วันที่ยกเลิก', formatThaiTimestamp(), { bold: false }),
  ];
  return buildReceiptCard(bodyContents, `ยกเลิกงาน "${job.name}" แล้วครับ`);
}

// Same idea as buildJobDeletedMessage, for a deleted variable expense.
export function buildExpenseDeletedMessage(expense: { name: string; category?: string; amount: number }): LineMessage {
  const bodyContents = [
    buildStatementRow('ลบรายจ่าย', formatCurrency(expense.amount), { size: 'xl', color: '#78716C' }),
    { type: 'separator', margin: 'md', color: '#E8DFD3' },
    buildStatementRow('รายการ', expense.name, { bold: false }),
    ...(expense.category ? [buildStatementRow('หมวด', expense.category, { bold: false })] : []),
    buildStatementRow('วันที่ลบ', formatThaiTimestamp(), { bold: false }),
  ];
  return buildReceiptCard(bodyContents, `ลบรายจ่าย "${expense.name}" แล้วครับ`);
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
    return QUICK_ACTIONS[trimmed](buildDataSnapshot(user));
  }

  // Anything else is a free-form question -- try Gemini grounded in this user's real data.
  // answerFromData returns null (not an error string) whenever Gemini is unconfigured or the
  // call fails (including a 429 the retry couldn't clear), so an outage degrades to the same
  // friendly greeting/buttons a brand-new user sees, instead of a raw error.
  const aiAnswer = await answerFromData(trimmed, buildDataSnapshot(user));
  if (aiAnswer) {
    return { type: 'text', text: aiAnswer };
  }

  return { type: 'text', text: HELP_TEXT };
}

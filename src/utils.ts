import { Job, FixedExpenseItem } from './types';

// The built-in job type chips every account starts with. Anything a user adds via
// "เขียนประเภทงานเอง..." is a custom type, kept separate in the picker so it can be removed.
export const DEFAULT_JOB_TYPES = [
  'Sponsored Post',
  'Video Production',
  'Digital Product',
  'Consulting / Advisory',
  'งานทั่วไปอื่นๆ'
];

// Sum an itemized fixed-expense list (rent, car, internet, etc.) into the single total
// that the rest of the app's profit/cashflow math consumes.
export const sumFixedExpenseItems = (items: FixedExpenseItem[]): number => {
  return items.reduce((sum, item) => sum + (item.amount || 0), 0);
};

// Format currency beautifully
export const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val).replace('THB', '฿');
};

// Add thousand-separator commas to a raw numeric string as the user types (e.g. "12000" -> "12,000")
export const formatNumberWithCommas = (raw: string): string => {
  if (!raw) return '';
  const [intPart, decPart] = raw.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
};

// Strip commas/invalid characters from a formatted number input, keeping digits and a single decimal point
export const stripNumberInput = (input: string): string => {
  const cleaned = input.replace(/,/g, '').replace(/[^\d.]/g, '');
  const firstDotIndex = cleaned.indexOf('.');
  if (firstDotIndex === -1) return cleaned;
  return cleaned.slice(0, firstDotIndex + 1) + cleaned.slice(firstDotIndex + 1).replace(/\./g, '');
};

// Thai fixed annual public holidays (MM-DD format)
const THAI_FIXED_HOLIDAYS = [
  '01-01', // วันขึ้นปีใหม่
  '04-06', // วันจักรี
  '04-13', // วันสงกรานต์
  '04-14', // วันสงกรานต์
  '04-15', // วันสงกรานต์
  '05-01', // วันแรงงานแห่งชาติ
  '05-04', // วันฉัตรมงคล
  '06-03', // วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี
  '07-28', // วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว
  '08-12', // วันแม่แห่งชาติ
  '10-13', // วันคล้ายวันสวรรคต ร.9
  '10-23', // วันปิยมหาราช
  '12-05', // วันพ่อแห่งชาติ
  '12-10', // วันรัฐธรรมนูญ
  '12-31', // วันสิ้นปี
];

// Thai movable/Buddhist holidays and major extra holidays for 2024-2027
const THAI_MOVABLE_HOLIDAYS = new Set([
  // 2024
  '2024-02-24', '2024-02-26', '2024-05-10', '2024-05-22', '2024-07-20', '2024-07-21', '2024-07-22',
  // 2025
  '2025-02-12', '2025-05-09', '2025-05-11', '2025-05-12', '2025-07-10', '2025-07-11',
  // 2026
  '2026-03-03', '2026-05-14', '2026-05-30', '2026-06-01', '2026-07-29', '2026-07-30',
  // 2027
  '2027-02-21', '2027-02-22', '2027-05-10', '2027-05-19', '2027-07-18', '2027-07-19'
]);

export const isThaiPublicHoliday = (date: Date): boolean => {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const mmdd = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const yyyymmdd = `${y}-${mmdd}`;

  // Check if it's in the movable holiday list
  if (THAI_MOVABLE_HOLIDAYS.has(yyyymmdd)) {
    return true;
  }

  // Check if it's a fixed holiday
  if (THAI_FIXED_HOLIDAYS.includes(mmdd)) {
    return true;
  }

  // Substitution holiday check:
  // If date is a Monday (day 1):
  // check if yesterday (Sunday) or day before yesterday (Saturday) was a fixed holiday.
  if (date.getDay() === 1) {
    // Yesterday (Sunday)
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);
    const yestMmDd = `${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    
    // Day before yesterday (Saturday)
    const sat = new Date(date);
    sat.setDate(sat.getDate() - 2);
    const satMmDd = `${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`;

    if (THAI_FIXED_HOLIDAYS.includes(yestMmDd) || THAI_FIXED_HOLIDAYS.includes(satMmDd)) {
      return true;
    }
  }

  return false;
};

// Helper to format a Date object to YYYY-MM-DD in local timezone
export const formatLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dateVal = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dateVal}`;
};

// Calculate payDate based on postDate and creditTerm, with option to exclude weekends and public holidays
export const calculatePayDate = (
  postDateStr: string | undefined | null, 
  creditTerm: number, 
  excludeHolidays?: boolean
): string | null => {
  if (!postDateStr) return null;
  if (creditTerm === 0) return postDateStr;
  
  const date = new Date(postDateStr + 'T00:00:00');
  
  if (!excludeHolidays) {
    date.setDate(date.getDate() + creditTerm);
    return formatLocalDate(date);
  } else {
    let countedDays = 0;
    while (countedDays < creditTerm) {
      date.setDate(date.getDate() + 1);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
      const isHoliday = isThaiPublicHoliday(date);
      
      if (!isWeekend && !isHoliday) {
        countedDays++;
      }
    }
    return formatLocalDate(date);
  }
};

// Get name of month in Thai
export const getThaiMonthName = (monthIndex: number, short = false): string => {
  const fullMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  const shortMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  return short ? shortMonths[monthIndex] : fullMonths[monthIndex];
};

// Get relative days text (e.g., "อีก 5 วัน", "เลยกำหนด 2 วัน")
export const getRelativeDaysText = (dateStr: string | null | undefined): { text: string; isOverdue: boolean; daysCount: number } => {
  if (!dateStr) return { text: 'ยังไม่ระบุวัน', isOverdue: false, daysCount: 0 };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(dateStr + 'T00:00:00');
  
  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return { text: 'วันนี้', isOverdue: false, daysCount: 0 };
  } else if (diffDays < 0) {
    return { text: `เลยกำหนด ${Math.abs(diffDays)} วัน`, isOverdue: true, daysCount: diffDays };
  } else {
    return { text: `อีก ${diffDays} วัน`, isOverdue: false, daysCount: diffDays };
  }
};

// Parse a date string to get month key (e.g. "2026-06"). Jobs/expenses with no date at all
// return "" so they simply don't match any month filter, instead of silently attaching
// themselves to whatever month happens to be "today" when the app is opened.
export const getMonthKey = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '';
  return dateStr.substring(0, 7);
};

// Get list of 4 forecast month keys starting from current month
export const getForecastMonths = (baseDate = new Date()): string[] => {
  const months: string[] = [];
  const temp = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  for (let i = 0; i < 4; i++) {
    const y = temp.getFullYear();
    const m = String(temp.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    temp.setMonth(temp.getMonth() + 1);
  }
  return months;
};

// Format month key to Thai display label (e.g., "มิ.ย. 2026")
export const formatMonthKey = (key: string): string => {
  const [yearStr, monthStr] = key.split('-');
  const monthIdx = parseInt(monthStr) - 1;
  const yearTh = parseInt(yearStr) + 543; // Buddhist Era
  return `${getThaiMonthName(monthIdx, true)} ${yearTh}`;
};

// Format date string safely to Thai locale, returning "ยังไม่ระบุ" if empty or invalid
export const safeFormatThaiDate = (dateStr: string | undefined | null, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string => {
  if (!dateStr) return 'ยังไม่ระบุ';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return 'ยังไม่ระบุ';
    return date.toLocaleDateString('th-TH', options);
  } catch (e) {
    return 'ยังไม่ระบุ';
  }
};

// Download all jobs as a CSV file (UTF-8 BOM so Excel/Google Sheets read Thai text correctly).
// Returns false if there was nothing to export.
export const exportJobsToCSV = (jobs: Job[]): boolean => {
  if (!jobs || jobs.length === 0) return false;

  const headers = [
    'ชื่อโปรเจกต์',
    'ประเภทงาน',
    'ลูกค้า',
    'มูลค่ารวม (บาท)',
    'หัก ณ ที่จ่าย (%)',
    'จำนวนภาษีหัก ณ ที่จ่าย (บาท)',
    'ยอดได้รับแล้ว (บาท)',
    'ยอดค้างชำระ (บาท)',
    'สถานะโครงการ',
    'เครดิตเทอม (วัน)',
    'วันเริ่มงาน',
    'วันดีล/วันเผยแพร่',
    'กำหนดชำระเงิน',
    'หมายเหตุ'
  ];

  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""');
    return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
  };

  const rows = jobs.map(j => {
    let statusText = j.status;
    if (j.status === 'done') statusText = 'จ่ายแล้ว';
    else if (j.status === 'partial') statusText = 'มัดจำ/จ่ายบางส่วน';
    else if (j.status === 'pending') statusText = 'ยังไม่จ่าย';

    return [
      escapeCSV(j.name),
      escapeCSV(j.type || 'ทั่วไป'),
      escapeCSV(j.client || '-'),
      j.value || 0,
      j.whtRate || 0,
      j.whtAmount || 0,
      j.received || 0,
      j.pending || 0,
      escapeCSV(statusText),
      j.creditTerm || 0,
      escapeCSV(j.startDate || '-'),
      escapeCSV(j.postDate || '-'),
      escapeCSV(j.payDate || '-'),
      escapeCSV(j.note || '')
    ];
  });

  const csvContent = '﻿' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', `โปรเจกต์รายรับ_กระรอกตุนเสบียง_${dateStr}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return true;
};

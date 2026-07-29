import { Job, Goal, AppSettings } from './types';

// Helper to get relative dates
const getRelativeDateString = (daysOffset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
};

export const defaultSettings: AppSettings = {
  monthlyExpense: 12000,
  monthlyRevenueGoal: 35000,
  savingsPercentage: 40,
  allocatedMonths: {},
  accumulatedRemainder: 0,
};

export const defaultJobs: Job[] = [
  {
    id: 'job-1',
    name: 'สปอนเซอร์คลิปจัดโต๊ะคอม',
    type: 'Sponsored',
    client: 'DeskSpace Ltd',
    value: 25000,
    received: 25000,
    pending: 0,
    status: 'done',
    creditTerm: 0,
    postDate: getRelativeDateString(-15),
    payDate: getRelativeDateString(-15),
    note: 'ออนแอร์เรียบร้อย ได้รับค่าจ้างแล้ว',
  },
  {
    id: 'job-2',
    name: 'ตัดต่อวิดีโอโปรโมตแคมเปญ',
    type: 'Video Production',
    client: 'FashionCo Thailand',
    value: 40000,
    received: 15000,
    pending: 25000,
    status: 'partial',
    creditTerm: 30,
    postDate: getRelativeDateString(-5),
    payDate: getRelativeDateString(25), // Post date -5 + 30 days = 25 days in future
    note: 'จ่ายมัดจำแล้ว 15,000฿ ส่วนที่เหลือโอนใน 30 วัน',
  },
  {
    id: 'job-3',
    name: 'ขาย คอร์สออนไลน์ Lightroom',
    type: 'Digital Product',
    client: 'Direct Sales',
    value: 8500,
    received: 8500,
    pending: 0,
    status: 'done',
    creditTerm: 0,
    postDate: getRelativeDateString(-2),
    payDate: getRelativeDateString(-2),
    note: 'ยอดโอนเข้าบัญชีโดยตรง',
  },
  {
    id: 'job-4',
    name: 'รีวิวที่พักวิลล่าภูเก็ต Reels',
    type: 'Sponsored',
    client: 'Nirvana Resort',
    value: 20000,
    received: 0,
    pending: 20000,
    status: 'pending',
    creditTerm: 45,
    postDate: getRelativeDateString(-10),
    payDate: getRelativeDateString(35), // Post date -10 + 45 days = 35 days in future
    note: 'ส่งวิดีโอแล้ว รอออนแอร์และจ่ายเงินเครดิต 45 วัน',
  },
  {
    id: 'job-5',
    name: 'ถ่ายภาพเบื้องหลังมิวสิควิดีโอ',
    type: 'Video Production',
    client: 'MusicLab Ent',
    value: 12000,
    received: 0,
    pending: 12000,
    status: 'pending',
    creditTerm: 60,
    postDate: getRelativeDateString(-2),
    payDate: getRelativeDateString(58), // Post date -2 + 60 days = 58 days in future
    note: 'ลูกค้าดิวเครดิตเทอม 60 วันหลังส่งมอบไฟล์รูปภาพ',
  }
];

export const defaultGoals: Goal[] = [
  {
    id: 'goal-1',
    name: 'กล้อง Sony A7C II',
    type: 'buy',
    target: 69000,
    current: 28000,
    deadline: getRelativeDateString(120),
    emoji: '📷',
    bg: '#F5DDD8',
    acc: '#C96B5A',
    allocatedPercentage: 30,
    history: [
      {
        id: 'tx-101',
        type: 'deposit',
        amount: 20000,
        date: getRelativeDateString(-30),
        reason: 'โอนเงินก้อนตั้งต้นออมซื้อกล้อง',
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx-102',
        type: 'deposit',
        amount: 10000,
        date: getRelativeDateString(-15),
        reason: 'จัดสรรกำไรสุทธิประจำเดือน',
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx-103',
        type: 'withdraw',
        amount: 2000,
        date: getRelativeDateString(-5),
        reason: 'หักมัดจำซื้อกระเป๋ากล้อง และเมมโมรี่การ์ด',
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: 'goal-2',
    name: 'เงินสำรองฉุกเฉิน 6 เดือน',
    type: 'emergency',
    target: 72000,
    current: 45000,
    deadline: getRelativeDateString(200),
    emoji: '🚨',
    bg: '#E2D4EE',
    acc: '#7A5BAD',
    allocatedPercentage: 40,
    history: [
      {
        id: 'tx-201',
        type: 'deposit',
        amount: 35000,
        date: getRelativeDateString(-60),
        reason: 'เงินออมฉุกเฉินสะสมตั้งต้น',
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx-202',
        type: 'deposit',
        amount: 10000,
        date: getRelativeDateString(-20),
        reason: 'จัดสรรส่วนแบ่งรายได้สปอนเซอร์',
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: 'goal-3',
    name: 'ทริปเที่ยวญี่ปุ่นหิมะฟูจิ',
    type: 'buy',
    target: 50000,
    current: 12000,
    deadline: getRelativeDateString(180),
    emoji: '✈️',
    bg: '#D4E2F0',
    acc: '#4A7FB5',
    allocatedPercentage: 10,
    history: [
      {
        id: 'tx-301',
        type: 'deposit',
        amount: 12000,
        date: getRelativeDateString(-10),
        reason: 'โอนเข้าออมตั๋วเครื่องบินงวดแรก',
        createdAt: new Date().toISOString()
      }
    ]
  }
];

import React, { useState, useEffect } from 'react';
import { Job, Goal, AppSettings, StatusOption, CustomDialogState, NotifSettings, Expense } from './types';
import { defaultSettings, defaultJobs, defaultGoals } from './sampleData';
import { getMonthKey, formatMonthKey, DEFAULT_JOB_TYPES } from './utils';

import DashboardTab from './components/DashboardTab';
import JobsTab from './components/JobsTab';
import ExpenseRecordView from './components/ExpenseRecordView';
import TimelineTab from './components/TimelineTab';
import SplitTab from './components/SplitTab';
import SummaryTab from './components/SummaryTab';
import CustomDialog from './components/CustomDialog';
import Login from './components/Login';
import ResetPassword from './components/ResetPassword';
import MonthlyReportTab from './components/MonthlyReportTab';
import TaxTab from './components/TaxTab';
import { SettingsTab } from './components/SettingsTab';
import { InvoiceTab } from './components/InvoiceTab';
import { InsightTab } from './components/InsightTab';
import { PlansTab } from './components/PlansTab';
import { supabase } from './supabaseClient';
// Aliased: this file already has its own local `currentMonthKey` (a memoized string further
// down, computed from local machine time) -- importing the same name here would silently shadow
// it, and calling the shadowed string as a function is exactly the "Je is not a function" bug
// that made the LINE-notify balance figure fail (found via a decoded production sourcemap).
import { computeMonthlySummary, currentMonthKey as getCurrentMonthKeyBkk } from './monthlySummary';
import { Mascot } from './components/Mascot';
import { MascotToast } from './components/MascotToast';
import { TourModal, TourStep } from './components/TourModal';
import { ProfileSetupWizard } from './components/ProfileSetupWizard';
import { PremiumUpsell } from './components/PremiumUpsell';
import { ProPromoModal } from './components/ProPromoModal';
import { fireMascot } from './mascotBus';
import { leafBus } from './leafBus';
import { IconCrown, IconSpark, IconPalette } from './components/icons';

import { 
  Home, 
  Settings,
  Briefcase, 
  Calendar, 
  Percent, 
  Target,
  Sun,
  Moon,
  Wallet,
  LogOut,
  User,
  TrendingUp,
  Menu,
  X,
  Download,
  Cloud,
  Calculator,
  Database,
  Terminal,
  Check,
  Copy,
  ShieldAlert,
  Leaf,
  FileText,
  Smartphone,
  ChevronDown,
  Wrench,
  BarChart3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type TabKey = 'dashboard' | 'jobs' | 'tax' | 'summary' | 'timeline' | 'split' | 'report' | 'settings' | 'invoice' | 'insight' | 'plans';

// Core items stay visible at all times; "more" items are grouped under a
// collapsible section so first-time users see a simpler menu by default.
// This is the freelance-persona grouping -- also the fallback when no persona is set
// (existing accounts, or the setup wizard's persona step was skipped).
const NAV_ITEMS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; group: 'core' | 'more' | 'bottom' }[] = [
  { key: 'dashboard', label: 'ภาพรวมกระแสเงินสด', icon: Home, group: 'core' },
  { key: 'jobs', label: 'บันทึกรายรับ-รายจ่าย', icon: Briefcase, group: 'core' },
  { key: 'timeline', label: 'ไทม์ไลน์ปฏิทินงาน', icon: Calendar, group: 'core' },
  { key: 'summary', label: 'สรุปยอดรายรับ & ออม', icon: Wallet, group: 'more' },
  { key: 'split', label: 'จัดสรรเงิน & เป้าหมายออม', icon: Percent, group: 'more' },
  { key: 'report', label: 'รายงาน & เครดิตเทอม', icon: TrendingUp, group: 'more' },
  { key: 'insight', label: 'วิเคราะห์รายได้', icon: BarChart3, group: 'more' },
  { key: 'tax', label: 'ผู้ช่วยจัดการภาษี', icon: Calculator, group: 'more' },
  { key: 'invoice', label: 'ออกบิล & ใบเสร็จ', icon: FileText, group: 'more' },
  { key: 'plans', label: 'แพ็กเกจ & อัปเกรด', icon: IconCrown, group: 'bottom' },
  { key: 'settings', label: 'ตั้งค่าระบบ', icon: Settings, group: 'bottom' },
];

// Every feature stays reachable regardless of persona -- these lists only decide which
// tabs default to the always-visible "core" row vs the collapsible "more" section.
// dashboard/jobs/settings/plans aren't listed because they're always core/bottom
// (handled separately below) for every persona.
const PERSONA_CORE_KEYS: Record<'school' | 'university' | 'employee', TabKey[]> = {
  school: ['split'],
  university: ['split', 'summary'],
  employee: ['split', 'summary'],
};

const cleanStatuses = (arr: any[]): StatusOption[] => {
  if (!Array.isArray(arr)) return [
    { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
    { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
    { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
  ];

  let cleaned = arr.map(s => {
    let label = (s.label || '').trim();
    const compacted = label.replace(/\s+/g, '');
    if (
      compacted === 'ยังไม่จ่ายเลย' || 
      compacted === 'ยังไม่จ่ายเงินเลย' || 
      compacted === 'ยังไม่จ่ายเงิน' || 
      compacted === 'ยังไม่ไม่จ่าย' ||
      compacted === 'ยังไม่จ่าย'
    ) {
      label = 'ยังไม่จ่าย';
    }
    return {
      id: s.id,
      label: label,
      behavior: s.behavior || 'pending'
    };
  });

  const seenLabels = new Set<string>();
  const seenIds = new Set<string>();
  return cleaned.filter(s => {
    if (!s.id || !s.label) return false;
    const key = s.label.toLowerCase().trim().replace(/\s+/g, '');
    if (seenIds.has(s.id) || seenLabels.has(key)) {
      return false;
    }
    seenIds.add(s.id);
    seenLabels.add(key);
    return true;
  });
};

const cleanJobType = (t: any): string => {
  return String(t || '')
    .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]|📢|🎬|📦|💡|💼/g, "")
    .trim();
};

const cleanJobTypes = (arr: any[]): string[] => {
  if (!Array.isArray(arr)) return DEFAULT_JOB_TYPES;

  return Array.from(new Set(arr.map(cleanJobType))).filter(Boolean);
};

const cleanJobs = (arr: any[]): Job[] => {
  if (!Array.isArray(arr)) return [];
  return arr.map(j => ({
    ...j,
    type: cleanJobType(j.type) || 'ยังไม่ระบุ'
  }));
};

const TOUR_STEPS: TourStep[] = [
  {
    title: "ยินดีต้อนรับสู่กระรอกตุนเงิน!",
    description: "ผมคือคุณกระรอกน้อย ผู้ช่วยตุนเสบียงเงินสดของคุณครับ! ผมจะขอพาคุณไปชมรอบๆ เพื่อแนะนำฟีเจอร์เด็ดๆ ทั้ง 9 ส่วนของเครื่องมือฟรีแลนซ์ไทยตัวนี้อย่างรวดเร็วเลยนะครับ!",
    mood: "wave",
    tab: "dashboard"
  },
  {
    title: "1. ภาพรวมกระแสเงินสด",
    description: "หน้า Dashboard หลักของคุณ! แสดงยอดเงินสดที่ได้รับแล้ว, คาดการณ์ยอดรอจ่าย (Pending), ตัวชี้วัดเป้าหมายรายได้ และประวัติแบบย่อ เพื่อให้คุณไม่พลาดสถานะการเงินเดือนปัจจุบัน",
    mood: "happy",
    tab: "dashboard"
  },
  {
    title: "2. งานดีล & บันทึกรับเงิน",
    description: "ที่สำหรับบันทึกข้อตกลงงานดีลต่างๆ กำหนดวันดีล เครดิตเทอม และเก็บยอดมัดจำหรือรอจ่ายอย่างเป็นระเบียบ ระบบจะช่วยแจ้งเตือนคุณแบบ Realtime เมื่อใกล้เลยวันดีล!",
    mood: "proud",
    tab: "jobs"
  },
  {
    title: "3. ไทม์ไลน์ปฏิทินงาน",
    description: "มองเห็นตารางงานและกำหนดชำระเงินล่วงหน้าในรูปแบบ 'ปฏิทินแบบไทย' และแถบไทม์ไลน์ที่เรียงตามเวลาอย่างสวยงาม เพื่อการวางแผนที่ไม่ซ้อนทับกัน",
    mood: "happy",
    tab: "timeline"
  },
  {
    title: "4. จัดสรรเงิน & เป้าหมายออม",
    description: "ระบบจำลองการตุนเสบียง! แบ่งรายรับที่ได้เป็นส่วนๆ ทันที ทั้งงบส่วนตัว, ภาษี, สำรองฉุกเฉิน, และเป้าหมายเงินออมต่างๆ ตามเปอร์เซ็นต์ที่คุณชอบ เพื่อนิสัยการเงินที่ดี",
    mood: "celebrate",
    tab: "split"
  },
  {
    title: "5. สรุปยอดรายรับ & ออม",
    description: "หน้ารวบรวมรายรับสุทธิที่ยืนยันแล้ว และยอดโอนเงินสะสมเข้าเป้าหมายในแต่ละเดือน ช่วยเช็กความคืบหน้าความมั่งคั่งของคุณอย่างโปร่งใส",
    mood: "proud",
    tab: "summary"
  },
  {
    title: "6. รายงานวิเคราะห์ & เครดิตเทอม",
    description: "วิเคราะห์เชิงลึกทางการเงิน! ดูกราฟแนวโน้มรายรับเฉลี่ย, สรุปเครดิตเทอมเฉลี่ยของลูกค้าแต่ละเจ้า เพื่อให้คุณรู้ว่าใครจ่ายเงินตรงเวลาที่สุด หรือใครจ่ายช้าที่สุด",
    mood: "happy",
    tab: "report"
  },
  {
    title: "7. ผู้ช่วยจัดการภาษี",
    description: "ฟรีแลนซ์ไม่ต้องกลัวภาษีอีกต่อไป! คำนวณภาษีเงินได้คร่าวๆ (หักค่าใช้จ่ายตามมาตรา 40) แนะนำรายการลดหย่อนต่างๆ และตรวจสอบใบหักภาษี ณ ที่จ่าย (WHT 3%) อย่างง่ายดาย",
    mood: "alert",
    tab: "tax"
  },
  {
    title: "8. เครื่องมือออกเอกสารสำเร็จรูป",
    description: "ระบบทำใบเสนอราคา (Quotation), ใบแจ้งหนี้ (Invoice) และใบเสร็จรับเงิน (Receipt) แบบครบวงจร ดึงข้อมูลจากดีลงานฟรีแลนซ์ได้ทันที กดเซฟเป็น PDF ส่งลูกค้าได้ทันใจ",
    mood: "wave",
    tab: "invoice"
  },
  {
    title: "9. ข้อมูลโปรไฟล์ & ตั้งค่าระบบ",
    description: "ตั้งค่ารูปโปรไฟล์, ที่อยู่ผู้เสียภาษี และช่องทางบัญชีธนาคารเพื่อแสดงบนเอกสาร รวมถึงปรับสัดส่วนการเก็บออมและการล้างข้อมูล/นำเข้า-ส่งออกสำรองออฟไลน์ได้ตามต้องการ",
    mood: "happy",
    tab: "settings"
  },
  {
    title: "การทัวร์สิ้นสุดแล้วครับ!",
    description: "ยอดเยี่ยมมากครับ! ตอนนี้คุณรู้จักกระรอกตุนเงิน ครบถ้วนแล้ว พร้อมสำหรับการวางแผนและเก็บตุนเสบียงเงินสดฟรีแลนซ์อย่างเป็นสุขแล้วครับ ขอให้งานดีลหลั่งไหลเงินล้นมือนะครับ!",
    mood: "celebrate",
    tab: "dashboard"
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [moreNavOpen, setMoreNavOpen] = useState(false);

  const renderNavButton = (item: typeof NAV_ITEMS[number], closeMobileOnClick: boolean) => {
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        onClick={() => {
          setActiveTab(item.key);
          if (closeMobileOnClick) setIsMobileMenuOpen(false);
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
          activeTab === item.key
            ? 'bg-blue-acc/10 text-[#E65F2B] dark:text-[#FFA473] font-black border-l-4 border-[#E65F2B]'
            : 'text-brand-muted hover:bg-brand-faint/60 dark:hover:bg-neutral-800/60 hover:text-brand-text'
        }`}
      >
        <Icon className="w-4.5 h-4.5" />
        <span>{item.label}</span>
      </button>
    );
  };

  const renderMoreToggle = () => (
    <button
      type="button"
      onClick={() => setMoreNavOpen(open => !open)}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-xs font-extrabold text-brand-muted hover:bg-brand-faint/60 dark:hover:bg-neutral-800/60 hover:text-brand-text transition-all cursor-pointer"
    >
      <span className="flex items-center gap-3">
        <Wrench className="w-4.5 h-4.5" />
        <span>เครื่องมือเพิ่มเติม</span>
      </span>
      <ChevronDown className={`w-4 h-4 transition-transform ${showMoreNavItems ? 'rotate-180' : ''}`} />
    </button>
  );

  // 🐿️ Onboarding Tour State
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [isSetupWizardPreview, setIsSetupWizardPreview] = useState(false);

  const handleNextTourStep = () => {
    if (tourStep === null) return;
    if (tourStep < TOUR_STEPS.length - 1) {
      const nextStep = tourStep + 1;
      setTourStep(nextStep);
      setActiveTab(TOUR_STEPS[nextStep].tab as any);
    } else {
      handleCompleteTour();
    }
  };

  const handlePrevTourStep = () => {
    if (tourStep === null || tourStep === 0) return;
    const prevStep = tourStep - 1;
    setTourStep(prevStep);
    setActiveTab(TOUR_STEPS[prevStep].tab as any);
  };

  const handleCompleteTour = () => {
    if (session?.user?.email) {
      localStorage.setItem(`cashflow_onboarding_completed_${session.user.email}`, 'true');
    }
    setTourStep(null);
    setActiveTab('dashboard');
  };

  // Authentication State
  const [session, setSession] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  // Dark Mode reactive state & local storage synchronization
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('cashflow_dark_mode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('cashflow_dark_mode', darkMode.toString());
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Auth session listener
  useEffect(() => {
    // Check URL hash for password recovery link
    if (window.location.hash && window.location.hash.includes('type=recovery')) {
      setIsRecoveryMode(true);
    }

    const checkSession = async () => {
      const savedGuest = localStorage.getItem('cashflow_guest_session');
      if (savedGuest) {
        try {
          setSession(JSON.parse(savedGuest));
          setLoadingSession(false);
          return;
        } catch (e) {}
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setSession(session);
        } else {
          const sg = localStorage.getItem('cashflow_guest_session');
          if (sg) {
            setSession(JSON.parse(sg));
          } else {
            setSession(null);
          }
        }
      } catch (e) {
        console.error(e);
        const sg = localStorage.getItem('cashflow_guest_session');
        if (sg) setSession(JSON.parse(sg));
      } finally {
        setLoadingSession(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
      if (session) {
        setSession(session);
        localStorage.removeItem('cashflow_guest_session');
      } else {
        const sg = localStorage.getItem('cashflow_guest_session');
        if (sg) {
          setSession(JSON.parse(sg));
        } else {
          setSession(null);
        }
      }
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleGuestLogin = (guestEmail: string) => {
    const guestSessionObj = {
      user: {
        email: guestEmail,
        id: 'guest-' + Date.now()
      },
      isGuest: true
    };
    localStorage.setItem('cashflow_guest_session', JSON.stringify(guestSessionObj));
    setSession(guestSessionObj);
  };

  const handleSignOut = async () => {
    localStorage.removeItem('cashflow_guest_session');
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error(e);
    }
  };

  // Load state from local storage or default to mockup values
  const [jobs, setJobs] = useState<Job[]>(() => {
    const saved = localStorage.getItem('cashflow_jobs');
    return cleanJobs(saved ? JSON.parse(saved) : defaultJobs);
  });

  const [goals, setGoals] = useState<Goal[]>(() => {
    const saved = localStorage.getItem('cashflow_goals');
    return saved ? JSON.parse(saved) : defaultGoals;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('cashflow_settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  // Persona-adjusted nav grouping -- everything stays reachable, this just decides what
  // shows up in the always-visible row by default (see PERSONA_CORE_KEYS above).
  const navItems = React.useMemo(() => {
    const persona = settings.userPersona;
    if (!persona || persona === 'freelance') return NAV_ITEMS;
    const coreKeys = PERSONA_CORE_KEYS[persona];
    return NAV_ITEMS.map(item =>
      item.group === 'bottom' || item.key === 'dashboard' || item.key === 'jobs'
        ? item
        : { ...item, group: coreKeys.includes(item.key) ? 'core' as const : 'more' as const }
    );
  }, [settings.userPersona]);
  const isMoreTabActive = navItems.some(item => item.group === 'more' && item.key === activeTab);
  const showMoreNavItems = moreNavOpen || isMoreTabActive;

  const [notifSettings, setNotifSettings] = useState<NotifSettings>(() => {
    return {
      enabled: true,
      alertEmail: '',
      serviceType: 'mailto',
      emailjsServiceId: '',
      emailjsTemplateId: '',
      emailjsPublicKey: '',
      pendingQueue: []
    };
  });

  // Dynamic list of custom statuses
  const [statuses, setStatuses] = useState<StatusOption[]>(() => {
    const saved = localStorage.getItem('cashflow_statuses');
    if (saved) {
      try {
        return cleanStatuses(JSON.parse(saved));
      } catch (e) {}
    }
    return [
      { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
      { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
      { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
    ];
  });

  // Dynamic list of custom job types
  const [jobTypes, setJobTypes] = useState<string[]>(() => {
    const saved = localStorage.getItem('cashflow_job_types');
    if (saved) {
      try {
        return cleanJobTypes(JSON.parse(saved));
      } catch (e) {}
    }
    return DEFAULT_JOB_TYPES;
  });

  // Dynamic list of expenses
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem('cashflow_expenses');
    return saved ? JSON.parse(saved) : [];
  });

  // User profile avatar image (base64 data URL). Synced to the user_cashflow_data row in
  // Supabase so it follows the account across devices; localStorage is kept only as a fast
  // local cache for instant paint before the cloud fetch resolves.
  const [userAvatar, setUserAvatar] = useState<string>('');

  const handleUpdateUserAvatar = (newAvatar: string) => {
    setUserAvatar(newAvatar);
    const email = session?.user?.email;
    if (!email) return;
    if (newAvatar) {
      localStorage.setItem(`cashflow_user_avatar_${email}`, newAvatar);
    } else {
      localStorage.removeItem(`cashflow_user_avatar_${email}`);
    }
    const currentUser = session?.user;
    if (currentUser && !session?.isGuest) {
      supabase
        .from('user_cashflow_data')
        .update({ avatar_data_url: newAvatar || null })
        .eq('user_id', currentUser.id)
        .then(({ error }) => {
          if (error) console.warn('Failed to sync avatar to cloud:', error);
        });
    }
  };

  // Track loaded state for the current logged-in user email
  const [isLoadedForUser, setIsLoadedForUser] = useState<string | null>(null);

  // Cloud Sync states
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'synced' | 'pending' | 'failed' | 'not_setup'>('not_setup');
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [isProPromoOpen, setIsProPromoOpen] = useState(false);
  const [lastCloudError, setLastCloudError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<{
    status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
    plan: string | null;
    currentPeriodEnd: string | null;
  } | null>(null);

  // First 30 days after signup are free automatically, based on the account's real creation
  // date from Supabase Auth (not something the client can fake). No Stripe interaction needed.
  const FREE_TRIAL_DAYS = 30;
  const trialEndsAt = React.useMemo(() => {
    const createdAt = session?.user?.created_at;
    if (!createdAt || session?.isGuest) return null;
    return new Date(new Date(createdAt).getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  }, [session?.user?.created_at, session?.isGuest]);
  const isInFreeTrial = !!trialEndsAt && trialEndsAt.getTime() > Date.now();

  // Paid access: an 'active' one-time payment that hasn't expired yet (renewed monthly by hand)
  const isPaidActive =
    subscription?.status === 'active' &&
    !!subscription.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd).getTime() > Date.now();

  const isPro = isInFreeTrial || isPaidActive;

  // 🌰 Global Month Exploration (สำรวจฤดูกาลเก็บเกี่ยว)
  const currentMonthKey = React.useMemo(() => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
  }, []);

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(currentMonthKey);

  const availableMonthKeys = React.useMemo(() => {
    const keys = new Set<string>();
    const today = new Date();
    for (let i = -12; i <= 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      keys.add(`${y}-${m}`);
    }
    jobs.forEach(j => {
      const dateKey = j.payDate || j.postDate;
      if (dateKey) {
        keys.add(getMonthKey(dateKey));
      }
    });
    return Array.from(keys).sort();
  }, [jobs]);

  useEffect(() => {
    if (!availableMonthKeys.includes(selectedMonthKey)) {
      setSelectedMonthKey(currentMonthKey);
    }
  }, [availableMonthKeys, selectedMonthKey, currentMonthKey]);

  // Format generic error helper
  const formatError = (err: any): string => {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    return err.message || JSON.stringify(err);
  };

  const loadSubscriptionData = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.log('Subscription table query or structure error, defaulting to free:', error.message);
        setSubscription({ status: 'free', plan: null, currentPeriodEnd: null });
        return;
      }

      if (data) {
        setSubscription({
          status: data.status || 'free',
          plan: data.plan || null,
          currentPeriodEnd: data.current_period_end || null
        });
      } else {
        setSubscription({ status: 'free', plan: null, currentPeriodEnd: null });
      }
    } catch (err) {
      console.log('Catch subscription load error, defaulting to free:', err);
      setSubscription({ status: 'free', plan: null, currentPeriodEnd: null });
    }
  };

  // Stripe Payment Link for the Pro subscription. Appending client_reference_id lets the
  // webhook know which app user just paid, without needing a server-created Checkout Session.
  const PRO_PAYMENT_LINK = 'https://buy.stripe.com/6oUeVc8jj7KEgvP4XV5wI00';

  // The webhook extends access by setting current_period_end to (now + 30 days) rather than
  // adding onto the existing period, since this is a manual monthly payment, not an auto-charging
  // Stripe subscription. Paying again while still well within an active period would therefore
  // just discard the remaining paid days instead of stacking them -- so only let people through to
  // pay once they're close to (or past) their current expiry date.
  const RENEWAL_GRACE_DAYS = 3;

  const handleUpgrade = () => {
    const currentUser = session?.user;
    if (!currentUser || session?.isGuest) {
      triggerAlert('ต้องสมัครสมาชิกก่อนครับ', 'กรุณาสมัครบัญชีจริงด้วยอีเมล (ไม่ใช่โหมดทดลองใช้งานฟรี) ก่อนอัปเกรดเป็นสมาชิกรายเดือนครับ');
      return;
    }

    if (isPaidActive && subscription?.currentPeriodEnd) {
      const periodEnd = new Date(subscription.currentPeriodEnd);
      const daysRemaining = Math.ceil((periodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      if (daysRemaining > RENEWAL_GRACE_DAYS) {
        triggerAlert(
          'ยังไม่ต้องต่ออายุตอนนี้ครับ',
          `แพ็กเกจ Pro ของคุณยังใช้งานได้ถึงวันที่ ${periodEnd.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} (เหลืออีก ${daysRemaining} วัน) เนื่องจากระบบต่ออายุแบบจ่ายเองรายเดือน การจ่ายซ้ำตอนนี้จะทำให้วันที่เหลืออยู่หายไปฟรีๆ ระบบจะเปิดให้ต่ออายุอีกครั้งเมื่อใกล้ครบกำหนด (ประมาณ ${RENEWAL_GRACE_DAYS} วันก่อนหมดอายุ) หรือหลังจากหมดอายุแล้วครับ`
        );
        return;
      }
    }

    const url = new URL(PRO_PAYMENT_LINK);
    url.searchParams.set('client_reference_id', currentUser.id);
    if (currentUser.email) url.searchParams.set('prefilled_email', currentUser.email);
    window.location.href = url.toString();
  };

  // Handle redirect back from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get('checkout');
    if (checkoutResult && session?.user?.id) {
      if (checkoutResult === 'success') {
        loadSubscriptionData(session.user.id);
        triggerAlert('สมัครสมาชิกสำเร็จ!', 'เริ่มทดลองใช้ฟรี 30 วันได้เลยครับ ขอบคุณที่สนับสนุนกระรอกตุนเงินนะครับ!');
      }
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Load Cloud Data function
  const loadCloudData = async (email: string) => {
    setCloudSyncStatus('pending');
    setLastCloudError(null);

    const currentUser = session?.user;
    if (!currentUser || session?.isGuest) {
      setCloudSyncStatus('not_setup');
      setSubscription(null);
      return false;
    }

    // Load subscription status in background
    loadSubscriptionData(currentUser.id);

    try {
      const { data, error } = await supabase
        .from('user_cashflow_data')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        if (data.jobs) setJobs(cleanJobs(data.jobs));
        if (data.goals) setGoals(data.goals);
        if (data.statuses) setStatuses(cleanStatuses(data.statuses));
        if (data.job_types) {
          setJobTypes(cleanJobTypes(data.job_types));
        }
        if (data.settings) setSettings(data.settings);
        if (data.notif_settings) setNotifSettings(data.notif_settings);
        if (data.expenses) setExpenses(data.expenses);
        if (data.avatar_data_url) {
          setUserAvatar(data.avatar_data_url);
        } else {
          // One-time migration: an avatar saved locally before this device ever synced to
          // the cloud gets pushed up so other devices/logins can see it too.
          const localAvatar = localStorage.getItem(`cashflow_user_avatar_${email}`);
          if (localAvatar) {
            setUserAvatar(localAvatar);
            supabase
              .from('user_cashflow_data')
              .update({ avatar_data_url: localAvatar })
              .eq('user_id', currentUser.id)
              .then(({ error: avatarErr }) => {
                if (avatarErr) console.warn('Failed to migrate local avatar to cloud:', avatarErr);
              });
          }
        }
        setCloudSyncStatus('synced');
        return true;
      } else {
        // Document doesn't exist yet, we'll try to sync local data to cloud initially
        setCloudSyncStatus('synced');

        // Read fresh local storage values for this specific email
        const savedJobs = localStorage.getItem(`cashflow_jobs_${email}`);
        const savedGoals = localStorage.getItem(`cashflow_goals_${email}`);
        const savedStatuses = localStorage.getItem(`cashflow_statuses_${email}`);
        const savedJobTypes = localStorage.getItem(`cashflow_job_types_${email}`);
        const savedSettings = localStorage.getItem(`cashflow_settings_${email}`);
        const savedNotifSettings = localStorage.getItem(`cashflow_notif_settings_${email}`);
        const savedExpenses = localStorage.getItem(`cashflow_expenses_${email}`);

        await saveCloudData(email, {
          jobs: savedJobs ? JSON.parse(savedJobs) : jobs,
          goals: savedGoals ? JSON.parse(savedGoals) : goals,
          statuses: savedStatuses ? JSON.parse(savedStatuses) : statuses,
          jobTypes: savedJobTypes ? JSON.parse(savedJobTypes) : jobTypes,
          settings: savedSettings ? JSON.parse(savedSettings) : settings,
          notifSettings: savedNotifSettings ? JSON.parse(savedNotifSettings) : {
            enabled: true,
            alertEmail: email,
            serviceType: 'mailto',
            emailjsServiceId: '',
            emailjsTemplateId: '',
            emailjsPublicKey: '',
            pendingQueue: []
          },
          expenses: savedExpenses ? JSON.parse(savedExpenses) : expenses
        });
        return true;
      }
    } catch (err: any) {
      const formattedErr = formatError(err);
      console.warn('Catch cloud load error:', formattedErr, err);
      setLastCloudError(formattedErr);
      setCloudSyncStatus('failed');
      return false;
    }
  };

  // Save Cloud Data function
  const saveCloudData = async (email: string, payload: any) => {
    setLastCloudError(null);
    const currentUser = session?.user;
    if (!currentUser || session?.isGuest) {
      setCloudSyncStatus('not_setup');
      return;
    }

    try {
      // notif_settings is intentionally left out of this upsert and merged separately below --
      // several of its keys (lineUserId, lineLinkCode, linePendingJob, lastDigestSentDate,
      // lastMonthlyReportSentMonth, ...) are written server-side by the LINE webhook/assistant
      // and the cron jobs. A blind overwrite here from this device's in-memory copy would erase
      // those the next time this device autosaves (confirmed: LINE linking would silently drop
      // out mid-conversation because of exactly this race).
      const upsertData = {
        user_id: currentUser.id,
        email: email,
        jobs: payload.jobs || [],
        goals: payload.goals || [],
        statuses: payload.statuses || [],
        job_types: payload.jobTypes || [],
        settings: payload.settings || {},
        expenses: payload.expenses || [],
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('user_cashflow_data')
        .upsert(upsertData, { onConflict: 'user_id' });

      if (error) throw error;

      // Run after the row is guaranteed to exist (the upsert above creates it on first save).
      // merge_notif_settings does notif_settings = coalesce(notif_settings, '{}') || patch in a
      // single statement, so keys this device doesn't know about are left untouched server-side.
      // lineUserId is stripped out here on purpose: the merge only protects a key when this
      // device's patch omits it entirely, but this device's in-memory copy goes stale the moment
      // the LINE webhook links the account from an entirely separate session (the phone's LINE
      // app) -- any autosave/tab-hide flush firing afterward would still hold the old value and
      // clobber the real link right back to disconnected. Disconnecting writes lineUserId itself,
      // immediately, via its own direct RPC call (see handleDisconnectLine) instead of this path.
      const { lineUserId: _omitLineUserId, ...notifPatch } = payload.notifSettings || {};
      const { error: notifError } = await supabase.rpc('merge_notif_settings', {
        p_user_id: currentUser.id,
        p_patch: notifPatch,
      });
      if (notifError) throw notifError;

      setCloudSyncStatus('synced');
    } catch (err: any) {
      const formattedErr = formatError(err);
      console.warn('Catch cloud save error:', formattedErr, err);
      setLastCloudError(formattedErr);
      setCloudSyncStatus('failed');
    }
  };

  // Load user data whenever session changes
  useEffect(() => {
    if (session?.user?.email) {
      const email = session.user.email;
      if (isLoadedForUser === email) return;

      const savedJobs = localStorage.getItem(`cashflow_jobs_${email}`);
      setJobs(cleanJobs(savedJobs ? JSON.parse(savedJobs) : defaultJobs));

      const savedGoals = localStorage.getItem(`cashflow_goals_${email}`);
      setGoals(savedGoals ? JSON.parse(savedGoals) : defaultGoals);

      const savedSettings = localStorage.getItem(`cashflow_settings_${email}`);
      setSettings(savedSettings ? JSON.parse(savedSettings) : defaultSettings);

      const savedExpenses = localStorage.getItem(`cashflow_expenses_${email}`);
      setExpenses(savedExpenses ? JSON.parse(savedExpenses) : []);

      const savedNotifSettings = localStorage.getItem(`cashflow_notif_settings_${email}`);
      setNotifSettings(savedNotifSettings ? JSON.parse(savedNotifSettings) : {
        enabled: true,
        alertEmail: email,
        serviceType: 'mailto',
        emailjsServiceId: '',
        emailjsTemplateId: '',
        emailjsPublicKey: '',
        pendingQueue: []
      });

      const savedStatuses = localStorage.getItem(`cashflow_statuses_${email}`);
      if (savedStatuses) {
        setStatuses(cleanStatuses(JSON.parse(savedStatuses)));
      } else {
        setStatuses([
          { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
          { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
          { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
        ]);
      }

      const savedJobTypes = localStorage.getItem(`cashflow_job_types_${email}`);
      if (savedJobTypes) {
        try {
          setJobTypes(cleanJobTypes(JSON.parse(savedJobTypes)));
        } catch (e) {
          setJobTypes([]);
        }
      } else {
        setJobTypes(DEFAULT_JOB_TYPES);
      }

      const savedAvatar = localStorage.getItem(`cashflow_user_avatar_${email}`);
      setUserAvatar(savedAvatar || '');

      setIsLoadedForUser(email);
      // Trigger Cloud sync loading
      loadCloudData(email);
    } else {
      setIsLoadedForUser(null);
      setUserAvatar('');
      setSubscription(null);
      setJobs(cleanJobs(defaultJobs));
      setGoals(defaultGoals);
      setSettings(defaultSettings);
      setExpenses([]);
      setStatuses([
        { id: 'done', label: 'จ่ายเงินครบแล้ว', behavior: 'done' },
        { id: 'partial', label: 'มัดจำแล้ว', behavior: 'partial' },
        { id: 'pending', label: 'ยังไม่จ่าย', behavior: 'pending' },
      ]);
      setJobTypes(DEFAULT_JOB_TYPES);
      setNotifSettings({
        enabled: true,
        alertEmail: '',
        serviceType: 'mailto',
        emailjsServiceId: '',
        emailjsTemplateId: '',
        emailjsPublicKey: '',
        pendingQueue: []
      });
      setCloudSyncStatus('not_setup');
    }
  }, [session, isLoadedForUser]);

  // 🐿️ Auto-trigger Onboarding Tour for new users (only after the account setup wizard is done)
  useEffect(() => {
    if (isLoadedForUser && settings.profileSetupCompleted) {
      const completed = localStorage.getItem(`cashflow_onboarding_completed_${isLoadedForUser}`);
      if (completed !== 'true') {
        setTourStep(0);
      }
    } else if (!isLoadedForUser) {
      setTourStep(null);
    }
  }, [isLoadedForUser, settings.profileSetupCompleted]);

  // 🎉 Promote the Pro plan once per calendar day to logged-in, non-guest, non-Pro users after
  // their data has loaded. Dismissible; marks today as "shown" the moment it opens so closing it
  // (or just not acting on it) never brings it back again the same day.
  useEffect(() => {
    if (!isLoadedForUser || session?.isGuest || isPro) return;
    const todayKey = new Date().toISOString().split('T')[0];
    const storageKey = `cashflow_promo_last_shown_${isLoadedForUser}`;
    if (localStorage.getItem(storageKey) === todayKey) return;
    localStorage.setItem(storageKey, todayKey);
    setIsProPromoOpen(true);
  }, [isLoadedForUser, session?.isGuest, isPro]);

  // Sync statuses and jobTypes to LocalStorage
  useEffect(() => {
    if (session?.user?.email && isLoadedForUser === session.user.email) {
      localStorage.setItem(`cashflow_statuses_${session.user.email}`, JSON.stringify(statuses));
    }
  }, [statuses, session, isLoadedForUser]);

  useEffect(() => {
    if (session?.user?.email && isLoadedForUser === session.user.email) {
      localStorage.setItem(`cashflow_job_types_${session.user.email}`, JSON.stringify(jobTypes));
    }
  }, [jobTypes, session, isLoadedForUser]);

  useEffect(() => {
    if (session?.user?.email && isLoadedForUser === session.user.email) {
      localStorage.setItem(`cashflow_expenses_${session.user.email}`, JSON.stringify(expenses));
    }
  }, [expenses, session, isLoadedForUser]);

  // Modal Control States
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [isAddGoalOpen, setIsAddGoalOpen] = useState(false);
  const [isPwaModalOpen, setIsPwaModalOpen] = useState(false);
  const [initialSelectedGoalId, setInitialSelectedGoalId] = useState<string | null>(null);
  const [jobIdToOpen, setJobIdToOpen] = useState<string | null>(null);
  const [autoOpenAddExpense, setAutoOpenAddExpense] = useState(false);
  // Umbrella "บันทึกรายรับ-รายจ่าย" tab: income (jobs) and expense are sub-modes of the
  // same place instead of living in two disconnected tabs.
  const [recordMode, setRecordMode] = useState<'income' | 'expense'>('income');

  // Deep links from the LINE assistant's Quick Reply buttons: once this user's data has loaded,
  // jump straight to the relevant spot in the Jobs tab and strip the param from the URL.
  // ?job=<id> opens that job; ?openAddJob=1 / ?openAddExpense=1 pop the real add-job/add-expense
  // form straight open (reusing the actual in-app modal, not a separate bare-bones page).
  useEffect(() => {
    if (!(session?.user?.email && isLoadedForUser === session.user.email)) return;
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get('job');
    const openAddJob = params.get('openAddJob');
    const openAddExpense = params.get('openAddExpense');
    if (!jobId && !openAddJob && !openAddExpense) return;

    if (jobId) setJobIdToOpen(jobId);
    if (openAddJob) {
      setRecordMode('income');
      setIsAddJobOpen(true);
    }
    if (openAddExpense) {
      setRecordMode('expense');
      setAutoOpenAddExpense(true);
    }
    setActiveTab('jobs');

    params.delete('job');
    params.delete('openAddJob');
    params.delete('openAddExpense');
    const newSearch = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`);
  }, [session, isLoadedForUser]);

  // Custom Dialog state for elegant, non-blocking prompts/alerts
  const [dialog, setDialog] = useState<CustomDialogState>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const triggerAlert = (title: string, message: string, onConfirm?: () => void) => {
    setDialog({
      isOpen: true,
      type: 'alert',
      title,
      message,
      onConfirm: () => {
        if (onConfirm) onConfirm();
      }
    });
  };

  const triggerConfirm = (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => {
    setDialog({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      onConfirm: () => {
        onConfirm();
      },
      onCancel
    });
  };

  const triggerPrompt = (
    title: string,
    message: string,
    defaultValue: string,
    placeholder: string,
    inputType: 'text' | 'number',
    onConfirm: (val: string) => void,
    onCancel?: () => void
  ) => {
    setDialog({
      isOpen: true,
      type: 'prompt',
      title,
      message,
      placeholder,
      defaultValue,
      inputType,
      onConfirm: (val) => {
        onConfirm(val || '');
      },
      onCancel
    });
  };


  // Sync state to LocalStorage
  useEffect(() => {
    if (session?.user?.email && isLoadedForUser === session.user.email) {
      localStorage.setItem(`cashflow_jobs_${session.user.email}`, JSON.stringify(jobs));
    }
  }, [jobs, session, isLoadedForUser]);

  useEffect(() => {
    if (session?.user?.email && isLoadedForUser === session.user.email) {
      localStorage.setItem(`cashflow_goals_${session.user.email}`, JSON.stringify(goals));
    }
  }, [goals, session, isLoadedForUser]);

  useEffect(() => {
    if (session?.user?.email && isLoadedForUser === session.user.email) {
      localStorage.setItem(`cashflow_settings_${session.user.email}`, JSON.stringify(settings));
    }
  }, [settings, session, isLoadedForUser]);

  useEffect(() => {
    if (session?.user?.email && isLoadedForUser === session.user.email) {
      localStorage.setItem(`cashflow_notif_settings_${session.user.email}`, JSON.stringify(notifSettings));
    }
  }, [notifSettings, session, isLoadedForUser]);

  // Debounced save to Supabase Cloud DB on changes
  useEffect(() => {
    if (session?.user?.email && isLoadedForUser === session.user.email && cloudSyncStatus === 'synced') {
      const email = session.user.email;
      const timer = setTimeout(() => {
        saveCloudData(email, {
          jobs,
          goals,
          statuses,
          jobTypes,
          settings,
          notifSettings,
          expenses
        });
      }, 1500); // 1.5s debounce to bundle fast consecutive changes
      return () => clearTimeout(timer);
    }
  }, [jobs, goals, statuses, jobTypes, settings, notifSettings, expenses, session, isLoadedForUser, cloudSyncStatus]);

  // The debounce above has a real data-loss window: if the user closes the tab, backgrounds
  // the app, or navigates away within that 1.5s, the pending setTimeout never fires and the
  // edit (e.g. a newly-added job) never reaches Supabase — the next load then overwrites it
  // with the stale cloud copy. Flush immediately (no debounce) the moment the page starts
  // hiding, using both visibilitychange and pagehide since neither fires reliably alone across
  // every browser (pagehide is the one that actually fires on iOS Safari tab close).
  useEffect(() => {
    if (!(session?.user?.email && isLoadedForUser === session.user.email && cloudSyncStatus === 'synced')) return;
    const email = session.user.email;
    const flush = () => {
      saveCloudData(email, {
        jobs,
        goals,
        statuses,
        jobTypes,
        settings,
        notifSettings,
        expenses
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flush);
    };
  }, [jobs, goals, statuses, jobTypes, settings, notifSettings, expenses, session, isLoadedForUser, cloudSyncStatus]);

  // Check for overdue credit terms on login/data load
  useEffect(() => {
    if (session?.user?.email && isLoadedForUser === session.user.email && jobs.length > 0) {
      const email = session.user.email;
      const todayStr = new Date().toISOString().split('T')[0];
      
      // Prevent multiple prompts in a single session for today
      const sessionKey = `cashflow_queue_checked_${email}_${todayStr}`;
      if (sessionStorage.getItem(sessionKey)) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Filter jobs that are unpaid and overdue by 1+ days
      const overdueJobs = jobs.filter(j => {
        // Unpaid check: status behavior is not 'done' and pending is > 0 (or paymentStatus !== 'paid')
        const statusOpt = statuses.find(s => s.id === j.status);
        const behavior = statusOpt ? statusOpt.behavior : 'pending';
        const isUnpaid = behavior !== 'done' && j.pending > 0 && j.paymentStatus !== 'paid';
        
        const targetDateStr = j.dueDate || j.payDate;
        if (!isUnpaid || !targetDateStr) return false;
        
        const targetDate = new Date(targetDateStr + 'T00:00:00');
        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // At least 1 day overdue (diffDays <= -1)
        return diffDays <= -1;
      });

      if (overdueJobs.length > 0 && notifSettings.enabled) {
        // Mark session as checked first
        sessionStorage.setItem(sessionKey, 'true');

        const currentQueue = notifSettings.pendingQueue || [];
        let queueUpdated = false;
        const updatedQueue = [...currentQueue];

        overdueJobs.forEach(j => {
          const alreadyInQueueToday = currentQueue.some(
            r => r.jobId === j.id && r.detectedDate === todayStr
          );

          if (!alreadyInQueueToday) {
            const targetDateStr = j.dueDate || j.payDate || '';
            updatedQueue.push({
              id: `rem-${j.id}-${todayStr}`,
              jobId: j.id,
              jobName: j.name,
              client: j.client || 'ไม่ระบุ',
              pendingAmount: j.pending,
              dueDate: targetDateStr,
              detectedDate: todayStr,
              status: 'pending'
            });
            queueUpdated = true;
          }
        });

        if (queueUpdated) {
          setNotifSettings(prev => ({
            ...prev,
            pendingQueue: updatedQueue
          }));

          const newCount = updatedQueue.filter(r => r.detectedDate === todayStr && r.status === 'pending').length;
          
          setTimeout(() => {
            triggerConfirm(
              'ตรวจพบดีลค้างชำระเลยกำหนด!',
              `ระบบตรวจพบดีลงานเลยกำหนดเครดิตเทอมใหม่วันนี้ (จำนวน ${newCount} รายการ)\n\nคุณต้องการไปที่ "แดชบอร์ดติดตามทวงถามเครดิตเทอม" เพื่อตรวจสอบคิวทวงหนี้และกดส่งอีเมลทวงถามเลยไหมครับ?`,
              () => {
                setActiveTab('report');
              }
            );
          }, 1500);
        }
      }
    }
  }, [session, isLoadedForUser, jobs, statuses, notifSettings.enabled]);

  // Best-effort push to LINE (if linked) whenever a job/expense is added straight through the
  // web app -- mirrors the same "bank app" receipt the LINE bot/LIFF form already send, so
  // recording something here pings LINE too instead of only when added from there. Never blocks
  // or surfaces an error to the user; a failed/skipped push is silently fine.
  const notifyLineRecordAdded = (kind: 'job' | 'expense', record: Job | Expense, monthNet: number | undefined) => {
    if (!session?.user?.email || session.isGuest) return;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;
        await fetch('/api/notify-record-added', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ kind, record, monthNet }),
        });
      } catch (err) {
        console.warn('notifyLineRecordAdded failed:', err);
      }
    })();
  };

  // LINE has no API to delete/unsend a previously-sent message, so deleting a job or expense
  // here can't remove its old "บันทึกสำเร็จ" card from the chat -- this pushes a follow-up
  // "ยกเลิก/ลบ" card instead, so the chat at least shows it was voided.
  const notifyLineRecordDeleted = (kind: 'job' | 'expense', record: Job | Expense) => {
    if (!session?.user?.email || session.isGuest) return;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) return;
        const body = kind === 'job'
          ? { kind, record: { name: (record as Job).name, client: (record as Job).client, value: (record as Job).value } }
          : { kind, record: { name: (record as Expense).name, category: (record as Expense).category, amount: (record as Expense).amount } };
        await fetch('/api/notify-record-deleted', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      } catch (err) {
        console.warn('notifyLineRecordDeleted failed:', err);
      }
    })();
  };

  // computeMonthlySummary is only for the LINE card's "คงเหลือเดือนนี้" line -- never let it (or
  // anything else) block the notify call itself, since a thrown error here would silently
  // swallow the whole notification before the fetch even happens. Uses receivedAfterVariableExpense
  // (not netFlow) so this matches the Dashboard's "คงเหลือหลังหักรายจ่าย" figure the user actually
  // watches -- netFlow also nets out the fixed-expense budget line, which isn't what "how much do
  // I have left right now" means to them.
  const monthNetSafe = (extraJobs: Job[] = [], extraExpenses: Expense[] = []): number | undefined => {
    try {
      return computeMonthlySummary(
        extraJobs.length ? [...extraJobs, ...jobs] : jobs,
        extraExpenses.length ? [...extraExpenses, ...expenses] : expenses,
        goals,
        settings,
        getCurrentMonthKeyBkk()
      ).receivedAfterVariableExpense;
    } catch (err) {
      console.warn('computeMonthlySummary failed for LINE notify:', err);
      return undefined;
    }
  };

  // Core functions
  const handleAddJob = (newJob: Omit<Job, 'id'>) => {
    const jobWithId: Job = {
      ...newJob,
      id: `job-${Date.now()}`,
    };
    setJobs(prev => [jobWithId, ...prev]);
    fireMascot({
      mood: 'celebrate',
      message: `เพิ่มงาน "${newJob.name}" ชิ้นใหม่เรียบร้อยแล้วค้าบ! สู้ๆ น้าเจ้ากระรอก!`
    });
    // Trigger a celebratory green leaves shower!
    leafBus.trigger({ count: 16, type: 'green', durationMs: 3500 });

    notifyLineRecordAdded('job', jobWithId, monthNetSafe([jobWithId]));
  };

  const handleEditJob = (id: string, updated: Partial<Job>) => {
    const oldJob = jobs.find(j => j.id === id);
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updated } : j));
    
    // If job was completed or fully paid, trigger a massive celebration!
    const wasCompleted = (updated.status === 'done' && oldJob?.status !== 'done') || 
                         (updated.paymentStatus === 'paid' && oldJob?.paymentStatus !== 'paid');
    
    if (wasCompleted) {
      fireMascot({
        mood: 'celebrate',
        message: `ยินดีด้วยค้าบ! งานนี้ปิดดีลรับเงินเข้าคลังกระรอกเรียบร้อยแล้ว! อู้ฟู่สุดๆ!`
      });
      leafBus.trigger({ count: 28, type: 'mixed', durationMs: 5000 });
    } else {
      fireMascot({
        mood: 'happy',
        message: `อัปเดตข้อมูลดีลเรียบร้อยแล้วค้าบ! ข้อมูลถูกต้องแม่นยำร้อยเปอร์เซ็นต์!`
      });
    }
  };

  const handleDeleteJob = (id: string) => {
    triggerConfirm(
      'ยืนยันการลบงานดีล',
      'คุณแน่ใจหรือไม่ว่าต้องการลบดีลงานชิ้นนี้? ข้อมูลรายรับที่เกี่ยวข้องจะหายไปด้วย',
      () => {
        const jobToDelete = jobs.find(j => j.id === id);
        setJobs(prev => prev.filter(j => j.id !== id));
        fireMascot({
          mood: 'alert',
          message: `ลบดีลงานเรียบร้อยแล้วนะค้าบ หวังว่าดีลใหม่จะงอกเร็วๆ น้า!`
        });
        if (jobToDelete) notifyLineRecordDeleted('job', jobToDelete);
      }
    );
  };

  const handleAddGoal = (newGoal: Omit<Goal, 'id'>) => {
    const goalWithId: Goal = {
      ...newGoal,
      id: `goal-${Date.now()}`,
    };
    setGoals(prev => [...prev, goalWithId]);
    leafBus.trigger({ count: 12, type: 'mixed', durationMs: 3000 });
  };

  const handleDeleteGoal = (id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id));
  };

  const handleUpdateGoalProgress = (id: string, amount: number, reason?: string, date?: string) => {
    const todayStr = date || new Date().toISOString().split('T')[0];
    const defaultReason = amount >= 0 ? 'โอนเงินเข้าฝากออมเพิ่ม' : 'ดึงเงินออก / หักค่าใช้จ่าย';

    setGoals(prev => prev.map(g => {
      if (g.id === id) {
        const nextVal = Math.max(0, Math.min(g.target, g.current + amount));
        const newTx = {
          id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: (amount >= 0 ? 'deposit' : 'withdraw') as 'deposit' | 'withdraw',
          amount: Math.abs(amount),
          date: todayStr,
          reason: reason?.trim() || defaultReason,
          createdAt: new Date().toISOString()
        };

        if (nextVal >= g.target && g.current < g.target) {
          // Goal completed! Massive leaf party!
          fireMascot({
            mood: 'celebrate',
            message: `ว้าววว! คุณทำเป้าหมายออมเงิน "${g.name}" สำเร็จครบ 100% แล้ว! ยอดเยี่ยมที่สุดเลยค้าบเจ้ากระรอก!`
          });
          leafBus.trigger({ count: 32, type: 'mixed', durationMs: 6500 });
        } else if (amount > 0) {
          // Saving money, drop some green leaves!
          leafBus.trigger({ count: 10, type: 'green', durationMs: 2500 });
        }
        return { 
          ...g, 
          current: nextVal,
          history: [newTx, ...(g.history || [])]
        };
      }
      return g;
    }));
  };

  const handleDeleteGoalTransaction = (goalId: string, txId: string, revertBalance: boolean = true) => {
    setGoals(prev => prev.map(g => {
      if (g.id === goalId && g.history) {
        const targetTx = g.history.find(t => t.id === txId);
        const newHistory = g.history.filter(t => t.id !== txId);
        let nextCurrent = g.current;
        if (targetTx && revertBalance) {
          if (targetTx.type === 'deposit') {
            nextCurrent = Math.max(0, g.current - targetTx.amount);
          } else {
            nextCurrent = Math.min(g.target, g.current + targetTx.amount);
          }
        }
        return {
          ...g,
          current: nextCurrent,
          history: newHistory
        };
      }
      return g;
    }));
  };

  const handleTransferBetweenGoals = (fromGoalId: string, toGoalId: string, amount: number, reason?: string, date?: string) => {
    if (fromGoalId === toGoalId || amount <= 0) return;
    const fromGoal = goals.find(g => g.id === fromGoalId);
    const toGoal = goals.find(g => g.id === toGoalId);
    if (!fromGoal || !toGoal) return;

    const transferAmount = Math.min(amount, fromGoal.current);
    if (transferAmount <= 0) return;

    const todayStr = date || new Date().toISOString().split('T')[0];
    const createdAt = new Date().toISOString();
    const finalReason = reason?.trim();

    setGoals(prev => prev.map(g => {
      if (g.id === fromGoalId) {
        const newTx = {
          id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'withdraw' as const,
          amount: transferAmount,
          date: todayStr,
          reason: finalReason || `โอนย้ายไปเป้าหมาย "${toGoal.name}"`,
          relatedGoalId: toGoalId,
          relatedGoalName: toGoal.name,
          createdAt
        };
        return {
          ...g,
          current: Math.max(0, g.current - transferAmount),
          history: [newTx, ...(g.history || [])]
        };
      }
      if (g.id === toGoalId) {
        const newTx = {
          id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          type: 'deposit' as const,
          amount: transferAmount,
          date: todayStr,
          reason: finalReason || `โอนย้ายมาจากเป้าหมาย "${fromGoal.name}"`,
          relatedGoalId: fromGoalId,
          relatedGoalName: fromGoal.name,
          createdAt
        };
        return {
          ...g,
          current: Math.min(g.target, g.current + transferAmount),
          history: [newTx, ...(g.history || [])]
        };
      }
      return g;
    }));

    leafBus.trigger({ count: 14, type: 'mixed', durationMs: 3000 });
    triggerAlert(
      'โอนย้ายเงินสำเร็จ!',
      `โอนย้ายเงินจำนวน ${transferAmount.toLocaleString()} ฿ จากเป้าหมาย "${fromGoal.name}" ไปยัง "${toGoal.name}" เรียบร้อยแล้ว`
    );
  };

  const handleUpdateGoal = (id: string, updatedFields: Partial<Goal>) => {
    setGoals(prev => prev.map(g => {
      if (g.id === id) {
        return { ...g, ...updatedFields };
      }
      return g;
    }));
  };

  // Dedicated Allocate Saving money from the Split Pool to any Target Goal
  const handleAllocateSavingsToGoal = (goalId: string, amount: number, reason?: string) => {
    let goalName = '';
    const todayStr = new Date().toISOString().split('T')[0];
    setGoals(prev => prev.map(g => {
      if (g.id === goalId) {
        goalName = g.name;
        const nextVal = Math.min(g.target, g.current + amount);
        const newTx = {
          id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'deposit' as const,
          amount,
          date: todayStr,
          reason: reason || 'จัดสรรกำไรสุทธิประจำเดือน',
          createdAt: new Date().toISOString()
        };
        return {
          ...g,
          current: nextVal,
          history: [newTx, ...(g.history || [])]
        };
      }
      return g;
    }));
    if (goalName) {
      triggerAlert(
        'ฝากเงินสำเร็จ!',
        `โอนเงิน ${amount.toLocaleString()} ฿ เข้าสู่เป้าหมาย "${goalName}" เรียบร้อยแล้ว`
      );
    }
  };

  const handleAllocateMultipleSavings = (allocations: Record<string, number>, settingsUpdate?: Partial<AppSettings>) => {
    const todayStr = new Date().toISOString().split('T')[0];
    setGoals(prev => prev.map(g => {
      const amount = allocations[g.id];
      if (amount && amount > 0) {
        const nextVal = Math.min(g.target, g.current + amount);
        const newTx = {
          id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type: 'deposit' as const,
          amount,
          date: todayStr,
          reason: 'จัดสรรกำไรสุทธิประจำเดือน',
          createdAt: new Date().toISOString()
        };
        return {
          ...g,
          current: nextVal,
          history: [newTx, ...(g.history || [])]
        };
      }
      return g;
    }));
    if (settingsUpdate) {
      setSettings(prev => ({ ...prev, ...settingsUpdate }));
    }
  };

  const handleAddExpense = (newExp: Omit<Expense, 'id'>) => {
    const expWithId: Expense = {
      ...newExp,
      id: `expense-${Date.now()}`
    };
    setExpenses(prev => [expWithId, ...prev]);

    notifyLineRecordAdded('expense', expWithId, monthNetSafe([], [expWithId]));
  };

  const handleDeleteExpense = (id: string) => {
    const expenseToDelete = expenses.find(e => e.id === id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    if (expenseToDelete) notifyLineRecordDeleted('expense', expenseToDelete);
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
  };

  // Backup and Restore Management
  const handleExportData = () => {
    const data = { 
      jobs, 
      goals, 
      settings, 
      statuses, 
      jobTypes, 
      notifSettings, 
      expenses 
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cashflow-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    fireMascot({
      mood: 'celebrate',
      message: 'ส่งออกข้อมูลเสบียงเรียบร้อยแล้วค้าบ! เก็บไฟล์นี้ไว้อย่างดีน้า'
    });
  };

  const handleImportData = (jsonData: string) => {
    try {
      const parsed = JSON.parse(jsonData);
      if (parsed.jobs) setJobs(cleanJobs(parsed.jobs));
      if (parsed.goals) setGoals(parsed.goals);
      if (parsed.settings) setSettings(parsed.settings);
      if (parsed.statuses) setStatuses(cleanStatuses(parsed.statuses));
      if (parsed.jobTypes) {
        setJobTypes(cleanJobTypes(parsed.jobTypes));
      }
      if (parsed.notifSettings) setNotifSettings(parsed.notifSettings);
      if (parsed.expenses) setExpenses(parsed.expenses);
      
      fireMascot({
        mood: 'celebrate',
        message: 'นำเข้าข้อมูลและคืนชีพคลังเสบียงกระรอกเรียบร้อยแล้วค้าบ!'
      });
    } catch (err) {
      fireMascot({
        mood: 'alert',
        message: 'นำเข้าข้อมูลไม่สำเร็จค้าบ ไฟล์อาจเสียหายหรือรูปแบบผิดพลาด!'
      });
    }
  };


  const handleClearAllData = () => {
    setJobs([]);
    setGoals([]);
    setExpenses([]);
    setSettings(defaultSettings);
    
    if (session?.user?.email) {
      const email = session.user.email;
      localStorage.removeItem(`cashflow_jobs_${email}`);
      localStorage.removeItem(`cashflow_goals_${email}`);
      localStorage.removeItem(`cashflow_settings_${email}`);
      localStorage.removeItem(`cashflow_expenses_${email}`);
      localStorage.removeItem(`cashflow_statuses_${email}`);
      localStorage.removeItem(`cashflow_job_types_${email}`);
      localStorage.removeItem(`cashflow_notif_settings_${email}`);
    } else {
      localStorage.removeItem('cashflow_jobs');
      localStorage.removeItem('cashflow_goals');
      localStorage.removeItem('cashflow_settings');
      localStorage.removeItem('cashflow_expenses');
    }
  };

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col justify-center items-center p-6 text-center select-none">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <Mascot mood="happy" size={130} animated={true} className="mb-4" />
          <div className="w-10 h-10 rounded-full border-4 border-brand-green-acc/25 border-t-brand-green-acc animate-spin mb-3 mt-1" />
          <h2 className="text-sm font-extrabold text-brand-text font-display mb-1">กระรอกตุนเงิน</h2>
          <p className="text-[11px] font-bold text-brand-muted tracking-wide animate-pulse">กำลังเตรียมความอบอุ่นให้กระเป๋าเงินของคุณ...</p>
        </motion.div>
      </div>
    );
  }

  if (isRecoveryMode) {
    return (
      <ResetPassword 
        darkMode={darkMode} 
        setDarkMode={setDarkMode} 
        onComplete={() => {
          setIsRecoveryMode(false);
          window.location.hash = '';
        }} 
      />
    );
  }

  if (!session) {
    return (
      <>
        <Login darkMode={darkMode} setDarkMode={setDarkMode} onGuestLogin={handleGuestLogin} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex lg:flex-row flex-col">
      
      {/* 💻 iPad / MacBook / PC Desktop Sidebar (Hidden on mobile devices) */}
      <aside className="hidden lg:flex flex-col w-68 bg-brand-white border-r border-brand-border/40 shrink-0 select-none p-6 relative">
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <div className="shrink-0">
            <Mascot mood="happy" size={36} />
          </div>
          <div>
            <h1 className="font-display font-black text-xs tracking-tight text-brand-text">
              กระรอกตุนเงิน
            </h1>
            <p className="text-[9px] text-[#E65F2B] dark:text-[#FFA473] font-black uppercase tracking-wider">
              คลังกระรอกตุนเสบียง
            </p>
          </div>
        </div>

        {/* Desktop Sidebar Navigation List */}
        <nav className="space-y-1.5 flex-1">
          {navItems.filter(item => item.group === 'core').map(item => renderNavButton(item, false))}

          {renderMoreToggle()}
          <AnimatePresence initial={false}>
            {showMoreNavItems && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-1.5 overflow-hidden"
              >
                {navItems.filter(item => item.group === 'more').map(item => renderNavButton(item, false))}
              </motion.div>
            )}
          </AnimatePresence>

          {navItems.filter(item => item.group === 'bottom').map(item => renderNavButton(item, false))}
        </nav>

        {/* User profile & signout container */}
        <div className="mb-4 p-3 rounded-2xl bg-brand-faint/40 dark:bg-neutral-800/20 border border-brand-border/20 dark:border-neutral-800/40 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-acc/15 dark:bg-[#FFA473]/15 flex items-center justify-center text-[#E65F2B] dark:text-[#FFA473] font-extrabold text-xs shrink-0 overflow-hidden">
              {userAvatar ? (
                <img src={userAvatar} className="w-full h-full object-cover" alt="User Avatar" />
              ) : (
                <User className="w-3.5 h-3.5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-brand-muted truncate font-extrabold" title={session?.user?.email}>
                {session?.user?.email}
              </p>
            </div>
          </div>

          {session && !session.isGuest && (
            <button
              type="button"
              onClick={() => setActiveTab('plans')}
              className="w-full text-left px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold flex items-center gap-1.5 bg-brand-bg border border-brand-border/40 hover:border-brand-border transition-colors cursor-pointer"
            >
              {isPaidActive ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-display font-black inline-flex items-center gap-1">PRO <IconCrown className="w-2.5 h-2.5" /></span>
                  {subscription?.currentPeriodEnd && (
                    <span className="text-[9px] text-brand-muted ml-auto font-mono">
                      ถึง: {new Date(subscription.currentPeriodEnd).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </>
              ) : isInFreeTrial ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                  <span className="text-indigo-600 dark:text-indigo-400 font-display font-black inline-flex items-center gap-1">ทดลองใช้ฟรี <IconSpark className="w-2.5 h-2.5" /></span>
                  {trialEndsAt && (
                    <span className="text-[9px] text-brand-muted ml-auto font-mono">
                      ถึง: {trialEndsAt.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#E65F2B] shrink-0" />
                  <span className="text-brand-muted">FREE</span>
                </>
              )}
            </button>
          )}
          <button
            onClick={() => {
              triggerConfirm(
                'ออกจากระบบ',
                'คุณต้องการออกจากระบบจากแอปพลิเคชันหรือไม่?',
                async () => {
                  await handleSignOut();
                }
              );
            }}
            className="w-full py-1.5 px-3 bg-pink-bg hover:bg-pink-bg/80 text-pink-acc border border-pink-acc/10 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3 h-3" />
            <span>ออกจากระบบ</span>
          </button>
        </div>

        {/* Desktop bottom status/theme bar */}
        <div className="pt-4 border-t border-brand-border/40 flex flex-col gap-2.5">
          <button
            onClick={() => {
              setTourStep(0);
              setActiveTab('dashboard');
            }}
            className="w-full py-2 px-3 bg-amber-500/10 hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
          >
            <span>แนะนำฟีเจอร์แอป (App Tour)</span>
          </button>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-brand-muted font-bold inline-flex items-center gap-1">โหมดธีมสว่าง/มืด <IconPalette className="w-2.5 h-2.5" /></span>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-brand-faint hover:bg-brand-border/40 text-brand-text transition-all duration-300 active:scale-95 flex items-center justify-center border border-brand-border/20 cursor-pointer"
              title={darkMode ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-500 fill-amber-500/10" />
              ) : (
                <Moon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 fill-emerald-600/10" />
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* 📱 Mobile Sidebar Slide-out Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[999] lg:hidden"
            />

            {/* Sidebar content */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 left-0 w-72 bg-brand-white dark:bg-stone-900 border-r border-brand-border/40 dark:border-neutral-800 z-[1000] p-6 flex flex-col justify-between shadow-2xl lg:hidden select-none"
            >
              <div className="space-y-6">
                {/* Drawer Header */}
                <div className="flex items-center justify-between pb-4 border-b border-brand-border/20">
                  <div className="flex items-center gap-2.5">
                    <div className="shrink-0">
                      <Mascot mood="happy" size={36} />
                    </div>
                    <div>
                      <h1 className="font-display font-black text-xs tracking-tight text-brand-text">
                        กระรอกตุนเงิน
                      </h1>
                      <p className="text-[9px] text-[#E65F2B] dark:text-[#FFA473] font-black uppercase tracking-wider">
                        คลังกระรอกตุนเสบียง
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-1.5 rounded-xl bg-brand-faint hover:bg-brand-border/30 text-brand-muted hover:text-brand-text transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Navigation Links inside Drawer */}
                <nav className="space-y-1.5">
                  {navItems.filter(item => item.group === 'core').map(item => renderNavButton(item, true))}

                  {renderMoreToggle()}
                  <AnimatePresence initial={false}>
                    {showMoreNavItems && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-1.5 overflow-hidden"
                      >
                        {navItems.filter(item => item.group === 'more').map(item => renderNavButton(item, true))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {navItems.filter(item => item.group === 'bottom').map(item => renderNavButton(item, true))}
                </nav>
              </div>

              <div className="space-y-4">
                {/* User profile inside Drawer */}
                <div className="p-3 rounded-2xl bg-brand-faint/40 dark:bg-neutral-800/20 border border-brand-border/20 dark:border-neutral-800/40 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-acc/15 dark:bg-[#FFA473]/15 flex items-center justify-center text-[#E65F2B] dark:text-[#FFA473] font-extrabold text-xs shrink-0 overflow-hidden">
                      {userAvatar ? (
                        <img src={userAvatar} className="w-full h-full object-cover" alt="User Avatar" />
                      ) : (
                        <User className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-brand-muted truncate font-extrabold">
                        {session?.user?.email}
                      </p>
                    </div>
                  </div>

                  {session && !session.isGuest && (
                    <button
                      type="button"
                      onClick={() => { setActiveTab('plans'); setIsMobileMenuOpen(false); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold flex items-center gap-1.5 bg-brand-bg border border-brand-border/40 hover:border-brand-border transition-colors cursor-pointer"
                    >
                      {isPaidActive ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                          <span className="text-emerald-600 dark:text-emerald-400 font-display font-black inline-flex items-center gap-1">PRO <IconCrown className="w-2.5 h-2.5" /></span>
                          {subscription?.currentPeriodEnd && (
                            <span className="text-[9px] text-brand-muted ml-auto font-mono">
                              ถึง: {new Date(subscription.currentPeriodEnd).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </>
                      ) : isInFreeTrial ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                          <span className="text-indigo-600 dark:text-indigo-400 font-display font-black inline-flex items-center gap-1">ทดลองใช้ฟรี <IconSpark className="w-2.5 h-2.5" /></span>
                          {trialEndsAt && (
                            <span className="text-[9px] text-brand-muted ml-auto font-mono">
                              ถึง: {trialEndsAt.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#E65F2B] shrink-0" />
                          <span className="text-brand-muted">FREE</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      triggerConfirm(
                        'ออกจากระบบ',
                        'คุณต้องการออกจากระบบจากแอปพลิเคชันหรือไม่?',
                        async () => {
                          await handleSignOut();
                        }
                      );
                    }}
                    className="w-full py-1.5 px-3 bg-pink-bg hover:bg-pink-bg/80 text-pink-acc border border-pink-acc/10 rounded-xl text-[10px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>ออกจากระบบ</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setTourStep(0);
                    setActiveTab('dashboard');
                  }}
                  className="w-full py-2 px-3 bg-amber-500/10 hover:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs mb-3"
                >
                  <span>แนะนำฟีเจอร์แอป (App Tour)</span>
                </button>

                {/* Theme Controls on Mobile */}
                <div className="pt-2 border-t border-brand-border/20">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-brand-muted font-bold inline-flex items-center gap-1">ธีมสว่าง/มืด <IconPalette className="w-2.5 h-2.5" /></span>
                    <button
                      onClick={() => setDarkMode(!darkMode)}
                      className="p-2 rounded-xl bg-brand-faint hover:bg-brand-border/40 text-brand-text transition-all duration-300 active:scale-95 flex items-center justify-center gap-1.5 border border-brand-border/20 cursor-pointer text-xs font-bold w-full"
                    >
                      {darkMode ? (
                        <>
                          <Sun className="w-3.5 h-3.5 text-amber-500" />
                          <span>สว่าง</span>
                        </>
                      ) : (
                        <>
                          <Moon className="w-3.5 h-3.5 text-emerald-500" />
                          <span>มืด</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* 📱 / 💻 Main Section: Handles responsive paddings & maximum constraints */}
      <div className="flex-1 flex flex-col min-h-screen relative overflow-hidden bg-brand-bg pb-6 lg:pb-6">
        
        {/* Top Header Bar with branding & Dark Mode toggle (Sticky on mobile, simple title on desktop) */}
        <div className="flex justify-between items-center px-5 py-4 bg-brand-white border-b border-brand-border/40 select-none shrink-0 lg:px-8">
          <div className="flex items-center gap-3">
            {/* Hamburger button for Mobile Drawer Menu */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-1.5 rounded-xl bg-brand-faint hover:bg-brand-border/30 text-brand-muted hover:text-brand-text transition-all cursor-pointer lg:hidden flex items-center justify-center border border-brand-border/10"
              title="เปิดเมนูหมวดหมู่"
            >
              <Menu className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            </button>

            {activeTab === 'settings' ? (
              <div className="flex items-center gap-2.5">
                <Mascot mood="happy" size={32} className="shrink-0" />
                <div className="flex flex-col">
                  <span className="font-display font-extrabold text-xs sm:text-sm tracking-tight text-brand-text leading-none uppercase">
                    ตั้งค่าระบบแอปพลิเคชัน
                  </span>
                  <span className="text-[9px] text-brand-muted dark:text-neutral-400 font-medium leading-tight mt-0.5 hidden sm:inline">
                    จัดการสัดส่วนเป้าหมายทางการเงิน สำรองกู้คืนข้อมูล และเชื่อมต่อระบบคลาวด์
                  </span>
                </div>
              </div>
            ) : (
              <span className="font-display font-extrabold text-sm tracking-tight text-brand-text">
                {activeTab === 'dashboard' && "ภาพรวมกระแสเงินสด"}
                {activeTab === 'jobs' && "บันทึกงานดีลของคุณ"}
                {activeTab === 'tax' && "ผู้ช่วยจัดการภาษีบุคคลธรรมดา"}
                {activeTab === 'invoice' && "เครื่องมือออกใบแจ้งหนี้ & ใบเสร็จรับเงินสำเร็จรูป"}
                {activeTab === 'summary' && "สรุปยอดรายรับ & เงินคงเหลือประจำเดือน"}
                {activeTab === 'timeline' && "ไทม์ไลน์งานดีลและวันรับเงิน"}
                {activeTab === 'split' && "จัดสรรเงิน & เป้าหมายออม"}
                {activeTab === 'report' && "รายงานวิเคราะห์ & เครดิตเทอม"}
                {activeTab === 'insight' && "วิเคราะห์รายได้เชิงลึก"}
                {activeTab === 'plans' && "แพ็กเกจ & อัปเกรดเป็นสมาชิก"}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-brand-faint hover:bg-brand-border/40 text-brand-text transition-all duration-300 active:scale-95 flex items-center justify-center border border-brand-border/20 cursor-pointer lg:hidden"
              title={darkMode ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-500 fill-amber-500/10" />
              ) : (
                <Moon className="w-4 h-4 text-[#006e40] dark:text-[#52d294] fill-[#006e40]/10" />
              )}
            </button>
          </div>
        </div>

        {/* Scrollable Container with responsive max widths */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 no-scrollbar bg-brand-bg text-brand-text w-full max-w-7xl mx-auto">
          
          {/* Global Month Exploration Bar (สำรวจฤดูกาลเก็บเกี่ยว) - Display only on Dashboard */}
          {activeTab === 'dashboard' && (
            <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-white dark:bg-stone-900 border border-brand-border/60 rounded-3xl p-5 shadow-sm animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#E65F2B]/10 dark:bg-[#FFA473]/10 rounded-2xl text-[#E65F2B] dark:text-[#FFA473] shrink-0 border border-[#E65F2B]/10">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-brand-text dark:text-white tracking-wide">
                    สำรวจฤดูกาลเก็บเกี่ยว
                  </h4>
                  <p className="text-[10px] text-brand-muted mt-0.5 leading-relaxed">
                    เลือกเดือนอ้างอิงเพื่อตรวจสอบภาพรวม, สรุปรายรับ, บันทึกเงินออม และคำนวณภาษีในรอบเวลาที่ต้องการ
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                <span className="text-[10px] font-bold text-brand-muted mr-1">รอบเวลาเสบียง:</span>
                <select
                  value={selectedMonthKey}
                  onChange={(e) => setSelectedMonthKey(e.target.value)}
                  className="bg-brand-white dark:bg-stone-800 text-xs font-black text-[#E65F2B] dark:text-[#FFA473] border border-brand-border/60 rounded-xl px-3.5 py-2 outline-none focus:border-[#E65F2B] dark:focus:border-[#FFA473] cursor-pointer min-w-[160px] shadow-sm font-sans"
                >
                  {availableMonthKeys.map(key => (
                    <option key={key} value={key}>
                      {formatMonthKey(key)} {key === currentMonthKey ? ' (ปัจจุบัน)' : ''}
                    </option>
                  ))}
                </select>
                {selectedMonthKey !== currentMonthKey && (
                  <button
                    onClick={() => setSelectedMonthKey(currentMonthKey)}
                    className="px-3 py-2 bg-[#E65F2B]/10 hover:bg-[#E65F2B]/20 text-[#E65F2B] dark:text-[#FFA473] rounded-xl text-[10px] font-black transition-all cursor-pointer border border-[#E65F2B]/15 hover:scale-102"
                  >
                    กลับปัจจุบัน
                  </button>
                )}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'dashboard' && (
                <DashboardTab
                  jobs={jobs}
                  goals={goals}
                  settings={settings}
                  expenses={expenses}
                  onUpdateSettings={handleUpdateSettings}
                  onSwitchTab={setActiveTab}
                  onOpenAddGoal={() => {
                    setInitialSelectedGoalId('ADD_NEW_GOAL');
                    setActiveTab('split');
                  }}
                  onOpenGoalDetail={(id) => {
                    setInitialSelectedGoalId(id);
                    setActiveTab('split');
                  }}
                  statuses={statuses}
                  selectedMonthKey={selectedMonthKey}
                  onEditJob={handleEditJob}
                  userEmail={session?.user?.email || 'user@example.com'}
                  notifSettings={notifSettings}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                />
              )}

              {activeTab === 'jobs' && (
                <div className="space-y-6">
                  {/* รายรับ / รายจ่าย mode switch -- same pill-toggle pattern used for the
                      WIP/Posted switch inside JobsTab itself */}
                  <div className="relative flex bg-brand-white border border-brand-border rounded-2xl p-1.5 shadow-2xs">
                    <button
                      onClick={() => setRecordMode('income')}
                      className="relative flex-1 py-3 rounded-xl text-center cursor-pointer overflow-hidden"
                    >
                      {recordMode === 'income' && (
                        <motion.div
                          layoutId="record-mode-toggle"
                          className="absolute inset-0 bg-brand-faint border border-brand-border/40 rounded-xl"
                          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        />
                      )}
                      <span className={`relative z-10 text-xs font-black ${recordMode === 'income' ? 'text-brand-text' : 'text-brand-muted'}`}>
                        รายรับ (งานดีล)
                      </span>
                    </button>
                    <button
                      onClick={() => setRecordMode('expense')}
                      className="relative flex-1 py-3 rounded-xl text-center cursor-pointer overflow-hidden"
                    >
                      {recordMode === 'expense' && (
                        <motion.div
                          layoutId="record-mode-toggle"
                          className="absolute inset-0 bg-brand-faint border border-brand-border/40 rounded-xl"
                          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        />
                      )}
                      <span className={`relative z-10 text-xs font-black ${recordMode === 'expense' ? 'text-brand-text' : 'text-brand-muted'}`}>
                        รายจ่าย
                      </span>
                    </button>
                  </div>

                  {recordMode === 'income' ? (
                    <JobsTab
                      jobs={jobs}
                      onAddJob={handleAddJob}
                      onEditJob={handleEditJob}
                      onDeleteJob={handleDeleteJob}
                      isAddJobOpen={isAddJobOpen}
                      onOpenAddJob={() => setIsAddJobOpen(true)}
                      onCloseAddJob={() => setIsAddJobOpen(false)}
                      statuses={statuses}
                      setStatuses={setStatuses}
                      jobTypes={jobTypes}
                      setJobTypes={setJobTypes}
                      triggerAlert={triggerAlert}
                      triggerConfirm={triggerConfirm}
                      triggerPrompt={triggerPrompt}
                      openJobId={jobIdToOpen}
                      onOpenJobHandled={() => setJobIdToOpen(null)}
                    />
                  ) : (
                    <ExpenseRecordView
                      expenses={expenses}
                      onAddExpense={handleAddExpense}
                      onDeleteExpense={handleDeleteExpense}
                      selectedMonth={selectedMonthKey}
                      triggerAlert={triggerAlert}
                      triggerConfirm={triggerConfirm}
                      autoOpenAdd={autoOpenAddExpense}
                      onAutoOpenAddHandled={() => setAutoOpenAddExpense(false)}
                    />
                  )}
                </div>
              )}

              {activeTab === 'summary' && (
                <SummaryTab
                  jobs={jobs}
                  goals={goals}
                  settings={settings}
                  onEditJob={handleEditJob}
                  onSwitchTab={setActiveTab}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                  triggerPrompt={triggerPrompt}
                  expenses={expenses}
                  onImportData={handleImportData}
                  onExportData={handleExportData}
                  onClearAllData={handleClearAllData}
                  statuses={statuses}
                  selectedMonth={selectedMonthKey}
                  onSelectMonth={setSelectedMonthKey}
                />
              )}

              {activeTab === 'timeline' && (
                <TimelineTab
                  jobs={jobs}
                  settings={settings}
                  statuses={statuses}
                  onEditJob={(jobId) => {
                    setJobIdToOpen(jobId);
                    setActiveTab('jobs');
                  }}
                  onDeleteJob={handleDeleteJob}
                />
              )}

              {activeTab === 'split' && (
                <SplitTab
                  jobs={jobs}
                  goals={goals}
                  settings={settings}
                  onAddGoal={handleAddGoal}
                  onDeleteGoal={handleDeleteGoal}
                  onUpdateGoalProgress={handleUpdateGoalProgress}
                  onDeleteGoalTransaction={handleDeleteGoalTransaction}
                  onTransferBetweenGoals={handleTransferBetweenGoals}
                  onUpdateGoal={handleUpdateGoal}
                  onAllocateSavingsToGoal={handleAllocateSavingsToGoal}
                  onAllocateMultipleSavings={handleAllocateMultipleSavings}
                  onUpdateSettings={handleUpdateSettings}
                  onSwitchTab={setActiveTab}
                  onImportData={handleImportData}
                  onExportData={handleExportData}
                  onClearAllData={handleClearAllData}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                  triggerPrompt={triggerPrompt}
                  initialSelectedGoalId={initialSelectedGoalId}
                  onClearInitialGoalId={() => setInitialSelectedGoalId(null)}
                  selectedMonthKey={selectedMonthKey}
                />
              )}

              {activeTab === 'tax' && (
                isPro ? (
                  <TaxTab
                    jobs={jobs}
                    expenses={expenses}
                    settings={settings}
                    onUpdateSettings={handleUpdateSettings}
                    triggerAlert={triggerAlert}
                    triggerConfirm={triggerConfirm}
                  />
                ) : (
                  <PremiumUpsell
                    feature="ผู้ช่วยจัดการภาษีบุคคลธรรมดา"
                    description="คำนวณภาษีเงินได้ แนะนำรายการลดหย่อน และจัดการเอกสารหักภาษี ณ ที่จ่าย เป็นฟีเจอร์สำหรับสมาชิกรายเดือนครับ"
                    onUpgrade={handleUpgrade}
                  />
                )
              )}

              {activeTab === 'invoice' && (
                isPro ? (
                  <InvoiceTab
                    jobs={jobs}
                    triggerAlert={triggerAlert}
                    triggerConfirm={triggerConfirm}
                  />
                ) : (
                  <PremiumUpsell
                    feature="ออกใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จรับเงิน"
                    description="ออกเอกสารสำเร็จรูปพร้อมโลโก้และดึงข้อมูลจากดีลงานได้ทันที กดเซฟเป็น PDF ส่งลูกค้าได้เลย เป็นฟีเจอร์สำหรับสมาชิกรายเดือนครับ"
                    onUpgrade={handleUpgrade}
                  />
                )
              )}

              {activeTab === 'report' && (
                <MonthlyReportTab
                  jobs={jobs}
                  goals={goals}
                  expenses={expenses}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  userEmail={session?.user?.email || 'user@example.com'}
                  notifSettings={notifSettings}
                  onUpdateNotifSettings={setNotifSettings}
                  onSwitchTab={setActiveTab}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                />
              )}

              {activeTab === 'insight' && (
                isPro ? (
                  <InsightTab jobs={jobs} onSwitchTab={setActiveTab} />
                ) : (
                  <PremiumUpsell
                    feature="วิเคราะห์รายได้เชิงลึก"
                    description="ดูว่าลูกค้าคนไหนหรืองานประเภทไหนทำเงินให้คุณมากที่สุด เปรียบเทียบย้อนหลังได้ทันที เป็นฟีเจอร์สำหรับสมาชิกรายเดือนครับ"
                    onUpgrade={handleUpgrade}
                  />
                )
              )}

              {activeTab === 'plans' && (
                <PlansTab
                  isPro={isPro}
                  isPaidActive={isPaidActive}
                  isInFreeTrial={isInFreeTrial}
                  trialEndsAt={trialEndsAt}
                  subscription={subscription}
                  onUpgrade={handleUpgrade}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab
                  settings={settings}
                  onSwitchTab={setActiveTab}
                  onUpdateSettings={handleUpdateSettings}
                  onImportData={handleImportData}
                  onClearAllData={handleClearAllData}
                  cloudSyncStatus={cloudSyncStatus}
                  loadCloudData={loadCloudData}
                  onOpenCloudModal={() => setIsCloudModalOpen(true)}
                  session={session}
                  onSignOut={handleSignOut}
                  triggerAlert={triggerAlert}
                  triggerConfirm={triggerConfirm}
                  triggerPrompt={triggerPrompt}
                  userAvatar={userAvatar}
                  onUpdateUserAvatar={handleUpdateUserAvatar}
                  onStartTour={() => {
                    setTourStep(0);
                    setActiveTab('dashboard');
                  }}
                  onReplaySetupWizard={() => {
                    setIsSetupWizardPreview(true);
                  }}
                  subscription={subscription}
                  isPaidActive={isPaidActive}
                  isInFreeTrial={isInFreeTrial}
                  trialEndsAt={trialEndsAt}
                  notifSettings={notifSettings}
                  onUpdateNotifSettings={setNotifSettings}
                  isPro={isPro}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Custom Dialog overlay */}
        <CustomDialog
          dialog={dialog}
          onClose={() => setDialog(prev => ({ ...prev, isOpen: false }))}
        />

        {/* 🎉 Pro plan promo, shown once/day to non-Pro users */}
        <AnimatePresence>
          {isProPromoOpen && (
            <ProPromoModal
              onUpgrade={() => {
                setIsProPromoOpen(false);
                handleUpgrade();
              }}
              onClose={() => setIsProPromoOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* ☁️ Supabase Cloud Sync Setup Guide Modal */}
        <AnimatePresence>
          {isCloudModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="bg-brand-white rounded-3xl p-6 shadow-2xl max-w-lg w-full border border-brand-border/40 dark:border-neutral-800 text-brand-text max-h-[85vh] overflow-y-auto no-scrollbar"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div>
                      <h3 className="font-display font-extrabold text-base tracking-tight text-brand-text">
                        เปิดใช้งานระบบคลาวด์ซิงค์ (Cloud Sync)
                      </h3>
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-wide">
                        ซิงค์ข้อมูลระหว่างคอมและมือถืออัตโนมัติ
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsCloudModalOpen(false)}
                    className="p-1 px-2.5 rounded-lg bg-brand-faint hover:bg-brand-border/40 text-brand-muted text-xs font-bold cursor-pointer"
                  >
                    ปิด
                  </button>
                </div>

                <div className="space-y-4 text-xs leading-relaxed text-brand-muted dark:text-neutral-300 mt-4">
                  {lastCloudError && (
                    <div className="p-3.5 bg-red-500/10 dark:bg-red-950/20 border border-red-500/20 text-red-700 dark:text-red-400 rounded-2xl flex flex-col gap-1.5 text-[11px] leading-relaxed select-text">
                      <div className="flex gap-1.5 items-center font-extrabold text-red-800 dark:text-red-300">
                        <span>Found Sync Error:</span>
                        <span>มีปัญหาในการซิงค์ข้อมูล</span>
                      </div>
                      <p className="font-mono bg-black/5 dark:bg-black/25 p-2 rounded-xl mt-0.5 text-[10px] break-all border border-red-500/10">
                        {lastCloudError}
                      </p>
                    </div>
                  )}

                  <p>
                    ยินดีต้อนรับสู่ระบบ <strong className="text-brand-text">กระรอกตุนเงิน Cloud Sync</strong>! ข้อมูลทั้งหมดของคุณจะถูกบันทึกและซิงค์อย่างปลอดภัยโดยอัตโนมัติบนระบบคลาวด์แบบ Realtime เพื่อให้คุณสามารถใช้งานแอปพลิเคชันจากหลายอุปกรณ์พร้อมกันได้ทันทีอย่างไร้รอยต่อ
                  </p>

                  <div className="bg-brand-faint p-4 rounded-2xl border border-brand-border/30 space-y-3">
                    <h4 className="font-extrabold text-brand-text flex items-center gap-1.5">
                      ความปลอดภัยและการเก็บข้อมูล:
                    </h4>
                    <ul className="list-disc list-inside space-y-1.5 pl-1 font-medium text-brand-muted dark:text-neutral-300">
                      <li><strong>แยกพื้นที่ข้อมูลส่วนบุคคล:</strong> มีระบบรักษาความปลอดภัยที่แข็งแกร่ง ป้องกันไม่ให้ผู้อื่นเข้าถึงข้อมูลของคุณได้อย่างเด็ดขาด</li>
                      <li><strong>ซิงค์อัตโนมัติในเบื้องหลัง:</strong> เมื่อมีการแก้ไขข้อมูลใดๆ ระบบจะทำการบันทึกลงสู่เซิร์ฟเวอร์แบบดีเลย์ (Debounced Save) ทันทีเพื่อประหยัดพลังงานอินเทอร์เน็ต</li>
                      <li><strong>รองรับโหมดออฟไลน์:</strong> ทำงานได้ดีแม้สัญญานอินเทอร์เน็ตขาดหาย และจะซิงค์ข้อมูลล่าสุดเมื่อกลับมาเชื่อมต่ออีกครั้ง</li>
                    </ul>
                  </div>

                  <p className="text-[10px] text-brand-muted italic">
                    สถานะการเชื่อมต่อที่เป็นสัญลักษณ์ก้อนเมฆสีเขียว "ซิงค์แล้ว" บ่งบอกว่าข้อมูลปัจจุบันของคุณตรงกับระบบคลาวด์เรียบร้อยแล้วครับ!
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-brand-border/40 flex justify-end">
                  <button
                    onClick={() => setIsCloudModalOpen(false)}
                    className="py-2.5 px-6 bg-brand-primary text-brand-secondary rounded-2xl text-xs font-extrabold tracking-wide shadow-md hover:shadow-lg transition-all cursor-pointer border border-brand-secondary"
                  >
                    รับทราบและปิดหน้านี้
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <ProfileSetupWizard
          isOpen={!!isLoadedForUser && (!settings.profileSetupCompleted || isSetupWizardPreview)}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onAddGoal={handleAddGoal}
          onAddJobTypes={(types) => setJobTypes(prev => Array.from(new Set([...prev, ...types])))}
          isPreview={isSetupWizardPreview}
          onComplete={() => {
            setIsSetupWizardPreview(false);
            if (!isSetupWizardPreview) setTourStep(0);
          }}
        />

        <TourModal
          tourStep={tourStep}
          steps={TOUR_STEPS}
          onNext={handleNextTourStep}
          onPrev={handlePrevTourStep}
          onSkip={handleCompleteTour}
        />

        <MascotToast />
      </div>
    </div>
  );
}


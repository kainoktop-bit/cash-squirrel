import React, { useState, useEffect } from 'react';
import { AppSettings, FixedExpenseItem, NotifSettings } from '../types';
import { formatCurrency, sumFixedExpenseItems } from '../utils';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download,
  Upload,
  User,
  LogOut,
  Trash2,
  AlertCircle,
  ShieldAlert,
  FileJson,
  Lock,
  Database,
  Plus,
  ArrowRight,
  Bell,
  Mail,
  MessageCircle,
  ExternalLink,
  Copy,
  Sparkles
} from 'lucide-react';
import { Mascot } from './Mascot';
import { IconCrown, IconClose, IconCheck } from './icons';

interface SettingsTabProps {
  settings: AppSettings;
  onSwitchTab: (tabId: string) => void;
  onUpdateSettings: (settings: AppSettings) => void;
  onImportData: (data: string) => void;
  onClearAllData: () => void;
  cloudSyncStatus: 'synced' | 'pending' | 'failed' | 'not_setup';
  loadCloudData: (email: string) => void;
  onOpenCloudModal: () => void;
  session: any;
  onSignOut: () => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  triggerPrompt: (
    title: string,
    message: string,
    defaultValue: string,
    placeholder: string,
    inputType: 'text' | 'number',
    onConfirm: (val: string) => void
  ) => void;
  userAvatar: string;
  onUpdateUserAvatar: (newAvatar: string) => void;
  onStartTour?: () => void;
  onReplaySetupWizard?: () => void;
  subscription?: {
    status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
    plan: string | null;
    currentPeriodEnd: string | null;
  } | null;
  isPaidActive?: boolean;
  isInFreeTrial?: boolean;
  trialEndsAt?: Date | null;
  notifSettings: NotifSettings;
  onUpdateNotifSettings: (notifSettings: NotifSettings) => void;
  isPro?: boolean;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  onSwitchTab,
  onUpdateSettings,
  onImportData,
  onClearAllData,
  cloudSyncStatus,
  loadCloudData,
  onOpenCloudModal,
  session,
  onSignOut,
  triggerAlert,
  triggerConfirm,
  triggerPrompt,
  userAvatar,
  onUpdateUserAvatar,
  onStartTour,
  onReplaySetupWizard,
  subscription,
  isPaidActive,
  isInFreeTrial,
  trialEndsAt,
  notifSettings,
  onUpdateNotifSettings,
  isPro
}) => {
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [newFixedExpenseName, setNewFixedExpenseName] = useState('');
  const [newFixedExpenseAmount, setNewFixedExpenseAmount] = useState('');

  const [lineLinkCode, setLineLinkCode] = useState<string | null>(null);
  const [isGeneratingLineCode, setIsGeneratingLineCode] = useState(false);
  const [lineLinkCopied, setLineLinkCopied] = useState(false);

  const handleGenerateLineCode = async () => {
    setIsGeneratingLineCode(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('ไม่พบเซสชันผู้ใช้ กรุณาล็อกอินใหม่');

      const res = await fetch('/api/line-link-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'สร้างรหัสเชื่อมต่อไม่สำเร็จ');
      setLineLinkCode(json.code);
      // The API wrote this straight to Supabase, bypassing local state -- if we don't mirror
      // it here too, the app's own debounced/on-hide cloud-save (which fires the instant you
      // switch to LINE to type the code) will overwrite it with this stale copy and erase it
      // before you can ever send it.
      onUpdateNotifSettings({ ...notifSettings, lineLinkCode: json.code, lineLinkCodeExpiresAt: json.expiresAt });
    } catch (err: any) {
      triggerAlert('สร้างรหัสเชื่อมต่อไม่สำเร็จ', err.message || 'ลองใหม่อีกครั้งครับ');
    } finally {
      setIsGeneratingLineCode(false);
    }
  };

  const handleCopyLineCode = () => {
    if (!lineLinkCode) return;
    navigator.clipboard.writeText(lineLinkCode).then(() => {
      setLineLinkCopied(true);
      setTimeout(() => setLineLinkCopied(false), 2000);
    });
  };

  const handleDisconnectLine = () => {
    triggerConfirm(
      'ยกเลิกการเชื่อมต่อ LINE',
      'คุณต้องการยกเลิกการรับแจ้งเตือนผ่าน LINE ใช่หรือไม่? ยังรับแจ้งเตือนทางอีเมลได้ตามปกติ',
      () => {
        // lineUserId is deliberately excluded from the generic debounced/flush autosave (see
        // saveCloudData in App.tsx) since a stale in-memory copy would otherwise clobber a LINE
        // link the webhook just wrote from an entirely separate session. Disconnecting is the one
        // legitimate client-initiated write to this field, so it goes straight to the same RPC
        // immediately here, instead of waiting on that path.
        onUpdateNotifSettings({ ...notifSettings, lineUserId: null });
        const userId = session?.user?.id;
        if (userId) {
          supabase.rpc('merge_notif_settings', { p_user_id: userId, p_patch: { lineUserId: null } })
            .then(({ error }: { error: any }) => {
              if (error) {
                console.warn('handleDisconnectLine: merge_notif_settings failed:', error);
                triggerAlert('ยกเลิกการเชื่อมต่อไม่สำเร็จ', 'ลองใหม่อีกครั้งครับ');
              }
            });
        }
      }
    );
  };

  // While a link code is showing, poll for the webhook having linked the account (it happens
  // from an entirely separate LINE-app session, so there's no other signal this tab would get).
  // Without this, the UI keeps showing "not connected" until a manual reload even though the
  // link already succeeded server-side.
  useEffect(() => {
    if (!lineLinkCode || notifSettings.lineUserId) return;
    const userId = session?.user?.id;
    if (!userId) return;
    const interval = setInterval(async () => {
      const { data, error } = await supabase
        .from('user_cashflow_data')
        .select('notif_settings')
        .eq('user_id', userId)
        .maybeSingle();
      if (error || !data?.notif_settings?.lineUserId) return;
      setLineLinkCode(null);
      onUpdateNotifSettings({ ...notifSettings, lineUserId: data.notif_settings.lineUserId });
    }, 3000);
    return () => clearInterval(interval);
  }, [lineLinkCode, notifSettings.lineUserId, session?.user?.id]);

  const fixedExpenseItems = settings.fixedExpenseItems || [];

  const handleAddFixedExpenseItem = () => {
    const amount = parseFloat(newFixedExpenseAmount);
    if (!newFixedExpenseName.trim() || isNaN(amount) || amount < 0) return;

    // First item ever added: carry the existing lump-sum value forward so nothing is lost
    let baseItems = fixedExpenseItems;
    if (baseItems.length === 0 && settings.monthlyExpense > 0) {
      baseItems = [{ id: `fx-legacy-${Date.now()}`, name: 'ค่าใช้จ่ายเดิม (แก้ไขชื่อได้)', amount: settings.monthlyExpense }];
    }

    const newItem: FixedExpenseItem = { id: `fx-${Date.now()}`, name: newFixedExpenseName.trim(), amount };
    const updatedItems = [...baseItems, newItem];

    onUpdateSettings({ ...settings, fixedExpenseItems: updatedItems, monthlyExpense: sumFixedExpenseItems(updatedItems) });
    setNewFixedExpenseName('');
    setNewFixedExpenseAmount('');
  };

  const handleRemoveFixedExpenseItem = (id: string) => {
    const updatedItems = fixedExpenseItems.filter(item => item.id !== id);
    onUpdateSettings({ ...settings, fixedExpenseItems: updatedItems, monthlyExpense: sumFixedExpenseItems(updatedItems) });
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type === "application/json" || file.name.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          try {
            JSON.parse(text); // validation check
            onImportData(text);
          } catch (err) {
            triggerAlert('ไฟล์ไม่ถูกต้อง', 'ไฟล์ที่อัปโหลดไม่ใช่รูปแบบ JSON ที่ถูกต้อง โปรดตรวจสอบอีกครั้ง');
          }
        };
        reader.readAsText(file);
      } else {
        triggerAlert('ประเภทไฟล์ไม่ถูกต้อง', 'โปรดอัปโหลดไฟล์สำรองที่มีนามสกุล .json เท่านั้น');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        JSON.parse(text); // validation check
        onImportData(text);
      } catch (err) {
        triggerAlert('ไฟล์ไม่ถูกต้อง', 'ไฟล์ที่อัปโหลดไม่ใช่รูปแบบ JSON ที่ถูกต้อง โปรดตรวจสอบอีกครั้ง');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
          {/* Card 1: Proportions & Financial Targets */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <Database className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                สัดส่วน & เป้าหมายการเงินคงที่
              </h3>
            </div>

            <div className="space-y-4">
              {/* Base Expense - itemized breakdown */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs font-bold text-brand-text dark:text-neutral-200">
                    ค่าใช้จ่ายส่วนตัวรายเดือนคงที่ (฿)
                  </label>
                  <span className="text-[10px] font-mono font-black text-emerald-600">
                    รวม {formatCurrency(settings.monthlyExpense)}
                  </span>
                </div>

                {fixedExpenseItems.length > 0 && (
                  <div className="space-y-1.5">
                    {fixedExpenseItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-2 bg-brand-faint dark:bg-stone-950 border border-brand-border dark:border-neutral-850 rounded-xl px-3 py-2">
                        <span className="text-xs font-bold text-brand-text dark:text-neutral-200 truncate">{item.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-mono font-black text-brand-text dark:text-white">{formatCurrency(item.amount)}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFixedExpenseItem(item.id)}
                            className="text-neutral-400 hover:text-rose-600 cursor-pointer transition-colors"
                            title="ลบรายการนี้"
                          >
                            <IconClose className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newFixedExpenseName}
                    onChange={(e) => setNewFixedExpenseName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFixedExpenseItem(); } }}
                    placeholder="เช่น ค่าห้อง, ค่ารถ, ค่าเน็ต"
                    className="flex-1 min-w-0 bg-brand-faint dark:bg-stone-950 border border-brand-border dark:border-neutral-850 rounded-xl px-3 py-2 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-emerald-500"
                  />
                  <input
                    type="number"
                    value={newFixedExpenseAmount}
                    onChange={(e) => setNewFixedExpenseAmount(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFixedExpenseItem(); } }}
                    placeholder="บาท"
                    className="w-24 shrink-0 bg-brand-faint dark:bg-stone-950 border border-brand-border dark:border-neutral-850 rounded-xl px-3 py-2 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddFixedExpenseItem}
                    className="shrink-0 p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all cursor-pointer"
                    title="เพิ่มรายการ"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-[9px] text-brand-muted leading-relaxed">
                  เงินขั้นต่ำที่ต้องจ่ายออกทุกเดือนสำหรับค่ากิน ค่าห้อง ค่าน้ำ ค่าไฟคงที่ — แตกเป็นรายการย่อยได้เอง ระบบรวมยอดให้อัตโนมัติ
                </p>
              </div>

              {/* Target Revenue */}
              <div className="flex flex-col gap-2 pt-2 border-t border-brand-border/20 dark:border-neutral-800/40">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs font-bold text-brand-text dark:text-neutral-200">
                    เป้ารายรับพึงประสงค์รายเดือน (฿)
                  </label>
                  <span className="text-[10px] font-mono font-black text-emerald-600">
                    {formatCurrency(settings.monthlyRevenueGoal)}
                  </span>
                </div>
                <input
                  type="number"
                  value={settings.monthlyRevenueGoal}
                  onChange={(e) => onUpdateSettings({ ...settings, monthlyRevenueGoal: parseFloat(e.target.value) || 0 })}
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border dark:border-neutral-850 rounded-xl px-3 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-emerald-500 w-full"
                  placeholder="เช่น 50000"
                />
                <p className="text-[9px] text-brand-muted leading-relaxed">
                  เป้าหมายรายได้รวมสูงสุดที่คุณตั้งเป้าจะกวาดให้ถึงในรอบเดือนเก็บเกี่ยวนี้
                </p>
              </div>
            </div>
          </div>

          {/* Card 1.5: Notifications -- LINE linking + email report/digest opt-ins. Moved here
              from the "รายงานรายเดือน" tab since these are account-level connections, not
              report content, and were easy to miss buried among charts and tables there. */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <Bell className="w-4.5 h-4.5 text-pink-acc" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                การแจ้งเตือน
              </h3>
            </div>

            <div className="space-y-3">
              {/* Monthly report email opt-in (Pro) */}
              <button
                type="button"
                disabled={!isPro}
                onClick={() => {
                  if (!isPro) {
                    onSwitchTab('plans');
                    return;
                  }
                  onUpdateNotifSettings({
                    ...notifSettings,
                    monthlyReportEnabled: !notifSettings.monthlyReportEnabled
                  });
                }}
                className={`w-full flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  notifSettings.monthlyReportEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-brand-white dark:bg-stone-900 border-brand-border/40 dark:border-neutral-800 hover:border-brand-border'
                }`}
              >
                <Mail className="w-4 h-4 text-[#E65F2B] dark:text-[#FFA473] shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-black text-brand-text dark:text-white flex items-center gap-1">
                    สรุปงบการเงินรายเดือนอัตโนมัติทางอีเมล
                    {!isPro && <Sparkles className="w-3 h-3 text-[#E65F2B] dark:text-[#FFA473]" />}
                  </span>
                  <p className="text-[9px] text-brand-muted leading-relaxed mt-0.5">
                    {isPro
                      ? 'ระบบส่งสรุปรายรับ-รายจ่ายของเดือนที่ผ่านมาให้อัตโนมัติทุกวันที่ 1'
                      : 'ฟีเจอร์สำหรับสมาชิก Pro — สมัครเพื่อเปิดใช้งาน'}
                  </p>
                </div>
                <div
                  className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${
                    notifSettings.monthlyReportEnabled ? 'bg-emerald-600' : 'bg-brand-border dark:bg-neutral-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      notifSettings.monthlyReportEnabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>

              {/* Daily overdue-digest opt-in (Pro) */}
              <button
                type="button"
                disabled={!isPro}
                onClick={() => {
                  if (!isPro) {
                    onSwitchTab('plans');
                    return;
                  }
                  onUpdateNotifSettings({
                    ...notifSettings,
                    dailyDigestEnabled: !notifSettings.dailyDigestEnabled
                  });
                }}
                className={`w-full flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  notifSettings.dailyDigestEnabled
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-brand-white dark:bg-stone-900 border-brand-border/40 dark:border-neutral-800 hover:border-brand-border'
                }`}
              >
                <Mail className="w-4 h-4 text-[#E65F2B] dark:text-[#FFA473] shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-black text-brand-text dark:text-white flex items-center gap-1">
                    สรุปงานค้างชำระรายวันทางอีเมล
                    {!isPro && <Sparkles className="w-3 h-3 text-[#E65F2B] dark:text-[#FFA473]" />}
                  </span>
                  <p className="text-[9px] text-brand-muted leading-relaxed mt-0.5">
                    {isPro
                      ? 'ระบบส่งอีเมลสรุปดีลที่เลยกำหนดชำระให้ทุกเช้า ไม่ต้องเปิดแอปเอง'
                      : 'ฟีเจอร์สำหรับสมาชิก Pro — สมัครเพื่อเปิดใช้งาน'}
                  </p>
                </div>
                <div
                  className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${
                    notifSettings.dailyDigestEnabled ? 'bg-emerald-600' : 'bg-brand-border dark:bg-neutral-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      notifSettings.dailyDigestEnabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>

              {/* LINE notification linking -- reuses the same Pro gate as the email digests above,
                  since it's the same underlying notification feature. */}
              <div className={`p-3 rounded-2xl border ${
                notifSettings.lineUserId
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-brand-white dark:bg-stone-900 border-brand-border/40 dark:border-neutral-800'
              }`}>
                <div className="flex items-center gap-2.5">
                  <MessageCircle className="w-4 h-4 text-[#06C755] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] font-black text-brand-text dark:text-white flex items-center gap-1">
                      รับแจ้งเตือนผ่าน LINE
                      {!isPro && <Sparkles className="w-3 h-3 text-[#E65F2B] dark:text-[#FFA473]" />}
                    </span>
                    <p className="text-[9px] text-brand-muted leading-relaxed mt-0.5">
                      {notifSettings.lineUserId
                        ? 'เชื่อมต่อแล้ว -- แจ้งเตือนเดียวกับอีเมลจะส่งเข้า LINE ด้วย'
                        : isPro
                        ? 'เชื่อมบัญชี LINE เพื่อรับแจ้งเตือนเดียวกับอีเมล เผื่อพลาดดูอีเมล'
                        : 'ฟีเจอร์สำหรับสมาชิก Pro -- สมัครเพื่อเปิดใช้งาน'}
                    </p>
                  </div>
                  {notifSettings.lineUserId ? (
                    <button
                      type="button"
                      onClick={handleDisconnectLine}
                      className="shrink-0 text-[10px] font-bold text-rose-600 hover:text-rose-700 dark:text-rose-400 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      ยกเลิก
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isPro) {
                          onSwitchTab('plans');
                          return;
                        }
                        handleGenerateLineCode();
                      }}
                      disabled={isGeneratingLineCode}
                      className="shrink-0 text-[10px] font-bold text-white bg-[#06C755] hover:bg-[#05B34C] px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isGeneratingLineCode ? 'กำลังสร้างรหัส...' : 'เชื่อมต่อ LINE'}
                    </button>
                  )}
                </div>

                {lineLinkCode && !notifSettings.lineUserId && (
                  <div className="mt-3 pt-3 border-t border-brand-border/30 space-y-2.5">
                    <p className="text-[10px] text-brand-muted leading-relaxed">
                      1. แอดเพื่อน LINE OA <span className="font-bold text-brand-text dark:text-white">@859mlugf</span>{' '}
                      <a
                        href="https://line.me/R/ti/p/@859mlugf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#06C755] font-bold inline-flex items-center gap-0.5 hover:underline"
                      >
                        (เปิดลิงก์แอดเพื่อน <ExternalLink className="w-2.5 h-2.5" />)
                      </a>
                      <br />
                      2. พิมพ์รหัสด้านล่างส่งไปที่แชท เพื่อยืนยันว่าเป็นบัญชีนี้
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-brand-faint dark:bg-stone-850 rounded-xl px-3 py-2 text-center font-mono font-black text-sm tracking-widest text-brand-text dark:text-white">
                        {lineLinkCode}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyLineCode}
                        className="shrink-0 p-2 rounded-xl border border-brand-border/60 text-brand-muted hover:text-brand-text hover:bg-brand-faint dark:hover:bg-stone-850 transition-colors cursor-pointer"
                        title="คัดลอกรหัส"
                      >
                        {lineLinkCopied ? <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[9px] text-brand-muted/80">รหัสนี้ใช้ได้ 15 นาที หมดอายุแล้วกดเชื่อมต่อใหม่ได้เลย</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Offline Backup / Restore */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <FileJson className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                สำรอง & นำเข้าข้อมูลออฟไลน์
              </h3>
            </div>

            <div className="space-y-4">
              {/* Seamless Drag-and-Drop Area */}
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[140px] ${
                  dragActive 
                    ? 'border-indigo-500 bg-indigo-50/10 dark:bg-indigo-500/5 ring-4 ring-indigo-500/10' 
                    : 'border-brand-border hover:border-brand-border/80 dark:border-neutral-800 dark:hover:border-neutral-700 bg-brand-faint/30 dark:bg-neutral-800/20'
                }`}
              >
                <input 
                  type="file" 
                  id="json-settings-uploader" 
                  accept=".json" 
                  className="hidden" 
                  onChange={handleFileChange} 
                />
                <label htmlFor="json-settings-uploader" className="cursor-pointer block space-y-2.5 w-full">
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-full inline-block">
                    <Upload className="w-5.5 h-5.5 text-indigo-600 dark:text-indigo-400 animate-bounce" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-brand-text dark:text-white">
                      ลากไฟล์สำรอง .json มาวางที่นี่
                    </p>
                    <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold mt-1">
                      หรือคลิกเพื่อค้นหาและเลือกไฟล์กู้คืน
                    </p>
                  </div>
                </label>
              </div>

              {/* Pointer to export buttons, which now live on the Summary tab */}
              <button
                type="button"
                onClick={() => onSwitchTab('summary')}
                className="w-full py-2.5 bg-brand-faint dark:bg-neutral-800/50 hover:bg-brand-border/30 dark:hover:bg-neutral-800 text-brand-text dark:text-neutral-200 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-brand-border/40 dark:border-neutral-700"
              >
                <Download className="w-3.5 h-3.5" /> ต้องการสำรอง/Export ข้อมูล? ไปที่หน้า "สรุปยอดรายรับ"
              </button>
            </div>
          </div>

          {/* Card 3: Account Controls & Danger Zone */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <User className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                บัญชีความปลอดภัย & การควบคุมพิเศษ
              </h3>
            </div>

            <div className="space-y-4">
              {/* Profile card row */}
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-brand-faint/40 dark:bg-neutral-800/20 border border-brand-border/20 dark:border-neutral-800/40 rounded-3xl w-full">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl bg-blue-acc/15 dark:bg-[#FFA473]/15 flex items-center justify-center text-[#E65F2B] dark:text-[#FFA473] font-extrabold overflow-hidden border border-brand-border/30">
                    {userAvatar ? (
                      <img src={userAvatar} className="w-full h-full object-cover" alt="User Avatar" />
                    ) : (
                      <User className="w-7 h-7" />
                    )}
                  </div>
                  <label className="absolute -bottom-1 -right-1 p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm cursor-pointer transition-all border border-white dark:border-neutral-900 flex items-center justify-center">
                    <Upload className="w-3 h-3" />
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 2 * 1024 * 1024) {
                            triggerAlert('ไฟล์ใหญ่เกินไป', 'กรุณาอัปโหลดรูปภาพที่มีขนาดไม่เกิน 2MB');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const base64 = event.target?.result as string;
                            onUpdateUserAvatar(base64);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
                
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-[9px] text-brand-muted font-extrabold uppercase tracking-wider">บัญชีผู้ใช้งานปัจจุบัน</p>
                  <p className="text-xs text-brand-text dark:text-neutral-200 font-black truncate max-w-[200px]" title={session?.user?.email}>
                    {session?.user?.email || 'Guest User (ใช้งานแบบออฟไลน์)'}
                  </p>
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-1">
                    <label className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer">
                      เปลี่ยนรูปภาพ
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              triggerAlert('ไฟล์ใหญ่เกินไป', 'กรุณาอัปโหลดรูปภาพที่มีขนาดไม่เกิน 2MB');
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const base64 = event.target?.result as string;
                              onUpdateUserAvatar(base64);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                    {userAvatar && (
                      <>
                        <span className="text-brand-border dark:text-neutral-750 text-[10px]">•</span>
                        <button 
                          type="button" 
                          onClick={() => onUpdateUserAvatar('')}
                          className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline font-bold cursor-pointer"
                        >
                          ลบรูป
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => {
                    triggerConfirm(
                      'ออกจากระบบ',
                      'คุณต้องการออกจากระบบจากคลังกระรอกตุนเสบียงใช่หรือไม่?',
                      onSignOut
                    );
                  }}
                  className="sm:ml-auto w-full sm:w-auto px-3 py-2 bg-pink-bg hover:bg-pink-bg/80 text-pink-acc border border-pink-acc/15 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0"
                  title="ออกจากบัญชีนี้"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ออกจากระบบ</span>
                </button>
              </div>

              {session && !session.isGuest && (
                <div className="p-4 bg-gradient-to-br from-[#FDF3EC] to-brand-faint/40 dark:from-[#2A1810] dark:to-neutral-800/40 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-brand-text dark:text-white inline-flex items-center gap-1">แพ็กเกจโปร <IconCrown className="w-3 h-3" /></span>
                    {isPaidActive && (
                      <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase">Active</span>
                    )}
                    {!isPaidActive && isInFreeTrial && (
                      <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase">ทดลองใช้ฟรี</span>
                    )}
                  </div>
                  <p className="text-[10px] text-brand-muted leading-relaxed">
                    {isPaidActive && subscription?.currentPeriodEnd
                      ? `ใช้ได้ถึงวันที่ ${new Date(subscription.currentPeriodEnd).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} — จ่ายรายเดือนด้วยตัวเอง (ไม่ตัดอัตโนมัติ)`
                      : isInFreeTrial && trialEndsAt
                      ? `กำลังทดลองใช้ฟรี ถึงวันที่ ${trialEndsAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} สมัครแพ็กเกจโปรก่อนหมดเวลาเพื่อใช้งานต่อเนื่องได้เลย`
                      : 'แพ็กเกจโปร ฿149/เดือน จ่ายผ่านบัตรหรือพร้อมเพย์'}
                  </p>

                  <button
                    type="button"
                    onClick={() => onSwitchTab('plans')}
                    className="w-full py-2 bg-[#E65F2B] hover:bg-[#D8551F] text-white text-[10px] font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                  >
                    ดูรายละเอียดแพ็กเกจทั้งหมด <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}

              {onStartTour && (
                <button
                  type="button"
                  onClick={onStartTour}
                  className="w-full py-2.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Mascot mood="proud" size={24} className="mr-0.5" />
                  <span>เริ่มทัวร์แนะนำฟีเจอร์แอป (App Tutorial Tour)</span>
                </button>
              )}

              {onReplaySetupWizard && (
                <button
                  type="button"
                  onClick={onReplaySetupWizard}
                  className="w-full py-2.5 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 dark:bg-neutral-800/40 dark:text-neutral-300 border border-neutral-200/55 dark:border-neutral-800 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Mascot mood="wave" size={24} className="mr-0.5" />
                  <span>ดูหน้าตั้งค่าบัญชีเริ่มต้นอีกครั้ง</span>
                </button>
              )}

              {/* Safety switch to toggle Danger Zone */}
              <button
                type="button"
                onClick={() => setShowDangerZone(!showDangerZone)}
                className={`w-full py-2.5 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                  showDangerZone 
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' 
                    : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-600 dark:bg-neutral-800/40 dark:text-neutral-300 border-neutral-200/55 dark:border-neutral-800'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{showDangerZone ? 'ปิดพื้นที่ควบคุมพิเศษ' : 'เปิดโซนความปลอดภัยสูง'}</span>
              </button>

              {/* Collapse Danger Zone */}
              <AnimatePresence>
                {showDangerZone && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-rose-500/5 dark:bg-rose-950/15 border border-rose-500/20 rounded-2xl p-4 mt-1 space-y-3 overflow-hidden"
                  >
                    <div className="flex items-start gap-2 text-rose-800 dark:text-rose-400">
                      <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="text-[11px] font-bold">โซนความเสี่ยงสูง (Danger Zone)</h5>
                        <p className="text-[10px] text-brand-muted dark:text-rose-300/85 mt-0.5 leading-relaxed">
                          ปุ่มสำหรับล้างและลบโครงสร้างฐานข้อมูลรวมถึงดีลงาน เงินออมทั้งหมดของระบบ ข้อมูลของคุณจะสูญหายถาวรทันที
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const correctCode = Math.floor(1000 + Math.random() * 9000).toString();
                        triggerConfirm(
                          'ยืนยันต้องการล้างข้อมูลทั้งหมดใช่ไหม?',
                          `คำเตือนสูงสุด: ข้อมูลดีลงาน รายรับ รายจ่ายผันแปร และข้อมูลเป้าหมายออมเงินสะสมทั้งหมดจะถูกลบถาวร!\n\nโปรดตรวจสอบรหัสความปลอดภัยสำหรับการยืนยันลบในขั้นถัดไป: [ ${correctCode} ]`,
                          () => {
                            setTimeout(() => {
                              triggerPrompt(
                                'ป้อนรหัสเพื่อล้างข้อมูลแอป',
                                `กรุณากรอกรหัสรักษาความปลอดภัย 4 หลัก [ ${correctCode} ] เพื่อเริ่มล้างระบบข้อมูลถาวร:`,
                                '',
                                'พิมพ์รหัส 4 หลักที่แสดงอยู่บนจอ',
                                'text',
                                (enteredVal) => {
                                  if (enteredVal.trim() === correctCode) {
                                    onClearAllData();
                                    triggerAlert('ล้างข้อมูลสำเร็จ', 'ข้อมูลและรายละเอียดทางการเงินทั้งหมดถูกรีเซ็ตออกจากแอปอย่างปลอดภัยแล้ว');
                                    setShowDangerZone(false);
                                  } else {
                                    triggerAlert('รหัสไม่ถูกต้อง', 'รหัสความปลอดภัยที่คุณกรอกไม่ถูกต้อง ระบบได้ล็อคการเข้าถึงและยกเลิกกระบวนการลบทันที');
                                  }
                                }
                              );
                            }, 350);
                          }
                        );
                      }}
                      className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-rose-600/10 border border-rose-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> ล้างข้อมูลและรีเซ็ตแอปพลิเคชันทั้งหมด
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
    </div>
  );
};

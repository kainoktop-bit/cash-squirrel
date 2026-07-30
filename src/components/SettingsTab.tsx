import React, { useState } from 'react';
import { AppSettings, Job } from '../types';
import { formatCurrency } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  Cloud, 
  Download, 
  Upload, 
  User, 
  LogOut, 
  Trash2, 
  AlertCircle, 
  ShieldAlert, 
  Check, 
  RefreshCcw, 
  FileJson, 
  Lock, 
  Database,
  FileSpreadsheet
} from 'lucide-react';
import { Mascot } from './Mascot';

interface SettingsTabProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onImportData: (data: string) => void;
  onExportData: () => void;
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
  onUpgrade?: () => void;
  isPaidActive?: boolean;
  isInFreeTrial?: boolean;
  trialEndsAt?: Date | null;
  jobs: Job[];
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  onUpdateSettings,
  onImportData,
  onExportData,
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
  onUpgrade,
  isPaidActive,
  isInFreeTrial,
  trialEndsAt,
  jobs
}) => {
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Export to CSV for Google Sheets
  const handleExportCSV = () => {
    if (!jobs || jobs.length === 0) {
      triggerAlert('ไม่พบข้อมูล 📂', 'คุณยังไม่มีข้อมูลโปรเจกต์งานที่จะส่งออกครับ ลองเพิ่มโปรเจกต์งานก่อนนะครับ');
      return;
    }

    // Define CSV headers
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

    // Map jobs to rows
    const rows = jobs.map(j => {
      // Determine status label
      let statusText = j.status;
      if (j.status === 'done') statusText = 'จ่ายแล้ว 🟢';
      else if (j.status === 'partial') statusText = 'มัดจำ/จ่ายบางส่วน 🟡';
      else if (j.status === 'pending') statusText = 'ยังไม่จ่าย 🔴';
      else {
        // Custom or matching ID status
        statusText = j.status;
      }

      // Helper to escape CSV quotes
      const escapeCSV = (val: any) => {
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
      };

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

    // Create CSV with UTF-8 BOM
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    // Download blob
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

    triggerAlert(
      'ส่งออก CSV สำเร็จ 🎉', 
      'ระบบดาวน์โหลดไฟล์ CSV สำหรับนำไปใส่ Google Sheets เรียบร้อยแล้ว!\n\n💡 วิธีนำเข้า Google Sheets:\n1. เปิด Google Sheets\n2. ไปที่เมนู "ไฟล์" (File) > "นำเข้า" (Import)\n3. เลือกแท็บ "อัปโหลด" (Upload) แล้วเลือกไฟล์ที่เพิ่งดาวน์โหลดไปนี้ครับ'
    );
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
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Left Column: Proportions & Cloud Sync */}
        <div className="space-y-6">
          {/* Card 1: Proportions & Financial Targets */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <Database className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                สัดส่วน & เป้าหมายการเงินคงที่
              </h3>
            </div>

            <div className="space-y-4">
              {/* Base Expense */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs font-bold text-brand-text dark:text-neutral-200">
                    ค่าใช้จ่ายส่วนตัวรายเดือนคงที่ (฿)
                  </label>
                  <span className="text-[10px] font-mono font-black text-emerald-600">
                    {formatCurrency(settings.monthlyExpense)}
                  </span>
                </div>
                <input
                  type="number"
                  value={settings.monthlyExpense}
                  onChange={(e) => onUpdateSettings({ ...settings, monthlyExpense: parseFloat(e.target.value) || 0 })}
                  className="bg-brand-faint dark:bg-stone-950 border border-brand-border dark:border-neutral-850 rounded-xl px-3 py-2.5 text-xs font-bold font-mono text-brand-text dark:text-white outline-none focus:border-emerald-500 w-full"
                  placeholder="เช่น 15000"
                />
                <p className="text-[9px] text-brand-muted leading-relaxed">
                  เงินขั้นต่ำที่ต้องจ่ายออกทุกเดือนสำหรับค่ากิน ค่าห้อง ค่าน้ำ ค่าไฟคงที่
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

          {/* Card 2: Cloud Sync Configuration */}
          <div className="bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
              <Cloud className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-black text-brand-text dark:text-white uppercase tracking-wider">
                ระบบคลาวด์ซิงค์ข้ามอุปกรณ์
              </h3>
            </div>

            <div className="space-y-4">
              <p className="text-[11px] text-brand-muted dark:text-neutral-300 leading-relaxed">
                ระบบเชื่อมต่อเก็บข้อมูลแบบ Realtime ผ่าน Supabase เพื่อให้คุณใช้งานข้อมูลเดียวกันได้เสมอตลอดเวลา ทั้งบนเครื่องคอมพิวเตอร์ แท็บเล็ต และสมาร์ทโฟน
              </p>

              {/* Connection Status Panel */}
              <div className="p-4 rounded-2xl border border-brand-border/40 dark:border-neutral-800/60 bg-brand-faint/40 dark:bg-neutral-800/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-brand-muted">สถานะซิงค์คลาวด์ปัจจุบัน:</span>
                  
                  {cloudSyncStatus === 'synced' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>คลาวด์ซิงค์แล้ว</span>
                    </span>
                  )}
                  {cloudSyncStatus === 'pending' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                      <span>กำลังส่งประมวลผล...</span>
                    </span>
                  )}
                  {cloudSyncStatus === 'failed' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span>ล้มเหลว / ออฟไลน์</span>
                    </span>
                  )}
                  {cloudSyncStatus === 'not_setup' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      <span>ยังไม่ตั้งค่าตาราง</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {cloudSyncStatus === 'failed' && (
                    <button 
                      onClick={() => session?.user?.email && loadCloudData(session.user.email)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer shadow-xs"
                    >
                      <RefreshCcw className="w-3.5 h-3.5 animate-spin-slow" />
                      <span>ลองเชื่อมต่อใหม่</span>
                    </button>
                  )}

                  <button
                    onClick={onOpenCloudModal}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20 border border-indigo-100/30 dark:border-indigo-500/10 transition-all cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>เกี่ยวกับ Cloud Sync</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Offline backup & Account zone */}
        <div className="space-y-6">
          {/* Card 3: Offline Backup / Restore */}
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

              {/* Download backup button */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={onExportData}
                  className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-indigo-100/30 dark:border-indigo-500/10"
                >
                  <Download className="w-3.5 h-3.5" /> สำรองข้อมูล (.json)
                </button>
                <button
                  onClick={handleExportCSV}
                  className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-emerald-100/30 dark:border-emerald-500/10"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> สำรองไป Google Sheets (.csv)
                </button>
              </div>
            </div>
          </div>

          {/* Card 4: Account Controls & Danger Zone */}
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
                    <span className="text-xs font-black text-brand-text dark:text-white">แพ็กเกจโปร 👑</span>
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
                      : 'แพ็กเกจโปร ฿39/เดือน จ่ายผ่านบัตรหรือพร้อมเพย์'}
                  </p>

                  {!isPaidActive && (
                    <ul className="space-y-1 pt-0.5">
                      {[
                        'ผู้ช่วยจัดการภาษีบุคคลธรรมดา คำนวณภาษี แนะนำรายการลดหย่อน และจัดการเอกสารหัก ณ ที่จ่าย',
                        'ออกใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จรับเงินพร้อมโลโก้ ดึงข้อมูลจากดีลงานได้ทันที เซฟเป็น PDF ส่งลูกค้าได้เลย'
                      ].map((benefit) => (
                        <li key={benefit} className="flex items-start gap-1.5 text-[10px] text-brand-text dark:text-neutral-200 leading-relaxed">
                          <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {onUpgrade && (
                    <button
                      type="button"
                      onClick={onUpgrade}
                      className="w-full py-2 bg-[#E65F2B] hover:bg-[#D8551F] text-white text-[10px] font-black rounded-xl transition-all cursor-pointer"
                    >
                      {isPaidActive ? 'ต่ออายุแพ็กเกจโปร ฿39/เดือน' : 'สมัครแพ็กเกจโปร ฿39/เดือน'}
                    </button>
                  )}
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
      </div>
    </div>
  );
};

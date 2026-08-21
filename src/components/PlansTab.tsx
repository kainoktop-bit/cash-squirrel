import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { IconCrown } from './icons';
import { Mascot } from './Mascot';

interface PlansTabProps {
  isPro: boolean;
  isPaidActive: boolean;
  isInFreeTrial: boolean;
  trialEndsAt: Date | null;
  subscription: {
    status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
    plan: string | null;
    currentPeriodEnd: string | null;
  } | null;
  onUpgrade: () => void;
}

const FREE_FEATURES = [
  'บันทึกงานดีล & ติดตามรายรับ-รายจ่ายไม่จำกัด',
  'แดชบอร์ดภาพรวมกระแสเงินสด',
  'จัดสรรเงิน & ตั้งเป้าหมายออม',
  'รายงานรายเดือน & ระบบเครดิตเทอม',
  'สำรอง/กู้คืนข้อมูลออฟไลน์'
];

const PRO_FEATURES = [
  'ผู้ช่วยจัดการภาษีบุคคลธรรมดา คำนวณภาษี แนะนำรายการลดหย่อน และจัดการเอกสารหัก ณ ที่จ่าย',
  'ออกใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จรับเงินพร้อมโลโก้ ดึงข้อมูลจากดีลงานได้ทันที เซฟเป็น PDF ส่งลูกค้าได้เลย',
  'วิเคราะห์รายได้เชิงลึก ดูว่าลูกค้าคนไหนหรืองานประเภทไหนทำเงินให้คุณมากที่สุด',
  'สรุปงานค้างชำระรายวันทางอีเมล ไม่ต้องเปิดแอปเองก็รู้ว่าใครยังไม่จ่าย'
];

export const PlansTab: React.FC<PlansTabProps> = ({
  isPro,
  isPaidActive,
  isInFreeTrial,
  trialEndsAt,
  subscription,
  onUpgrade
}) => {
  const statusText = isPaidActive && subscription?.currentPeriodEnd
    ? `ใช้ได้ถึงวันที่ ${new Date(subscription.currentPeriodEnd).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} — จ่ายรายเดือนด้วยตัวเอง (ไม่ตัดอัตโนมัติ)`
    : isInFreeTrial && trialEndsAt
    ? `กำลังทดลองใช้ฟรี ถึงวันที่ ${trialEndsAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} สมัครแพ็กเกจโปรก่อนหมดเวลาเพื่อใช้งานต่อเนื่องได้เลย`
    : 'ยังไม่ได้สมัครแพ็กเกจโปร';

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="text-center space-y-1.5">
        <Mascot mood="proud" size={72} className="mx-auto mb-2" />
        <h2 className="font-display font-black text-xl text-brand-text dark:text-white">แพ็กเกจของคุณ</h2>
        <p className="text-xs text-brand-muted">เลือกแพ็กเกจที่เหมาะกับคุณ ปลดล็อกเครื่องมือช่วยฟรีแลนซ์ครบวงจร</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Free card */}
        <div className="bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 space-y-4">
          <div>
            <h3 className="font-display font-black text-base text-brand-text dark:text-white">Free</h3>
            <p className="text-2xl font-black font-mono text-brand-text dark:text-white mt-1">฿0</p>
          </div>
          <ul className="space-y-2">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-[11px] text-brand-text dark:text-neutral-200 leading-relaxed">
                <Check className="w-3.5 h-3.5 text-brand-muted shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {!isPro && (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-brand-muted bg-brand-faint dark:bg-neutral-800 px-2.5 py-0.5 rounded-full">
              แพ็กเกจปัจจุบัน
            </span>
          )}
        </div>

        {/* Pro card */}
        <div
          className={`relative bg-brand-white dark:bg-stone-900 rounded-3xl p-6 space-y-4 border-2 ${
            isPro ? 'border-[#E65F2B] shadow-[0_8px_30px_-10px_rgba(230,95,43,0.35)]' : 'border-brand-border dark:border-neutral-800'
          }`}
        >
          <div>
            <h3 className="font-display font-black text-base text-brand-text dark:text-white flex items-center gap-1.5">
              Pro <IconCrown className="w-4 h-4 text-[#E65F2B] dark:text-[#FFA473]" />
            </h3>
            <p className="text-2xl font-black font-mono text-[#E65F2B] dark:text-[#FFA473] mt-1">
              ฿149<span className="text-xs text-brand-muted font-sans font-bold"> / เดือน</span>
            </p>
          </div>
          <ul className="space-y-2">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-1.5 text-[11px] text-brand-text dark:text-neutral-200 leading-relaxed">
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {isPaidActive ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
              แพ็กเกจปัจจุบัน
            </span>
          ) : isInFreeTrial ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full">
              <Sparkles className="w-2.5 h-2.5" /> ทดลองใช้ฟรี
            </span>
          ) : null}
        </div>
      </div>

      {/* Status / CTA panel */}
      <div className="bg-gradient-to-br from-[#FDF3EC] to-brand-faint/40 dark:from-[#2A1810] dark:to-neutral-800/40 rounded-3xl p-6 text-center space-y-3">
        <p className="text-xs text-brand-text dark:text-neutral-200 leading-relaxed max-w-md mx-auto">{statusText}</p>
        <button
          type="button"
          onClick={onUpgrade}
          className="px-8 py-3 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-[0_8px_20px_-6px_rgba(230,95,43,0.5)] transition-colors rounded-2xl text-xs font-black cursor-pointer"
        >
          {isPaidActive ? 'ต่ออายุแพ็กเกจโปร ฿149/เดือน' : 'สมัครแพ็กเกจโปร ฿149/เดือน'}
        </button>
        <p className="text-[10px] text-brand-muted">ชำระเองทุกเดือน ไม่ตัดบัตรอัตโนมัติ</p>
      </div>
    </div>
  );
};

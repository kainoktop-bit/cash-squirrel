import React from 'react';
import { motion } from 'motion/react';
import { X, FileText, MessageCircle, CreditCard, ArrowRight } from 'lucide-react';
import { IconCrown } from './icons';

interface ProPromoCardProps {
  onUpgrade: () => void;
  onClose: () => void;
  className?: string;
}

const FEATURES = [
  {
    icon: <IconCrown className="w-4 h-4 text-[#E65F2B]" />,
    bg: 'bg-[#E65F2B]/15',
    title: 'ผู้ช่วยจัดการรายรับ-รายจ่าย',
    desc: 'คำนวณภาษี และแนะนำการวางแผนการเงินแบบมืออาชีพ',
  },
  {
    icon: <FileText className="w-4 h-4 text-white" />,
    bg: 'bg-[#E65F2B]',
    title: 'ออกใบเสร็จ / ใบกำกับภาษี',
    desc: 'ใช้ได้ทั้งแบบ PDF ส่งลูกค้าได้เลย สะดวก รวดเร็ว',
  },
  {
    icon: <MessageCircle className="w-4 h-4 text-white" />,
    bg: 'bg-[#06C755]',
    title: 'สรุปงานค้างจ่ายระหว่างทำบิล',
    desc: 'เช็กง่าย ไม่ต้องเปิดแอปเองก็รู้ว่าใครยังไม่จ่าย',
  },
];

// The rich promo card itself -- shared by ProPromoModal (as a centered overlay popup, shown once
// a day) and App.tsx's dashboard banner (rendered inline, no overlay, shown once a week). Same
// visual either way; `className` lets each caller control width/margins for its own layout.
export const ProPromoCard: React.FC<ProPromoCardProps> = ({ onUpgrade, onClose, className }) => {
  return (
    <div className={`relative bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 rounded-3xl shadow-xl overflow-hidden ${className || 'max-w-md w-full'}`}>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-1.5 rounded-full text-brand-muted hover:text-brand-text hover:bg-brand-white/70 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
        aria-label="ปิด"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Hero: tagline + title + price on the left, illustration on the right (stacks on narrow screens) */}
      <div className="flex flex-col sm:flex-row items-center gap-3 px-6 pt-6 pb-4 bg-gradient-to-b from-[#FBF2E4] to-brand-white dark:from-neutral-800 dark:to-neutral-900 text-center sm:text-left">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-brand-muted -rotate-1">จัดการเรื่องเงินให้เป็นเรื่องง่ายขึ้น</p>
          <h3 className="font-display font-black text-xl sm:text-2xl text-brand-text dark:text-white flex items-center justify-center sm:justify-start gap-1.5 mt-1">
            กระรอกตุนเงิน Pro <IconCrown className="w-4 h-4 text-[#E65F2B] dark:text-[#FFA473]" />
          </h3>
          <p className="inline-flex items-baseline gap-1 bg-[#E65F2B]/10 rounded-2xl px-3.5 py-1.5 mt-2.5">
            <span className="text-2xl font-black font-mono text-[#E65F2B] dark:text-[#FFA473]">฿149</span>
            <span className="text-xs text-brand-muted font-sans font-bold">/เดือน</span>
          </p>
        </div>
        <img src="/pro-promo-hero.png" alt="" className="w-32 sm:w-36 shrink-0" />
      </div>

      {/* Features */}
      <div className="grid grid-cols-3 gap-2.5 px-5 py-5 border-t border-brand-border/60 dark:border-neutral-800">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex flex-col items-center text-center gap-1.5">
            <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${f.bg}`}>
              {f.icon}
            </span>
            <p className="text-[10px] font-black text-brand-text dark:text-white leading-tight">{f.title}</p>
            <p className="text-[9px] text-brand-muted leading-snug">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="px-5 pb-5">
        <button
          type="button"
          onClick={onUpgrade}
          className="w-full py-3.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-[0_8px_20px_-6px_rgba(230,95,43,0.5)] transition-colors rounded-2xl text-sm font-black cursor-pointer flex items-center justify-center gap-2"
        >
          <CreditCard className="w-4 h-4" />
          สมัครแพ็กเกจโปร ฿149/เดือน
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-2 text-brand-muted hover:text-brand-text text-[11px] font-bold transition-colors cursor-pointer"
        >
          ไว้คราวหน้า
        </button>
        <p className="flex items-center justify-center gap-2.5 text-[10px] text-brand-muted mt-1">
          <span className="h-px w-7 bg-brand-border dark:bg-neutral-700" />
          ให้การเงินเป็นเรื่องง่าย สำหรับคุณ
          <span className="h-px w-7 bg-brand-border dark:bg-neutral-700" />
        </p>
      </div>
    </div>
  );
};

interface ProPromoModalProps {
  onUpgrade: () => void;
  onClose: () => void;
}

export const ProPromoModal: React.FC<ProPromoModalProps> = ({ onUpgrade, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <ProPromoCard onUpgrade={onUpgrade} onClose={onClose} />
      </motion.div>
    </div>
  );
};

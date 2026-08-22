import React from 'react';
import { motion } from 'motion/react';
import { Check, X } from 'lucide-react';
import { Mascot } from './Mascot';
import { IconCrown } from './icons';

interface ProPromoModalProps {
  onUpgrade: () => void;
  onClose: () => void;
}

const HIGHLIGHTS = [
  'ผู้ช่วยจัดการภาษีบุคคลธรรมดา คำนวณภาษีและแนะนำรายการลดหย่อนอัตโนมัติ',
  'ออกใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จรับเงินพร้อมโลโก้ เป็น PDF ส่งลูกค้าได้เลย',
  'สรุปงานค้างชำระรายวันทางอีเมล/LINE ไม่ต้องเปิดแอปเองก็รู้ว่าใครยังไม่จ่าย'
];

export const ProPromoModal: React.FC<ProPromoModalProps> = ({ onUpgrade, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative bg-brand-white dark:bg-neutral-900 border border-brand-border/60 dark:border-neutral-800 rounded-3xl p-6 max-w-sm w-full shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-brand-muted hover:text-brand-text hover:bg-brand-faint dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          aria-label="ปิด"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <Mascot mood="proud" size={80} className="mb-3" />
          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#E65F2B] bg-[#E65F2B]/10 px-2.5 py-0.5 rounded-full mb-2">
            อัปเกรดเป็นสมาชิก
          </span>
          <h3 className="font-display font-black text-lg text-brand-text dark:text-white flex items-center gap-1.5">
            กระรอกตุนเงิน Pro <IconCrown className="w-4 h-4 text-[#E65F2B] dark:text-[#FFA473]" />
          </h3>
          <p className="text-2xl font-black font-mono text-[#E65F2B] dark:text-[#FFA473] mt-1">
            ฿149<span className="text-xs text-brand-muted font-sans font-bold"> / เดือน</span>
          </p>
        </div>

        <ul className="space-y-2 mt-4">
          {HIGHLIGHTS.map((f) => (
            <li key={f} className="flex items-start gap-1.5 text-[11px] text-brand-text dark:text-neutral-200 leading-relaxed">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onUpgrade}
          className="mt-5 w-full py-3 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-[0_8px_20px_-6px_rgba(230,95,43,0.5)] transition-colors rounded-2xl text-xs font-black cursor-pointer"
        >
          สมัครแพ็กเกจโปร ฿149/เดือน
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-2 text-brand-muted hover:text-brand-text text-[11px] font-bold transition-colors cursor-pointer"
        >
          ไว้คราวหน้า
        </button>
      </motion.div>
    </div>
  );
};

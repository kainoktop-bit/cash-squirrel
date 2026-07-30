import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mascot, MascotMood } from './Mascot';
import { IconClose } from './icons';
import { ChevronLeft, ChevronRight, X, Play, Milestone } from 'lucide-react';

export interface TourStep {
  title: string;
  description: string;
  mood: MascotMood;
  tab: string;
}

interface TourModalProps {
  tourStep: number | null;
  steps: TourStep[];
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export const TourModal: React.FC<TourModalProps> = ({
  tourStep,
  steps,
  onNext,
  onPrev,
  onSkip
}) => {
  if (tourStep === null) return null;

  const step = steps[tourStep];
  const isFirst = tourStep === 0;
  const isLast = tourStep === steps.length - 1;
  const progressPercent = ((tourStep) / (steps.length - 1)) * 100;

  // We want full-screen overlay ONLY for first and last steps
  const showBackdrop = isFirst || isLast;

  const cardContent = (
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 30 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: 30 }}
      transition={{ type: 'spring', damping: 22, stiffness: 200 }}
      className={`bg-brand-white dark:bg-stone-900 border-2 border-amber-500/30 dark:border-amber-500/20 rounded-3xl p-6 shadow-2xl ${
        showBackdrop 
          ? 'max-w-md w-full relative' 
          : 'w-full lg:max-w-[400px] relative'
      }`}
      id="onboarding-tour-card"
    >
      {/* Absolute mascot on top or side */}
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="shrink-0 bg-amber-500/5 dark:bg-amber-500/10 p-2.5 rounded-3xl border border-amber-500/10">
          <Mascot mood={step.mood} size={80} className="drop-shadow-md" />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {/* Progress Badge */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#E65F2B] bg-[#E65F2B]/10 px-2.5 py-0.5 rounded-full">
              {isFirst ? 'คำแนะนำแรกเริ่ม' : isLast ? 'ยินดีด้วยสำเร็จทัวร์!' : `ฟีเจอร์ที่ ${tourStep} / ${steps.length - 2}`}
            </span>
            {!isLast && (
              <button
                onClick={onSkip}
                className="text-[10px] font-bold text-brand-muted hover:text-rose-500 hover:underline transition-all cursor-pointer inline-flex items-center gap-0.5"
                title="ข้ามขั้นตอนแนะนำ"
              >
                ข้ามทัวร์ <IconClose className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          <h3 className="font-display font-black text-sm text-brand-text dark:text-amber-100 tracking-tight">
            {step.title}
          </h3>

          <p className="text-[11px] leading-relaxed text-brand-muted dark:text-stone-300 font-medium">
            {step.description}
          </p>
        </div>
      </div>

      {/* Progress Bar & Actions */}
      <div className="mt-6 pt-4 border-t border-brand-border/40 dark:border-neutral-800 space-y-4">
        {/* Progress bar */}
        {!isFirst && !isLast && (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[9px] font-mono font-bold text-brand-muted">
              <span>ความคืบหน้าการสำรวจ</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div className="w-full h-1.5 bg-brand-faint dark:bg-neutral-800 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-gradient-to-r from-[#E65F2B] to-[#FFA473] rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {/* Back Button */}
          {!isFirst ? (
            <button
              onClick={onPrev}
              className="px-3.5 py-2 hover:bg-brand-faint dark:hover:bg-neutral-800 text-brand-text border border-brand-border/60 dark:border-neutral-700 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>ย้อนกลับ</span>
            </button>
          ) : (
            <div />
          )}

          {/* Next / Action Button */}
          <button
            onClick={onNext}
            className="px-5 py-2.5 bg-gradient-to-r from-[#E65F2B] to-[#FFA473] text-white hover:opacity-95 shadow-md hover:shadow-lg transition-all rounded-xl text-[11px] font-black flex items-center gap-1 cursor-pointer"
          >
            {isFirst ? (
              <>
                <span>ไปทัวร์กันเลย!</span>
              </>
            ) : isLast ? (
              <>
                <span>เข้าสู่แดนสควีเรล</span>
              </>
            ) : (
              <>
                <span>เข้าใจแล้ว ถัดไป</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <AnimatePresence>
      {showBackdrop ? (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
          {cardContent}
        </div>
      ) : (
        <div className="fixed bottom-6 inset-x-4 lg:left-auto lg:right-6 lg:bottom-6 z-[2000] select-none flex justify-center lg:justify-end">
          {cardContent}
        </div>
      )}
    </AnimatePresence>
  );
};

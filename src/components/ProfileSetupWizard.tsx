import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Coins, Target, Check } from 'lucide-react';
import { Mascot } from './Mascot';
import { AppSettings, Goal } from '../types';
import { defaultSettings } from '../sampleData';

interface ProfileSetupWizardProps {
  isOpen: boolean;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onAddGoal: (goal: Omit<Goal, 'id'>) => void;
  onComplete: () => void;
}

const JOB_TYPE_OPTIONS = [
  { id: 'sponsor', label: 'รับงานสปอนเซอร์ / รีวิวคอนเทนต์', emoji: '🎥' },
  { id: 'freelance', label: 'รับงานฟรีแลนซ์ทั่วไป (ออกแบบ/เขียน/ตัดต่อ ฯลฯ)', emoji: '💻' },
  { id: 'consulting', label: 'รับงานที่ปรึกษา / สอนพิเศษ', emoji: '🎓' },
  { id: 'selling', label: 'ขายสินค้า / บริการส่วนตัว', emoji: '🛍️' },
  { id: 'other', label: 'อื่นๆ', emoji: '✏️' },
];

export const ProfileSetupWizard: React.FC<ProfileSetupWizardProps> = ({
  isOpen,
  settings,
  onUpdateSettings,
  onAddGoal,
  onComplete,
}) => {
  const [step, setStep] = useState(0);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [jobTypeOther, setJobTypeOther] = useState('');
  const [monthlyExpense, setMonthlyExpense] = useState(
    settings.monthlyExpense && settings.monthlyExpense !== defaultSettings.monthlyExpense
      ? String(settings.monthlyExpense)
      : ''
  );
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');

  if (!isOpen) return null;

  const totalSteps = 3;
  const progressPercent = ((step + 1) / totalSteps) * 100;

  const toggleJobType = (id: string) => {
    setJobTypes(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const expenseValue = parseFloat(monthlyExpense);
  const isExpenseValid = monthlyExpense.trim() !== '' && !isNaN(expenseValue) && expenseValue >= 0;

  const finishSetup = () => {
    onUpdateSettings({
      ...settings,
      monthlyExpense: isExpenseValid ? expenseValue : settings.monthlyExpense,
      profileJobTypes: jobTypes,
      profileJobTypeOther: jobTypeOther.trim() || undefined,
      profileSetupCompleted: true,
    });

    const targetValue = parseFloat(goalTarget);
    if (goalName.trim() && !isNaN(targetValue) && targetValue > 0) {
      onAddGoal({
        name: goalName.trim(),
        type: 'save',
        target: targetValue,
        current: 0,
        deadline: new Date().toISOString().split('T')[0],
        emoji: '🎯',
        bg: '#ECFDF5',
        acc: '#059669',
      });
    }

    onComplete();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 22, stiffness: 200 }}
          className="bg-brand-white dark:bg-stone-900 border-2 border-amber-500/30 dark:border-amber-500/20 rounded-3xl p-6 shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-3 mb-2">
            <div className="shrink-0 bg-amber-500/5 dark:bg-amber-500/10 p-2.5 rounded-3xl border border-amber-500/10">
              <Mascot mood="wave" size={72} className="drop-shadow-md" />
            </div>
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#E65F2B] bg-[#E65F2B]/10 px-2.5 py-0.5 rounded-full">
                ตั้งค่าบัญชีเริ่มต้น {step + 1} / {totalSteps}
              </span>
              <h3 className="font-display font-black text-sm text-brand-text dark:text-amber-100 tracking-tight">
                {step === 0 && 'คุณรับงานแบบไหนบ้าง?'}
                {step === 1 && 'ค่าใช้จ่ายคงที่ต่อเดือนของคุณ'}
                {step === 2 && 'อยากตั้งเป้าหมายเก็บเงินไว้เลยไหม?'}
              </h3>
              <p className="text-[11px] leading-relaxed text-brand-muted dark:text-stone-300 font-medium max-w-xs mx-auto">
                {step === 0 && 'เลือกได้มากกว่า 1 ข้อ ข้อมูลนี้ไว้ใช้ทำโปรไฟล์ของคุณเท่านั้น'}
                {step === 1 && 'จำเป็นต้องกรอกก่อนเริ่มใช้งาน ระบบจะใช้ยอดนี้คำนวณกำไรสุทธิและแจ้งเตือนให้คุณทุกเดือน'}
                {step === 2 && 'ไม่บังคับ ข้ามได้ถ้ายังไม่พร้อม ตั้งเพิ่มทีหลังได้ในหน้าจัดสรรเงิน'}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-brand-faint dark:bg-neutral-800 rounded-full overflow-hidden my-4">
            <motion.div
              className="h-full bg-gradient-to-r from-[#E65F2B] to-[#FFA473] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Step content */}
          <div className="space-y-2.5 min-h-[180px]">
            {step === 0 && (
              <div className="space-y-2">
                {JOB_TYPE_OPTIONS.map(opt => {
                  const selected = jobTypes.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleJobType(opt.id)}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border text-left text-xs font-bold transition-all cursor-pointer ${
                        selected
                          ? 'border-[#E65F2B] bg-[#FDF3EC] text-[#A63F1B] dark:bg-[#352115] dark:text-[#FFA473]'
                          : 'border-brand-border/60 text-brand-text hover:bg-brand-faint/60'
                      }`}
                    >
                      <span className="text-base shrink-0">{opt.emoji}</span>
                      <span className="flex-1">{opt.label}</span>
                      {selected && <Check className="w-4 h-4 text-[#E65F2B] shrink-0" />}
                    </button>
                  );
                })}
                {jobTypes.includes('other') && (
                  <input
                    type="text"
                    value={jobTypeOther}
                    onChange={(e) => setJobTypeOther(e.target.value)}
                    placeholder="ระบุประเภทงานของคุณ..."
                    className="w-full bg-brand-faint text-xs text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500"
                  />
                )}
              </div>
            )}

            {step === 1 && (
              <div className="flex items-center gap-3 bg-brand-faint/60 rounded-2xl p-4 border border-brand-border">
                <div className="w-10 h-10 rounded-xl bg-[#FAECE8] dark:bg-[#352115] flex items-center justify-center text-[#E65F2B] dark:text-[#FFA473] shrink-0">
                  <Coins className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-extrabold text-brand-muted uppercase block tracking-wider">
                    ค่าใช้จ่ายคงที่ต่อเดือน (฿)
                  </span>
                  <input
                    type="number"
                    min="0"
                    autoFocus
                    value={monthlyExpense}
                    onChange={(e) => setMonthlyExpense(e.target.value)}
                    placeholder="เช่น 12000"
                    className="w-full bg-transparent text-lg font-extrabold font-mono text-brand-text outline-none mt-0.5"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2.5 bg-brand-faint/60 rounded-2xl p-4 border border-brand-border">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-[10px] font-extrabold text-brand-muted uppercase tracking-wider">
                    เป้าหมายแรกของคุณ (ไม่บังคับ)
                  </span>
                </div>
                <input
                  type="text"
                  value={goalName}
                  onChange={(e) => setGoalName(e.target.value)}
                  placeholder="เช่น กล้องตัวใหม่, เงินสำรองฉุกเฉิน"
                  className="w-full bg-brand-white dark:bg-stone-800 text-xs text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500"
                />
                <input
                  type="number"
                  min="0"
                  value={goalTarget}
                  onChange={(e) => setGoalTarget(e.target.value)}
                  placeholder="ยอดเป้าหมาย (฿) เช่น 50000"
                  className="w-full bg-brand-white dark:bg-stone-800 text-xs font-mono text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 pt-4 border-t border-brand-border/40 dark:border-neutral-800 flex items-center justify-between gap-3">
            {step > 0 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-3.5 py-2 hover:bg-brand-faint dark:hover:bg-neutral-800 text-brand-text border border-brand-border/60 dark:border-neutral-700 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>ย้อนกลับ</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              {step !== 1 && (
                <button
                  onClick={() => step === totalSteps - 1 ? finishSetup() : setStep(s => s + 1)}
                  className="text-[10px] font-bold text-brand-muted hover:text-rose-500 hover:underline transition-all cursor-pointer"
                >
                  ข้าม
                </button>
              )}
              <button
                onClick={() => step === totalSteps - 1 ? finishSetup() : setStep(s => s + 1)}
                disabled={step === 1 && !isExpenseValid}
                className="px-5 py-2.5 bg-gradient-to-r from-[#E65F2B] to-[#FFA473] text-white hover:opacity-95 shadow-md hover:shadow-lg transition-all rounded-xl text-[11px] font-black flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <span>{step === totalSteps - 1 ? 'เริ่มใช้งานเลย!' : 'ถัดไป'}</span>
                {step !== totalSteps - 1 && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

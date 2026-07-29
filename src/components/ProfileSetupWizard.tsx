import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Target, Check } from 'lucide-react';
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

const STEP_TITLES = [
  'คุณรับงานแบบไหนบ้าง?',
  'ค่าใช้จ่ายคงที่ต่อเดือนของคุณ',
  'อยากตั้งเป้าหมายเก็บเงินไว้เลยไหม?',
];

const STEP_DESCRIPTIONS = [
  'เลือกได้มากกว่า 1 ข้อ ใช้ทำโปรไฟล์ของคุณเท่านั้น',
  'ระบบใช้ยอดนี้คำนวณกำไรสุทธิและแจ้งเตือนให้คุณทุกเดือน',
  'ไม่บังคับ ตั้งเพิ่มทีหลังได้ในหน้าจัดสรรเงิน',
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

  const goNext = () => step === totalSteps - 1 ? finishSetup() : setStep(s => s + 1);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm select-none">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
          className="bg-brand-white dark:bg-stone-900 rounded-3xl p-7 shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto no-scrollbar"
        >
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-4">
            <Mascot mood="wave" size={64} className="drop-shadow-sm" />

            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-6 bg-[#E65F2B]' : i < step ? 'w-1.5 bg-[#E65F2B]/50' : 'w-1.5 bg-brand-faint dark:bg-neutral-800'
                  }`}
                />
              ))}
            </div>

            <div className="space-y-1.5">
              <h3 className="font-display font-black text-lg text-brand-text dark:text-white tracking-tight">
                {STEP_TITLES[step]}
              </h3>
              <p className="text-xs leading-relaxed text-brand-muted max-w-xs mx-auto">
                {STEP_DESCRIPTIONS[step]}
              </p>
            </div>
          </div>

          {/* Step content */}
          <div className="mt-6 min-h-[190px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="step0"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2"
                >
                  {JOB_TYPE_OPTIONS.map(opt => {
                    const selected = jobTypes.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleJobType(opt.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border text-left text-xs font-bold transition-all cursor-pointer ${
                          selected
                            ? 'border-[#E65F2B] bg-[#FDF3EC] dark:bg-[#352115] text-brand-text'
                            : 'border-brand-border/60 text-brand-text hover:bg-brand-faint/60'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 transition-colors ${
                          selected ? 'bg-white dark:bg-stone-900' : 'bg-brand-faint dark:bg-neutral-800'
                        }`}>
                          {opt.emoji}
                        </span>
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
                      className="w-full bg-brand-faint text-xs text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-[#E65F2B]"
                    />
                  )}
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-3 bg-brand-faint/60 dark:bg-neutral-800/40 rounded-3xl p-6 border border-brand-border/60"
                >
                  <span className="text-[10px] font-extrabold text-brand-muted uppercase tracking-wider">
                    ค่าใช้จ่ายคงที่ต่อเดือน
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xl font-black text-brand-muted">฿</span>
                    <input
                      type="number"
                      min="0"
                      autoFocus
                      value={monthlyExpense}
                      onChange={(e) => setMonthlyExpense(e.target.value)}
                      placeholder="12000"
                      className="w-40 bg-transparent text-4xl font-black font-mono text-brand-text dark:text-white outline-none text-center placeholder-brand-border"
                    />
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2.5 bg-brand-faint/60 dark:bg-neutral-800/40 rounded-3xl p-5 border border-brand-border/60"
                >
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#E65F2B] shrink-0" />
                    <span className="text-[10px] font-extrabold text-brand-muted uppercase tracking-wider">
                      เป้าหมายแรกของคุณ (ไม่บังคับ)
                    </span>
                  </div>
                  <input
                    type="text"
                    value={goalName}
                    onChange={(e) => setGoalName(e.target.value)}
                    placeholder="เช่น กล้องตัวใหม่, เงินสำรองฉุกเฉิน"
                    className="w-full bg-brand-white dark:bg-stone-800 text-xs text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-[#E65F2B]"
                  />
                  <input
                    type="number"
                    min="0"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    placeholder="ยอดเป้าหมาย (฿) เช่น 50000"
                    className="w-full bg-brand-white dark:bg-stone-800 text-xs font-mono text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-[#E65F2B]"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Actions */}
          <div className="mt-6 pt-5 border-t border-brand-border/40 dark:border-neutral-800 flex items-center justify-between gap-3">
            {step > 0 ? (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-3.5 py-2.5 hover:bg-brand-faint dark:hover:bg-neutral-800 text-brand-text border border-brand-border/60 dark:border-neutral-700 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>ย้อนกลับ</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              {step !== 1 && (
                <button
                  onClick={goNext}
                  className="px-3.5 py-2.5 text-brand-muted hover:text-brand-text hover:bg-brand-faint dark:hover:bg-neutral-800 border border-transparent rounded-xl text-[11px] font-bold transition-all cursor-pointer"
                >
                  ข้าม
                </button>
              )}
              <button
                onClick={goNext}
                disabled={step === 1 && !isExpenseValid}
                className="px-6 py-2.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-sm hover:shadow-md transition-all rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
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

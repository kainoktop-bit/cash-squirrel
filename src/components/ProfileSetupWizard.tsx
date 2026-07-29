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
  /** True when reopened from Settings for a preview, rather than a real first-time signup. */
  isPreview?: boolean;
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
  isPreview = false,
}) => {
  const [step, setStep] = useState(0);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [jobTypeOther, setJobTypeOther] = useState('');
  const [monthlyExpense, setMonthlyExpense] = useState(
    isPreview || (settings.monthlyExpense && settings.monthlyExpense !== defaultSettings.monthlyExpense)
      ? String(settings.monthlyExpense || '')
      : ''
  );
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');

  // Always start from step 0 with a fresh money value whenever the wizard is (re)opened
  React.useEffect(() => {
    if (isOpen) {
      setStep(0);
      setMonthlyExpense(
        isPreview || (settings.monthlyExpense && settings.monthlyExpense !== defaultSettings.monthlyExpense)
          ? String(settings.monthlyExpense || '')
          : ''
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
          className="relative bg-brand-white dark:bg-stone-900 rounded-[28px] p-7 shadow-[0_24px_60px_-15px_rgba(166,63,27,0.25)] max-w-md w-full max-h-[90vh] overflow-y-auto no-scrollbar"
        >
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-[#E65F2B]/15 blur-2xl rounded-full scale-125" />
              <Mascot mood="wave" size={60} className="relative drop-shadow-sm" />
            </div>

            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ width: i === step ? 22 : 6 }}
                  transition={{ duration: 0.25 }}
                  className={`h-1.5 rounded-full ${
                    i === step ? 'bg-[#E65F2B]' : i < step ? 'bg-[#E65F2B]/40' : 'bg-brand-faint dark:bg-neutral-800'
                  }`}
                />
              ))}
            </div>

            <div className="space-y-1.5">
              <h3 className="font-display font-black text-lg text-brand-text dark:text-white tracking-tight">
                {STEP_TITLES[step]}
              </h3>
              <p className="text-xs leading-relaxed text-brand-muted max-w-[280px] mx-auto">
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
                      <motion.button
                        key={opt.id}
                        type="button"
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleJobType(opt.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl border text-left text-xs font-bold transition-all cursor-pointer ${
                          selected
                            ? 'border-[#E65F2B] bg-[#FDF3EC] dark:bg-[#352115] text-brand-text shadow-sm'
                            : 'border-brand-border/50 text-brand-text hover:border-brand-border hover:bg-brand-faint/50'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-base shrink-0 transition-colors ${
                          selected ? 'bg-white dark:bg-stone-900' : 'bg-brand-faint dark:bg-neutral-800'
                        }`}>
                          {opt.emoji}
                        </span>
                        <span className="flex-1">{opt.label}</span>
                        <div className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                          selected ? 'bg-[#E65F2B] border-[#E65F2B]' : 'border-brand-border/60'
                        }`}>
                          {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                      </motion.button>
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
                  className="relative flex flex-col items-center gap-1 bg-gradient-to-b from-[#FDF3EC] to-brand-faint/40 dark:from-[#2A1810] dark:to-neutral-800/40 rounded-[24px] p-7 overflow-hidden"
                >
                  <span className="text-[10px] font-extrabold text-brand-muted uppercase tracking-wider">
                    ค่าใช้จ่ายคงที่ต่อเดือน
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-2xl font-black text-[#E65F2B]/70">฿</span>
                    <input
                      type="number"
                      min="0"
                      autoFocus
                      value={monthlyExpense}
                      onChange={(e) => setMonthlyExpense(e.target.value)}
                      placeholder="12000"
                      className="w-40 bg-transparent text-5xl font-black font-mono text-brand-text dark:text-white outline-none text-center placeholder-brand-border"
                    />
                  </div>
                  <p className="text-[10px] text-brand-muted mt-2">ไม่มีค่าใช้จ่ายคงที่? พิมพ์ 0 ได้เลย</p>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2.5 bg-brand-faint/50 dark:bg-neutral-800/40 rounded-[24px] p-5"
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
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setStep(s => s - 1)}
                className="px-3.5 py-2.5 hover:bg-brand-faint dark:hover:bg-neutral-800 text-brand-text border border-brand-border/60 dark:border-neutral-700 rounded-xl text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>ย้อนกลับ</span>
              </motion.button>
            ) : <div />}

            <div className="flex items-center gap-2">
              {step !== 1 && (
                <button
                  onClick={goNext}
                  className="px-3.5 py-2.5 text-brand-muted hover:text-brand-text hover:bg-brand-faint dark:hover:bg-neutral-800 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                >
                  ข้าม
                </button>
              )}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={goNext}
                disabled={step === 1 && !isExpenseValid}
                className="px-6 py-2.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white shadow-[0_8px_20px_-6px_rgba(230,95,43,0.5)] transition-colors rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <span>{step === totalSteps - 1 ? 'เริ่มใช้งานเลย!' : 'ถัดไป'}</span>
                {step !== totalSteps - 1 && <ChevronRight className="w-3.5 h-3.5" />}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

import React, { useState, useMemo, useEffect } from 'react';
import { Job, Goal, AppSettings, GoalTransaction } from '../types';
import { formatCurrency, getMonthKey } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PiggyBank, 
  TrendingUp, 
  Coins, 
  Layers, 
  TrendingDown,
  ArrowRight,
  ShieldCheck,
  Zap,
  Plus,
  Trash2,
  Calendar,
  Settings,
  DollarSign,
  Download,
  Upload,
  RefreshCcw,
  Award,
  CircleAlert,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  PlusCircle,
  MinusCircle,
  History,
  Search,
  FileText,
  Tag
} from 'lucide-react';
import { Mascot } from './Mascot';
import {
  IconTarget,
  IconWarning,
  IconAlertDot,
  IconGem,
  IconCoin,
  IconCoinOut,
  IconCheck,
  IconBolt,
  IconRocket,
  IconLoop,
  IconPencil,
  IconPalette,
  IconGraduation,
  IconGift,
  IconCamera,
  IconTool,
  IconBarChart,
  IconClear,
  IconScale,
  IconDot,
} from './icons';

interface SplitTabProps {
  jobs: Job[];
  goals: Goal[];
  settings: AppSettings;
  onAddGoal: (goal: Omit<Goal, 'id'>) => void;
  onDeleteGoal: (id: string) => void;
  onUpdateGoalProgress: (id: string, amount: number, reason?: string, date?: string, deductFromCash?: boolean) => void;
  onDeleteGoalTransaction?: (goalId: string, txId: string, revertBalance?: boolean) => void;
  onTransferBetweenGoals: (fromGoalId: string, toGoalId: string, amount: number, reason?: string, date?: string) => void;
  onUpdateGoal: (id: string, updatedFields: Partial<Goal>) => void;
  onAllocateSavingsToGoal: (goalId: string, amount: number) => void;
  onAllocateMultipleSavings: (allocations: Record<string, number>, settingsUpdate?: Partial<AppSettings>) => void;
  onUpdateSettings: (settings: AppSettings) => void;
  onSwitchTab: (tabId: string) => void;
  onImportData: (data: string) => void;
  onExportData: () => void;
  onClearAllData: () => void;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
  triggerPrompt: (
    title: string,
    message: string,
    defaultValue: string,
    placeholder: string,
    inputType: 'text' | 'number',
    onConfirm: (val: string) => void,
    onCancel?: () => void
  ) => void;
  initialSelectedGoalId?: string | null;
  onClearInitialGoalId?: () => void;
  selectedMonthKey: string;
}

export default function SplitTab({
  jobs,
  goals,
  settings,
  onAddGoal,
  onDeleteGoal,
  onUpdateGoalProgress,
  onDeleteGoalTransaction,
  onTransferBetweenGoals,
  onUpdateGoal,
  onAllocateSavingsToGoal,
  onAllocateMultipleSavings,
  onUpdateSettings,
  onSwitchTab,
  onImportData,
  onExportData,
  onClearAllData,
  triggerAlert,
  triggerConfirm,
  triggerPrompt,
  initialSelectedGoalId,
  onClearInitialGoalId,
  selectedMonthKey,
}: SplitTabProps) {
  const currentMonthKey = selectedMonthKey;

  // 1. Calculate Received This Month (Confirmed Income)
  const receivedThisMonth = jobs
    .filter(j => getMonthKey(j.payDate || j.postDate) === currentMonthKey)
    .reduce((sum, j) => sum + j.received, 0);

  // 2. Net Profit calculation (Received - Expenses)
  const rawNetProfit = Math.max(0, receivedThisMonth - settings.monthlyExpense);
  const alreadyAllocatedThisMonth = settings.allocatedMonths?.[currentMonthKey] || 0;
  const netProfit = Math.max(0, rawNetProfit - alreadyAllocatedThisMonth);

  // 3. Split calculations based on individual goal's allocatedPercentage
  const expPercent = Math.min(100, (settings.monthlyExpense / Math.max(1, receivedThisMonth)) * 100);
  const profitPercent = Math.max(0, 100 - expPercent);

  const totalAllocatedPct = goals.reduce((sum, g) => sum + (g.allocatedPercentage || 0), 0);

  // Calculate segment breakdown for visual representation based on rawNetProfit (planned target quota)
  const goalSegments = goals.map(g => {
    const pct = g.allocatedPercentage || 0;
    const amt = Math.min(g.target - g.current, Math.floor(rawNetProfit * (pct / 100)));
    const pctOfTotal = receivedThisMonth > 0 ? (amt / receivedThisMonth) * 100 : 0;
    return {
      id: g.id,
      name: g.name,
      color: g.acc,
      pctOfTotal,
      amt,
    };
  }).filter(s => s.pctOfTotal > 0);

  const totalSegmentPct = goalSegments.reduce((sum, s) => sum + s.pctOfTotal, 0);
  const remainingProfitPct = Math.max(0, (rawNetProfit / Math.max(1, receivedThisMonth)) * 100 - (totalSegmentPct));

  // 5. Breakeven revenue calculations
  // To cover both expenses and reach the monthly revenue goal
  const revenueProgressPct = Math.min(100, (receivedThisMonth / settings.monthlyRevenueGoal) * 100);

  // State for dynamic profit allocation values
  const [customAllocations, setCustomAllocations] = useState<Record<string, number>>({});
  const [showDangerZone, setShowDangerZone] = useState(false);

  // Initialize custom allocations map to automatically calculated amounts based on each goal's custom percentage quota!
  useEffect(() => {
    const initial: Record<string, number> = {};
    goals.forEach(g => {
      const pct = g.allocatedPercentage || 0;
      const autoAmt = Math.min(g.target - g.current, Math.floor(netProfit * (pct / 100)));
      initial[g.id] = Math.max(0, autoAmt);
    });
    setCustomAllocations(initial);
  }, [goals, netProfit]);

  const totalCustomAllocated = useMemo(() => {
    return (Object.values(customAllocations) as number[]).reduce((sum, val) => sum + val, 0);
  }, [customAllocations]);

  const remainingNetProfit = Math.max(0, netProfit - totalCustomAllocated);

  const handleApplyPresetSplit = () => {
    // This is now "Auto Allocation based on custom goal percentages"
    const next: Record<string, number> = {};
    goals.forEach(g => {
      const pct = g.allocatedPercentage || 0;
      const autoAmt = Math.min(g.target - g.current, Math.floor(netProfit * (pct / 100)));
      next[g.id] = Math.max(0, autoAmt);
    });
    setCustomAllocations(next);
  };

  const handleApplyEqualSplit = () => {
    const next: Record<string, number> = {};
    if (goals.length === 0) return;
    const perGoal = Math.floor(netProfit / goals.length);
    goals.forEach(g => {
      next[g.id] = Math.min(g.target - g.current, perGoal);
    });
    setCustomAllocations(next);
  };

  const handleResetAllocations = () => {
    const next: Record<string, number> = {};
    goals.forEach(g => {
      next[g.id] = 0;
    });
    setCustomAllocations(next);
  };

  const handleConfirmAllocations = () => {
    let allocatedCount = 0;
    const currentAllocationsRecord: Record<string, number> = {};
    (Object.entries(customAllocations) as [string, number][]).forEach(([goalId, amount]) => {
      if (amount > 0) {
        currentAllocationsRecord[goalId] = amount;
        allocatedCount++;
      }
    });

    if (allocatedCount > 0) {
      // Calculate settings updates
      const updatedAllocatedMonths = { ...(settings.allocatedMonths || {}) };
      updatedAllocatedMonths[currentMonthKey] = (updatedAllocatedMonths[currentMonthKey] || 0) + totalCustomAllocated;

      onAllocateMultipleSavings(currentAllocationsRecord, {
        allocatedMonths: updatedAllocatedMonths
      });

      triggerAlert(
        'จัดสรรกำไรสุทธิสำเร็จ!',
        `ระบบได้ทำการตัดยอดเงินรวมจำนวน ${formatCurrency(totalCustomAllocated)} จากยอดกำไรสุทธิ และแอดออนกระจายเข้าสู่แต่ละเป้าหมายเรียบร้อยแล้ว`
      );
      handleResetAllocations();
    } else {
      triggerAlert('ไม่สามารถดำเนินการได้', 'กรุณาระบุยอดเงินสำหรับหยอดลงเป้าหมายอย่างน้อยหนึ่งเป้าหมาย');
    }
  };

  const handleQuickProportionalAllocation = () => {
    const accumulatedRemainder = settings.accumulatedRemainder || 0;
    const totalToSplit = netProfit + accumulatedRemainder;

    if (totalToSplit <= 0) {
      triggerAlert(
        'ไม่มีกำไรสุทธิคงเหลือ',
        'ยอดกำไรสุทธิคงเหลือสำหรับจัดสรร และเศษเงินคงเหลือสะสมของคุณในรอบเดือนนี้เป็น 0 บาท'
      );
      return;
    }

    const activeGoals = goals.filter(g => (g.allocatedPercentage || 0) > 0 && g.current < g.target);

    if (activeGoals.length === 0) {
      triggerAlert(
        'ระบุกำหนดสัดส่วนเปอร์เซ็นต์ก่อน',
        'กรุณาระบุสัดส่วนการโอนเข้าเป้าหมายอย่างน้อยหนึ่งเป้าหมาย (ที่ยังเก็บไม่ครบ) เพื่อจัดสรรอัตโนมัติ โดยแก้ไขสัดส่วนที่เป้าหมายนั้นด้านล่าง'
      );
      return;
    }

    let remainingToDistribute = totalToSplit;
    const allocations: Record<string, number> = {};
    goals.forEach(g => { allocations[g.id] = 0; });

    let changed = true;
    while (changed && remainingToDistribute > 0) {
      changed = false;
      const nonCappedActiveGoals = activeGoals.filter(g => {
        const currentAlloc = allocations[g.id] || 0;
        return (g.current + currentAlloc) < g.target;
      });

      if (nonCappedActiveGoals.length === 0) break;

      const activeTotalPct = nonCappedActiveGoals.reduce((sum, g) => sum + (g.allocatedPercentage || 0), 0);
      
      for (const g of nonCappedActiveGoals) {
        if (remainingToDistribute <= 0) break;
        const pct = g.allocatedPercentage || 0;
        const share = pct / activeTotalPct;
        const amountToGive = Math.min(
          g.target - (g.current + allocations[g.id]),
          Math.floor(remainingToDistribute * share)
        );
        if (amountToGive > 0) {
          allocations[g.id] += amountToGive;
          remainingToDistribute -= amountToGive;
          changed = true;
        }
      }

      if (!changed && remainingToDistribute > 0) {
        for (const g of nonCappedActiveGoals) {
          if (remainingToDistribute <= 0) break;
          allocations[g.id] += 1;
          remainingToDistribute -= 1;
          changed = true;
        }
      }
    }

    const finalRemainder = remainingToDistribute;
    const totalAllocatedToGoals = totalToSplit - finalRemainder;

    if (totalAllocatedToGoals <= 0) {
      triggerAlert(
        'เป้าหมายการเงินของคุณเต็มหมดแล้ว!',
        'ยอดสะสมปัจจุบันของเป้าหมายที่เลือกเต็มขีดจำกัดแล้ว ทำให้ไม่สามารถจัดสรรเพิ่มได้'
      );
      return;
    }

    const allocationsListText = activeGoals
      .filter(g => allocations[g.id] > 0)
      .map(g => `• ${g.emoji || '🎯'} ${g.name}: ${formatCurrency(allocations[g.id])} (สัดส่วน ${g.allocatedPercentage}%)`)
      .join('\n');

    const messageHtml = `คุณกำลังจะจัดสรรงบรวมทั้งหมด ${formatCurrency(totalToSplit)} (มาจาก กำไรสุทธิคงเหลือเดือนนี้: ${formatCurrency(netProfit)} และ เศษสะสมยกมา: ${formatCurrency(accumulatedRemainder)})\n\nโดยเงินจะถูกหักตัดยอด และแบ่งเข้าเป้าหมายต่างๆ ทันทีดังนี้:\n${allocationsListText}\n\n** ยอดคงเหลือนำไปจัดสรรรอบเดือนนี้จะเป็น 0 บาท\n** เศษคงเหลือจากการหารไม่ลงตัวจำนวน ${formatCurrency(finalRemainder)} จะสะสมไว้เพื่อจัดสรรต่อรอบหน้า\n\nยืนยันเพื่อทำการตัดยอดเงินทันทีหรือไม่?`;

    triggerConfirm(
      'ยืนยันจัดสุดด่วนตามสัดส่วน',
      messageHtml,
      () => {
        const updatedAllocatedMonths = { ...(settings.allocatedMonths || {}) };
        updatedAllocatedMonths[currentMonthKey] = (updatedAllocatedMonths[currentMonthKey] || 0) + netProfit;

        onAllocateMultipleSavings(allocations, {
          allocatedMonths: updatedAllocatedMonths,
          accumulatedRemainder: finalRemainder
        });

        triggerAlert(
          'ตัดยอดเงินและจัดสรรสำเร็จ!',
          `โอนเงินรวม ${formatCurrency(totalAllocatedToGoals)} เข้าสู่เป้าหมายเรียบร้อยแล้ว โดยมียอดเศษเหลือสะสมเก็บยกยอดไปสะสมต่อที่ ${formatCurrency(finalRemainder)}`
        );
      }
    );
  };

  const handleAllocateRemainderToAnyGoal = () => {
    const remainder = settings.accumulatedRemainder || 0;
    if (remainder <= 0) return;

    const nonFullGoals = goals.filter(g => g.current < g.target);
    if (nonFullGoals.length === 0) {
      triggerAlert('ข้อผิดพลาด', 'เป้าหมายทั้งหมดของคุณเต็มแล้ว ไม่สามารถหยอดเศษออมเพิ่มได้');
      return;
    }

    const optionsText = nonFullGoals
      .map((g, idx) => `${idx + 1}. ${g.name} (ขาดอีก ${formatCurrency(g.target - g.current)})`)
      .join('\n');

    triggerPrompt(
      `หยอดเศษออมสะสมจำนวน ${formatCurrency(remainder)}`,
      `กรุณาพิมพ์หมายเลขลำดับเป้าหมายที่ต้องการหยอดเศษออมนี้เข้าไปทั้งหมด:\n\n${optionsText}`,
      '1',
      'พิมพ์ตัวเลขลำดับ (เช่น 1)',
      'number',
      (val) => {
        const idx = parseInt(val) - 1;
        if (isNaN(idx) || idx < 0 || idx >= nonFullGoals.length) {
          triggerAlert('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุตัวเลขลำดับที่ถูกต้องตามรายการ');
          return;
        }

        const selected = nonFullGoals[idx];
        const nextAllocations = { [selected.id]: remainder };

        onAllocateMultipleSavings(nextAllocations, {
          accumulatedRemainder: 0
        });

        triggerAlert(
          'ฝากเศษออมสำเร็จ!',
          `ได้โอนย้ายเศษเงินคงเหลือสะสมจำนวน ${formatCurrency(remainder)} เข้าสู่เป้าหมาย "${selected.name}" เรียบร้อยแล้ว`
        );
      }
    );
  };

  // Add Goal local form states (for local Add Goal sheet)
  const [isAddGoalLocalOpen, setIsAddGoalLocalOpen] = useState(false);
  const [isEditGoalLocalOpen, setIsEditGoalLocalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'save' | 'invest' | 'emergency' | 'buy'>('save');
  const [formTarget, setFormTarget] = useState('');
  const [formCurrent, setFormCurrent] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formEmoji, setFormEmoji] = useState('🎯');
  const [formBg, setFormBg] = useState('#ECFDF5');
  const [formAcc, setFormAcc] = useState('#059669');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formAllocatedPercentage, setFormAllocatedPercentage] = useState('0');

  // Selected goal detail modal local state
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  // Goal transaction modal state
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txGoal, setTxGoal] = useState<Goal | null>(null);
  const [txType, setTxType] = useState<'deposit' | 'withdraw'>('deposit');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txReason, setTxReason] = useState('');
  const [txDeductFromCash, setTxDeductFromCash] = useState(false);

  // History list filter state inside goal detail modal
  const [historyFilter, setHistoryFilter] = useState<'all' | 'deposit' | 'withdraw'>('all');

  // Transfer-between-goals modal state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferFromGoal, setTransferFromGoal] = useState<Goal | null>(null);
  const [transferToGoalId, setTransferToGoalId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferReason, setTransferReason] = useState('');

  // Keep selectedGoal in sync with goals state updates
  useEffect(() => {
    if (selectedGoal) {
      const updated = goals.find(x => x.id === selectedGoal.id);
      if (updated) {
        setSelectedGoal(updated);
      }
    }
  }, [goals]);

  const openTxModal = (goal: Goal, type: 'deposit' | 'withdraw') => {
    setTxGoal(goal);
    setTxType(type);
    setTxAmount('');
    setTxDate(new Date().toISOString().split('T')[0]);
    setTxReason('');
    setTxDeductFromCash(false);
    setIsTxModalOpen(true);
  };

  const handleTxSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txGoal) return;
    const amount = parseFloat(txAmount) || 0;
    if (amount <= 0) {
      triggerAlert('กรุณาระบุจำนวนเงิน', 'จำนวนเงินต้องมากกว่า 0 บาทครับ');
      return;
    }

    const signedAmount = txType === 'deposit' ? amount : -amount;
    const defaultReason = txType === 'deposit' ? 'ฝากเงินออมเพิ่ม' : 'ดึงเงินออก / หักค่าใช้จ่าย';
    const finalReason = txReason.trim() || defaultReason;

    onUpdateGoalProgress(txGoal.id, signedAmount, finalReason, txDate, txType === 'deposit' && txDeductFromCash);
    setIsTxModalOpen(false);

    triggerAlert(
      'บันทึกประวัติสำเร็จ!',
      `บันทึกรายการ${txType === 'deposit' ? 'โอนเงินเข้า' : 'ดึงเงินออก'} จำนวน ${formatCurrency(amount)} (${finalReason}) เรียบร้อยแล้ว`
    );
  };

  const openTransferModal = (goal: Goal) => {
    const firstOtherGoal = goals.find(g => g.id !== goal.id);
    setTransferFromGoal(goal);
    setTransferToGoalId(firstOtherGoal?.id || '');
    setTransferAmount('');
    setTransferDate(new Date().toISOString().split('T')[0]);
    setTransferReason('');
    setIsTransferModalOpen(true);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromGoal) return;

    if (!transferToGoalId) {
      triggerAlert('กรุณาเลือกเป้าหมายปลายทาง', 'กรุณาเลือกเป้าหมายที่ต้องการโอนเงินเข้าไป');
      return;
    }

    const toGoal = goals.find(g => g.id === transferToGoalId);
    if (!toGoal) return;

    const amount = parseFloat(transferAmount) || 0;
    if (amount <= 0) {
      triggerAlert('กรุณาระบุจำนวนเงิน', 'จำนวนเงินต้องมากกว่า 0 บาทครับ');
      return;
    }

    if (amount > transferFromGoal.current) {
      triggerAlert(
        'ยอดเงินคงเหลือไม่พอ',
        `เป้าหมาย "${transferFromGoal.name}" มียอดคงเหลือ ${formatCurrency(transferFromGoal.current)} เท่านั้น ไม่สามารถโอนย้าย ${formatCurrency(amount)} ได้`
      );
      return;
    }

    onTransferBetweenGoals(transferFromGoal.id, toGoal.id, amount, transferReason.trim() || undefined, transferDate);
    setIsTransferModalOpen(false);
  };

  useEffect(() => {
    if (initialSelectedGoalId === 'ADD_NEW_GOAL') {
      setIsAddGoalLocalOpen(true);
      if (onClearInitialGoalId) {
        onClearInitialGoalId();
      }
    } else if (initialSelectedGoalId && goals.length > 0) {
      const g = goals.find(x => x.id === initialSelectedGoalId);
      if (g) {
        setSelectedGoal(g);
      }
      if (onClearInitialGoalId) {
        onClearInitialGoalId();
      }
    }
  }, [initialSelectedGoalId, goals, onClearInitialGoalId]);

  const openEditGoalForm = (g: Goal) => {
    setFormName(g.name);
    setFormType(g.type);
    setFormTarget(String(g.target));
    setFormCurrent(String(g.current));
    setFormDeadline(g.deadline || '');
    setFormEmoji(g.emoji || '🎯');
    setFormBg(g.bg || '#ECFDF5');
    setFormAcc(g.acc || '#059669');
    setFormImageUrl(g.imageUrl || '');
    setFormAllocatedPercentage(String(g.allocatedPercentage || 0));
    setIsEditGoalLocalOpen(true);
  };

  const handleEditGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal || !formName.trim()) return;

    const updatedFields = {
      name: formName,
      type: formType,
      target: parseFloat(formTarget) || 0,
      current: parseFloat(formCurrent) || 0,
      deadline: formDeadline || undefined,
      emoji: formEmoji,
      bg: formBg,
      acc: formAcc,
      imageUrl: formImageUrl.trim() || undefined,
      allocatedPercentage: parseFloat(formAllocatedPercentage) || 0,
    };

    onUpdateGoal(selectedGoal.id, updatedFields);
    setSelectedGoal({
      ...selectedGoal,
      ...updatedFields,
    });

    setIsEditGoalLocalOpen(false);
    triggerAlert('สำเร็จ', 'อัปเดตข้อมูลเป้าหมายเรียบร้อยแล้ว!');
  };

  // Preset arrays for targets
  const emojiPresets = ['🎯', '📷', '💻', '✈️', '🏕️', '🚨', '🐷', '📈', '🎸', '🏠', '🎓', '💍', '🚗', '💰'];
  const colorPresets = [
    { bg: '#ECFDF5', acc: '#059669', name: 'Emerald' },
    { bg: '#EFF6FF', acc: '#2563EB', name: 'Blue' },
    { bg: '#FEF2F2', acc: '#DC2626', name: 'Rose' },
    { bg: '#FFFBEB', acc: '#D97706', name: 'Amber' },
    { bg: '#FAF5FF', acc: '#7C3AED', name: 'Purple' },
    { bg: '#F5F5F4', acc: '#57534E', name: 'Stone' },
  ];

  const handleAddGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    onAddGoal({
      name: formName,
      type: formType,
      target: parseFloat(formTarget) || 0,
      current: parseFloat(formCurrent) || 0,
      deadline: formDeadline || new Date().toISOString().split('T')[0],
      emoji: formEmoji,
      bg: formBg,
      acc: formAcc,
      imageUrl: formImageUrl.trim() || undefined,
      allocatedPercentage: parseFloat(formAllocatedPercentage) || 0,
    });

    // Reset Form
    setFormName('');
    setFormTarget('');
    setFormCurrent('');
    setFormDeadline('');
    setFormEmoji('🎯');
    setFormBg('#ECFDF5');
    setFormAcc('#059669');
    setFormImageUrl('');
    setFormAllocatedPercentage('0');
    setIsAddGoalLocalOpen(false);

    triggerAlert('สำเร็จ', 'สร้างเป้าหมายทางการเงินใหม่และบันทึกลงระบบเรียบร้อยแล้ว!');
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>, isForExistingGoal: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      triggerAlert('ข้อผิดพลาด', 'กรุณาเลือกไฟล์รูปภาพเท่านั้น (png, jpg, jpeg, webp)');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      triggerAlert('ไฟล์ขนาดใหญ่เกินไป', 'กรุณาเลือกรูปภาพขนาดไม่เกิน 3MB เพื่อประสิทธิภาพระบบ');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const base64String = evt.target?.result as string;
      if (base64String) {
        if (isForExistingGoal && selectedGoal) {
          onUpdateGoal(selectedGoal.id, { imageUrl: base64String });
          setSelectedGoal(prev => prev ? { ...prev, imageUrl: base64String } : null);
          triggerAlert('อัปโหลดสำเร็จ', 'อัปเดตรูปภาพเป้าหมายจากแกลเลอรีของคุณแล้ว!');
        } else {
          setFormImageUrl(base64String);
          triggerAlert('เตรียมรูปภาพสำเร็จ', 'รูปภาพพร้อมใช้งานเป็นรูปเป้าหมายแล้ว!');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImportBackupUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        try {
          const str = evt.target.result as string;
          onImportData(str);
          triggerAlert('นำเข้าสำเร็จ', 'ดึงข้อมูลงานและเป้าหมายจากไฟล์สำรองเข้าสู่ระบบเรียบร้อยแล้ว!');
        } catch (err) {
          triggerAlert('เกิดข้อผิดพลาด', 'รูปแบบไฟล์สำรองไม่ถูกต้อง กรุณาเลือกไฟล์ .json ที่ถูกต้อง');
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <span className="text-xs font-semibold tracking-wider text-brand-muted uppercase inline-flex items-center gap-1">
            ระบบจัดสรรเงินออมและเป้าหมายการเงิน
          </span>
          <h2 className="text-3xl font-bold font-display text-brand-text tracking-tight mt-0.5">
            จัดสรรเงิน & เป้าหมายออม
          </h2>
        </div>
        <Mascot mood="wave" size={64} className="shrink-0" />
      </div>

      {/* Section 1: Interactive Pie/Bar Split representation */}
      <div className="bg-brand-white border border-brand-border rounded-[var(--radius-xl)] p-5 space-y-6 shadow-xs">
        <div>
          <h4 className="text-xs font-bold tracking-wider text-brand-muted uppercase inline-flex items-center gap-1">
            สัดส่วนการแบ่งกระแสเงินสดเดือนนี้ <IconBarChart className="w-3 h-3" />
          </h4>
          
          {/* Multi-colored horizontal stacked bar representing all configured goal quotas */}
          <div className="w-full h-4 bg-brand-faint rounded-full flex overflow-hidden mt-3 shadow-inner">
            {receivedThisMonth > 0 ? (
              <>
                <div 
                  className="bg-rose-500 h-full transition-all duration-500" 
                  style={{ width: `${expPercent}%` }} 
                  title={`ค่าใช้จ่ายคงที่: ${expPercent.toFixed(0)}%`}
                />
                {goalSegments.map(seg => (
                  <div 
                    key={seg.id}
                    className="h-full transition-all duration-500" 
                    style={{ width: `${seg.pctOfTotal}%`, backgroundColor: seg.color }}
                    title={`${seg.name}: ${seg.pctOfTotal.toFixed(0)}%`}
                  />
                ))}
                {remainingProfitPct > 0 && (
                  <div 
                    className="bg-amber-500/25 h-full transition-all duration-500" 
                    style={{ width: `${remainingProfitPct}%` }}
                    title={`กำไรสุทธิส่วนที่ยังไม่ได้จัดสรร: ${remainingProfitPct.toFixed(0)}%`}
                  />
                )}
              </>
            ) : (
              <div className="w-full bg-brand-border text-center text-[10px] text-brand-muted flex items-center justify-center font-semibold">
                ไม่มีรายรับเพื่อคำนวณสัดส่วน
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-[10px] font-bold uppercase tracking-wider">
            <div className="flex items-center gap-1.5 text-rose-500">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>ค่าใช้จ่ายคงที่ ({expPercent.toFixed(0)}%)</span>
            </div>
            {goalSegments.map(seg => (
              <div key={seg.id} className="flex items-center gap-1.5" style={{ color: seg.color }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                <span>{seg.name} ({seg.pctOfTotal.toFixed(0)}%)</span>
              </div>
            ))}
            {remainingProfitPct > 0 && (
              <div className="flex items-center gap-1.5 text-amber-600">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
                <span>กำไรสุทธิคงเหลือ ({remainingProfitPct.toFixed(0)}%)</span>
              </div>
            )}
          </div>
        </div>

        {/* Detailed Breakdown list */}
        <div className="divide-y divide-brand-faint border-t border-brand-faint pt-2">
          {/* 1. Monthly revenue */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-brand-text">รับเงินสดเข้าแล้วเดือนนี้</span>
            </div>
            <span className="text-sm font-extrabold font-mono text-brand-text">
              {formatCurrency(receivedThisMonth)}
            </span>
          </div>

          {/* 2. Expenses deduction */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              <span className="text-xs font-bold text-brand-text">หัก ค่าใช้จ่ายรายเดือนคงที่</span>
            </div>
            <span className="text-sm font-extrabold font-mono text-rose-500">
              - {formatCurrency(settings.monthlyExpense)}
            </span>
          </div>

          {/* 3. Net profit - HIGHLY PROMINENT */}
          <div className="flex flex-col items-center justify-center p-5 bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 rounded-xl my-4 text-center">
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="text-xs font-black uppercase tracking-wider">กำไรสุทธิคงเหลือเพื่อจัดสรร</span>
            </div>
            <div className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
              {formatCurrency(netProfit)}
            </div>
          </div>

          {/* Custom Goals Quota Summary Section */}
          <div className="pt-4 space-y-4">
            <div className="bg-neutral-50 dark:bg-neutral-800/40 border border-brand-border rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-brand-faint pb-2">
                <span className="text-xs font-bold text-brand-text inline-flex items-center gap-1">สรุปโควตาเป้าหมายออมรายเดือน <IconTarget className="w-3 h-3" /></span>
                <span className={`text-xs font-mono font-black py-0.5 px-2 rounded-full ${
                  totalAllocatedPct > 100 
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' 
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                }`}>
                  โควตารวมทั้งหมด: {totalAllocatedPct}%
                </span>
              </div>

              {totalAllocatedPct > 100 && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] text-rose-700 dark:text-rose-400 font-bold leading-relaxed flex items-start gap-1.5">
                  <IconWarning className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>แจ้งเตือน: สัดส่วนเปอร์เซ็นต์รวมของเป้าหมายการเงินทั้งหมดของคุณเกิน 100% (รวม {totalAllocatedPct}%) กรุณาลดเปอร์เซ็นต์บางเป้าหมายลงเพื่อป้องกันเงินเก็บเกินยอดกำไรสุทธิ!</span>
                </div>
              )}

              <div className="space-y-2">
                {goals.map(g => {
                  const pct = g.allocatedPercentage || 0;
                  const amt = Math.floor(netProfit * (pct / 100));
                  return (
                    <div key={g.id} className="flex items-center justify-between text-xs py-1">
                      <div className="flex items-center gap-2">
                        {g.imageUrl ? (
                          <img
                            src={g.imageUrl}
                            alt={g.name}
                            referrerPolicy="no-referrer"
                            className="w-5 h-5 rounded-md object-cover shrink-0"
                          />
                        ) : (
                          <span className="text-sm shrink-0">{g.emoji}</span>
                        )}
                        <span className="font-semibold text-brand-text truncate max-w-[140px]">{g.name}</span>
                        <span className="text-[9px] font-black font-mono text-brand-muted shrink-0">({pct}%)</span>
                      </div>
                      <span className="font-bold font-mono text-brand-text">{formatCurrency(amt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Dynamic Profit Allocation Manager */}
      <div className="bg-brand-white border border-brand-border rounded-[var(--radius-xl)] p-5 space-y-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
            <h4 className="text-sm font-black tracking-widest text-brand-text dark:text-white uppercase">
              เครื่องมือจัดสรรกำไรสุทธิแบบยืดหยุ่น
            </h4>
          </div>
          <p className="text-[10px] text-brand-muted mt-1 leading-relaxed">
            ในวันที่คุณมีผลกำไรสุทธิ คุณสามารถใช้ระบบจัดสรรนี้เพื่อสไลด์แบ่งเงินหรือพิมพ์จำนวนเพื่อแอดออนเงินเข้าแต่ละเป้าหมายได้โดยตรงตามต้องการ โดยเงินจะทำการหักและตัดยอดจากกำไรสุทธิโดยอัตโนมัติ
          </p>
        </div>

        {(netProfit > 0 || (settings.accumulatedRemainder || 0) > 0) ? (
          <div className="space-y-6">
            {/* 4 Allocation Info Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-brand-faint border border-brand-border/60 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-brand-muted uppercase">กำไรคงเหลือเดือนนี้</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg font-black font-mono text-emerald-600">{formatCurrency(netProfit)}</span>
                </div>
                <span className="text-[9px] text-brand-muted mt-0.5">กำไรเต็ม: {formatCurrency(rawNetProfit)}</span>
              </div>
              <div className="bg-brand-faint border border-brand-border/60 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-brand-muted uppercase">เศษเงินคงเหลือสะสม</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg font-black font-mono text-indigo-600">{formatCurrency(settings.accumulatedRemainder || 0)}</span>
                  {(settings.accumulatedRemainder || 0) > 0 && (
                    <button
                      onClick={handleAllocateRemainderToAnyGoal}
                      className="text-[9px] font-extrabold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded cursor-pointer"
                      title="หยอดเศษเงินนี้เข้าเป้าหมาย"
                    >
                      หยอดเป้าหมาย
                    </button>
                  )}
                </div>
                <span className="text-[9px] text-brand-muted mt-0.5">เศษเงินหารไม่ลงตัวสะสม</span>
              </div>
              <div className="bg-brand-faint border border-brand-border/60 rounded-xl p-3 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-brand-muted uppercase">สไลเดอร์จัดสรรรวม</span>
                <span className="text-lg font-black font-mono text-purple-600 mt-1">{formatCurrency(totalCustomAllocated)}</span>
                <span className="text-[9px] text-brand-muted mt-0.5">ยอดออมสไลเดอร์ที่ตั้งไว้</span>
              </div>
              <div className={`border rounded-xl p-3 flex flex-col justify-between transition-all ${
                remainingNetProfit > 0 
                  ? 'bg-amber-500/5 border-amber-300 dark:border-amber-500/30' 
                  : 'bg-emerald-500/5 border-emerald-300 dark:border-emerald-500/30'
              }`}>
                <span className="text-[10px] font-bold text-brand-muted uppercase">คงเหลือสไลด์ต่อ</span>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-lg font-black font-mono ${remainingNetProfit > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {formatCurrency(remainingNetProfit)}
                  </span>
                  {remainingNetProfit === 0 && (
                    <span className="text-[9px] font-extrabold bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase inline-flex items-center gap-0.5">
                      ครบ <IconCheck className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-brand-muted mt-0.5">คงเหลือจัดสรรสไลเดอร์</span>
              </div>
            </div>

            {/* Presets Row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-brand-muted uppercase">สูตรจัดสรรด่วน:</span>
              
              <button
                onClick={handleQuickProportionalAllocation}
                className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-[10px] font-extrabold shadow-sm flex items-center gap-1 transition-all cursor-pointer"
                title="จัดสรรกำไรสุทธิคงเหลือ + เศษสะสม โอนเข้าเป้าหมายทันทีตามสัดส่วนที่กำหนด"
              >
                <Zap className="w-3 h-3 text-white" /> จัดสุดด่วนตามสัดส่วน (โอนทันที)
              </button>

              <button
                onClick={handleApplyPresetSplit}
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <IconTarget className="w-3 h-3" /> ตั้งสไลเดอร์ตามสัดส่วน
              </button>

              <button
                onClick={handleApplyEqualSplit}
                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 dark:bg-purple-500/10 dark:hover:bg-purple-500/25 text-purple-700 dark:text-purple-400 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <IconScale className="w-3 h-3" /> เฉลี่ยเท่ากันทุกเป้าหมาย
              </button>

              <button
                onClick={handleResetAllocations}
                className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-stone-700 dark:text-stone-300 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <IconClear className="w-3 h-3" /> ล้างสไลเดอร์ทั้งหมด
              </button>
            </div>

            {/* List of Goals with Custom Controls */}
            <div className="space-y-4 pt-2 border-t border-brand-faint">
              {goals.map(g => {
                const currentAllocated = customAllocations[g.id] || 0;
                const remainingToGoalLimit = g.target - g.current;
                const maxAllowedForThisGoal = Math.min(remainingToGoalLimit, remainingNetProfit + currentAllocated);
                // Stable ceiling for the slider track (doesn't shift when OTHER goals' sliders move),
                // so the fill position only changes when this goal's own value changes.
                const sliderTrackMax = Math.max(1, Math.min(remainingToGoalLimit, netProfit));
                const pctOfGoal = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;

                const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseFloat(e.target.value) || 0;
                  const allowed = Math.min(val, maxAllowedForThisGoal);
                  setCustomAllocations(prev => ({
                    ...prev,
                    [g.id]: Math.max(0, allowed)
                  }));
                };

                const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                  const val = parseFloat(e.target.value) || 0;
                  const allowed = Math.min(val, maxAllowedForThisGoal);
                  setCustomAllocations(prev => ({
                    ...prev,
                    [g.id]: Math.max(0, allowed)
                  }));
                };

                const handleAddAmount = (amt: number) => {
                  const nextVal = currentAllocated + amt;
                  const allowed = Math.min(nextVal, maxAllowedForThisGoal);
                  setCustomAllocations(prev => ({
                    ...prev,
                    [g.id]: Math.max(0, allowed)
                  }));
                };

                const handleSetMax = () => {
                  setCustomAllocations(prev => ({
                    ...prev,
                    [g.id]: Math.max(0, maxAllowedForThisGoal)
                  }));
                };

                return (
                  <div 
                    key={g.id}
                    className="p-4 bg-brand-faint/30 border border-brand-border/60 rounded-2xl space-y-3 transition-all hover:border-brand-border"
                  >
                    {/* Header line */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner overflow-hidden border border-brand-border/20 shrink-0"
                          style={{ backgroundColor: g.bg || 'var(--faint)' }}
                        >
                          {g.imageUrl ? (
                            <img src={g.imageUrl} alt={g.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          ) : (
                            g.emoji
                          )}
                        </div>
                        <div>
                          <h5 className="text-xs font-extrabold text-brand-text dark:text-white flex items-center gap-1.5">
                            <span>{g.name}</span>
                            <span 
                              className="text-[8px] font-black uppercase px-2 py-0.2 rounded-full border"
                              style={{ color: g.acc, borderColor: `${g.acc}40`, backgroundColor: `${g.acc}08` }}
                            >
                              {g.type === 'save' ? 'ออมเงิน' : g.type === 'invest' ? 'ลงทุน' : 'ทั่วไป'}
                            </span>
                          </h5>
                          <p className="text-[10px] text-brand-muted mt-0.5">
                            ความคืบหน้าสะสม: {formatCurrency(g.current)} / {formatCurrency(g.target)} ({pctOfGoal.toFixed(0)}%)
                          </p>
                        </div>
                      </div>

                      {/* Right-side value input box */}
                      <div className="flex items-center gap-1 bg-brand-white dark:bg-neutral-900 border border-brand-border dark:border-neutral-700 rounded-xl px-2.5 py-1.5 w-28 shrink-0">
                        <span className="text-[10px] font-extrabold text-brand-muted">฿</span>
                        <input
                           type="number"
                           min="0"
                           max={maxAllowedForThisGoal}
                           value={currentAllocated || ''}
                           onChange={handleInputChange}
                           className="w-full bg-transparent text-xs font-extrabold font-mono text-brand-text dark:text-neutral-100 outline-none text-right"
                           placeholder="0"
                        />
                      </div>
                    </div>

                    {/* Slider & Quick increments row */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max={sliderTrackMax}
                        value={currentAllocated}
                        onChange={handleSliderChange}
                        disabled={maxAllowedForThisGoal <= 0}
                        className="flex-1 accent-emerald-600 dark:accent-emerald-400 h-1 bg-brand-faint dark:bg-neutral-800 rounded-lg cursor-pointer disabled:opacity-30"
                      />

                      <div className="flex gap-1 shrink-0 justify-end">
                        <button
                          onClick={() => handleAddAmount(100)}
                          disabled={maxAllowedForThisGoal <= currentAllocated}
                          className="px-2 py-1 bg-brand-white border border-brand-border rounded-md text-[9px] font-black text-brand-text hover:bg-brand-faint transition-all disabled:opacity-40 cursor-pointer"
                        >
                          +100
                        </button>
                        <button
                          onClick={() => handleAddAmount(500)}
                          disabled={maxAllowedForThisGoal <= currentAllocated}
                          className="px-2 py-1 bg-brand-white border border-brand-border rounded-md text-[9px] font-black text-brand-text hover:bg-brand-faint transition-all disabled:opacity-40 cursor-pointer"
                        >
                          +500
                        </button>
                        <button
                          onClick={() => handleAddAmount(1000)}
                          disabled={maxAllowedForThisGoal <= currentAllocated}
                          className="px-2 py-1 bg-brand-white border border-brand-border rounded-md text-[9px] font-black text-brand-text hover:bg-brand-faint transition-all disabled:opacity-40 cursor-pointer"
                        >
                          +1k
                        </button>
                        <button
                          onClick={handleSetMax}
                          disabled={maxAllowedForThisGoal <= currentAllocated}
                          className="px-2.5 py-1 bg-emerald-500 text-white rounded-md text-[9px] font-black hover:bg-emerald-600 transition-all disabled:opacity-40 cursor-pointer"
                        >
                          MAX
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Confirm button */}
            <div className="pt-4">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleConfirmAllocations}
                disabled={totalCustomAllocated <= 0}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 disabled:bg-stone-300 dark:disabled:bg-stone-800 disabled:text-stone-500 dark:disabled:text-stone-600 disabled:shadow-none cursor-pointer"
              >
                <span>ยืนยันบันทึกจัดสรรกำไร & ตัดยอดเงิน ({formatCurrency(totalCustomAllocated)})</span>
                <IconRocket className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="p-6 bg-amber-500/5 border border-dashed border-amber-500/20 rounded-2xl text-center space-y-2">
            <IconWarning className="w-6 h-6 mx-auto text-amber-600 dark:text-amber-400" />
            <h5 className="text-xs font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
              เนื่องจากรอบเดือนนี้ไม่มีกำไรสุทธิคงเหลือให้สไลด์จัดสรร
            </h5>
            <p className="text-[10px] text-brand-muted max-w-md mx-auto leading-relaxed">
              ยอดรายรับสะสมที่ได้รับเข้าจริงยังไม่ครอบคลุมเกณฑ์รายจ่ายคงที่ของระบบหลัก หากต้องการหยอดเงินเก็บออมเพิ่มแบบแมนนวล คุณสามารถเลือกคลิกจัดการและหยอดเงินเพิ่มได้ที่รายการ "เป้าหมายเงินออม" ด้านล่างนี้ได้โดยตรง!
            </p>
          </div>
        )}
      </div>

      {/* Section 3: Savings Targets Cards Grid (Merged TargetTab) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-black text-brand-text dark:text-white uppercase tracking-wider">
              เป้าหมายเงินออมสะสม
            </h3>
          </div>
          <button
            onClick={() => setIsAddGoalLocalOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-3 rounded-xl text-[10px] font-black transition-all cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> สร้างเป้าหมายใหม่
          </button>
        </div>

        {goals.length === 0 ? (
          <div className="bg-brand-white border border-brand-border rounded-[var(--radius-xl)] p-12 text-center text-brand-muted flex flex-col items-center justify-center gap-3">
            <Mascot mood="sleepy" size={100} />
            <div>
              <p className="text-xs font-semibold text-brand-text">คุณยังไม่มีเป้าหมายการเงินในระบบ</p>
              <p className="text-[10px] mt-1">คลิกปุ่ม "สร้างเป้าหมายใหม่" ด้านบน เพื่อเริ่มเก็บเงินออมของตัวเอง</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {goals.map(g => {
              const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
              return (
                <motion.div
                  key={g.id}
                  whileHover={{ scale: 1.015 }}
                  onClick={() => setSelectedGoal(g)}
                  className="bg-brand-white border border-brand-border/80 hover:border-brand-border rounded-[var(--radius-xl)] p-4 cursor-pointer transition-all hover:shadow-md flex flex-col justify-between h-[160px] relative select-none"
                >
                  <div>
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 shadow-inner overflow-hidden border border-brand-border/20"
                      style={{ backgroundColor: g.bg }}
                    >
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt={g.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        g.emoji
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-brand-text truncate leading-tight">{g.name}</h4>
                    <div className="flex items-center justify-between gap-1 mt-1">
                      <p className="text-[9px] text-brand-muted font-bold uppercase tracking-wider">
                        {g.type === 'save' ? 'เก็บออม' : g.type === 'invest' ? 'ลงทุน' : g.type === 'emergency' ? 'สำรอง' : 'ทั่วไป'}
                      </p>
                      {g.allocatedPercentage !== undefined && g.allocatedPercentage > 0 && (
                        <span className="text-[8px] font-black bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded-md">
                          สัดส่วน {g.allocatedPercentage}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress and values */}
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between items-baseline text-[11px]">
                      <span className="font-extrabold font-mono text-brand-text">{formatCurrency(g.current)}</span>
                      <span className="text-[9px] text-brand-muted">/ {formatCurrency(g.target)}</span>
                    </div>

                    <div className="w-full h-1.5 bg-brand-faint rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: g.acc }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[8px] font-semibold">
                      <span style={{ color: g.acc }}>{pct.toFixed(0)}% สำเร็จ</span>
                      {g.deadline && (
                        <span className="text-brand-muted">
                          ดิว {new Date(g.deadline).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 4: Revenue target assessment card & Break-even analysis */}
      <div className="bg-brand-white border border-brand-border rounded-[var(--radius-xl)] p-5 space-y-4">
        <h4 className="text-xs font-bold tracking-widest text-brand-muted uppercase inline-flex items-center gap-1">
          วิเคราะห์จุดคุ้มทุน & แผนทำเงิน <IconCoin className="w-3 h-3" />
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-brand-faint rounded-xl p-3 border border-brand-border/40 space-y-1">
            <span className="text-[10px] text-brand-muted font-bold uppercase block">คุ้มค่าครองชีพ</span>
            <p className="text-base font-black font-mono text-rose-500">
              {formatCurrency(settings.monthlyExpense)}
            </p>
            <p className="text-[10px] text-brand-muted font-medium">ครอบคลุมค่าห้อง/ค่ากินรายเดือน</p>
          </div>

          <div className="bg-brand-faint rounded-xl p-3 border border-brand-border/40 space-y-1">
            <span className="text-[10px] text-brand-muted font-bold uppercase block">เป้าทำเงินให้อุ่นใจ</span>
            <p className="text-base font-black font-mono text-emerald-600">
              {formatCurrency(settings.monthlyRevenueGoal)}
            </p>
            <p className="text-[10px] text-brand-muted font-medium">มีออม & มีกินได้อย่างยั่งยืน</p>
          </div>
        </div>

        {/* Progress of revenue goal */}
        <div className="space-y-1 pt-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-brand-text">สัดส่วนเป้ารายรับที่หาได้แล้ว</span>
            <span className="text-emerald-600 font-bold">{revenueProgressPct.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-brand-faint rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${revenueProgressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Merged TargetTab Modal: Add Goal Bottom Sheet */}
      <AnimatePresence>
        {isAddGoalLocalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddGoalLocalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full sm:max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-5"
            >
              <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full mx-auto sm:hidden" />

              <div className="flex justify-between items-center border-b border-brand-faint pb-3">
                <h3 className="text-lg font-bold font-display text-brand-text dark:text-white">สร้างเป้าหมายทางการเงินใหม่</h3>
                <button onClick={() => setIsAddGoalLocalOpen(false)} className="text-2xl text-brand-muted hover:text-brand-text leading-none">&times;</button>
              </div>

              <form onSubmit={handleAddGoalSubmit} className="space-y-4 text-xs font-semibold">
                <div className="space-y-1.5">
                  <label className="text-brand-muted uppercase tracking-wider block">ชื่อเป้าหมาย</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น เงินสำรองเผื่อตกงาน / ดาวน์รถใหม่"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-brand-faint text-sm text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-brand-muted uppercase tracking-wider block">ประเภท</label>
                    <select
                      value={formType}
                      onChange={(e: any) => setFormType(e.target.value)}
                      className="w-full bg-brand-faint text-sm text-brand-text rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="save">บัญชีเก็บออมทั่วไป</option>
                      <option value="invest">บัญชีลงทุน / หุ้น</option>
                      <option value="emergency">เงินสำรองฉุกเฉิน</option>
                      <option value="buy">ซื้อของ / ท่องเที่ยว</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-brand-muted uppercase tracking-wider block">เดดไลน์กำหนดสะสม</label>
                    <input
                      type="date"
                      value={formDeadline}
                      onChange={(e) => setFormDeadline(e.target.value)}
                      onClick={(e) => {
                        try {
                          e.currentTarget.showPicker();
                        } catch (err) {
                          console.log(err);
                        }
                      }}
                      className="w-full bg-brand-faint text-sm text-brand-text rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-brand-muted uppercase tracking-wider block">ยอดเงินเป้าหมาย (฿)</label>
                    <input
                      type="number"
                      required
                      min="1"
                      placeholder="เช่น 50000"
                      value={formTarget}
                      onChange={(e) => setFormTarget(e.target.value)}
                      className="w-full bg-brand-faint text-sm text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-brand-muted uppercase tracking-wider block">ยอดเงินต้นสะสมแล้ว (฿)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={formCurrent}
                      onChange={(e) => setFormCurrent(e.target.value)}
                      className="w-full bg-brand-faint text-sm text-brand-text placeholder-brand-muted rounded-xl p-3 outline-none border border-brand-border/40 focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 p-3.5 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block text-[11px] font-black">
                      สัดส่วนการโอนเข้าเป้าหมายนี้ต่อเดือน (%)
                    </label>
                    <span className="text-xs font-black font-mono text-emerald-600">{formAllocatedPercentage}%</span>
                  </div>
                  <p className="text-[10px] text-brand-muted mb-2 leading-relaxed">
                    ระบุเปอร์เซ็นต์ส่วนแบ่งจากกำไรสุทธิแต่ละเดือนที่จะป้อนเข้าเป้าหมายนี้โดยอัตโนมัติ (เหลือโควตาให้ตั้งได้อีก {Math.max(0, 100 - totalAllocatedPct)}% จากทั้งหมด 100%)
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0, 100 - totalAllocatedPct)}
                      step="5"
                      value={formAllocatedPercentage}
                      onChange={(e) => setFormAllocatedPercentage(e.target.value)}
                      className="flex-1 accent-emerald-600 h-1.5 bg-brand-faint rounded-lg cursor-pointer"
                    />
                    <input
                      type="number"
                      min="0"
                      max={Math.max(0, 100 - totalAllocatedPct)}
                      value={formAllocatedPercentage}
                      onChange={(e) => {
                        const val = Math.min(Math.max(0, 100 - totalAllocatedPct), Math.max(0, parseInt(e.target.value) || 0));
                        setFormAllocatedPercentage(String(val));
                      }}
                      className="bg-brand-white dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold font-mono text-brand-text outline-none focus:border-emerald-500 w-16 text-center"
                    />
                  </div>
                </div>

                {/* Emoji presets selection & Free input */}
                <div className="space-y-2">
                  <label className="text-brand-muted uppercase tracking-wider flex items-center gap-1">เลือกหรือกำหนดสัญลักษณ์เป้าหมาย <IconPalette className="w-3 h-3" /></label>
                  
                  {/* Preset list */}
                  <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar">
                    {emojiPresets.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setFormEmoji(emoji);
                          setFormImageUrl('');
                        }}
                        className={`w-10 h-10 rounded-xl text-lg shrink-0 flex items-center justify-center border transition-all cursor-pointer ${
                          formEmoji === emoji && !formImageUrl
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 scale-105 font-bold' 
                            : 'bg-brand-faint border-brand-border/40 text-brand-text hover:bg-brand-border/40 dark:bg-stone-800'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Free-form Inputs with Gallery Upload */}
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-muted uppercase tracking-wider block font-bold">1. กำหนดอีโมจิเอง</label>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="เช่น 🚀 หรือ 💎"
                          value={formEmoji}
                          onChange={(e) => {
                            setFormEmoji(e.target.value);
                            setFormImageUrl('');
                          }}
                          className="w-full bg-brand-faint text-sm text-brand-text placeholder-brand-muted rounded-xl p-2.5 outline-none border border-brand-border/40 focus:border-emerald-500 text-center font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-muted uppercase tracking-wider block font-bold">2. อัปโหลดรูปแกลเลอรี</label>
                        <div className="relative">
                          <input
                            type="file"
                            id="goal-image-gallery"
                            accept="image/*"
                            onChange={(e) => handleGalleryUpload(e, false)}
                            className="hidden"
                          />
                          <label
                            htmlFor="goal-image-gallery"
                            className="w-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/25 border border-dashed border-emerald-500/30 hover:border-emerald-500 text-emerald-700 dark:text-emerald-400 rounded-xl p-2.5 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                          >
                            <span>เลือกรูปจากเครื่อง</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Image Preview */}
                    {formImageUrl && (
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <img 
                            src={formImageUrl} 
                            alt="Preview" 
                            className="w-10 h-10 rounded-lg object-cover border border-emerald-500/20"
                          />
                          <div>
                            <span className="text-[10px] font-bold text-brand-text block">เลือกใช้รูปภาพนี้แล้ว!</span>
                            <span className="text-[8px] text-brand-muted font-mono truncate block max-w-[180px]">
                              อัปโหลดสำเร็จ
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormImageUrl('')}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                        >
                          ลบรูปภาพ
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Color presets selection */}
                <div className="space-y-1.5">
                  <label className="text-brand-muted uppercase tracking-wider block">เลือกธีมโทนสี</label>
                  <div className="flex gap-3 py-1">
                    {colorPresets.map(preset => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setFormBg(preset.bg);
                          setFormAcc(preset.acc);
                        }}
                        className={`w-7 h-7 rounded-full transition-all flex items-center justify-center border-2 ${
                          formBg === preset.bg ? 'border-brand-text scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: preset.acc }}
                        title={preset.name}
                      >
                        {formBg === preset.bg && <IconCheck className="w-2.5 h-2.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all cursor-pointer border-none flex items-center justify-center gap-1.5"
                >
                  บันทึกเป้าหมายการสะสม
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Merged TargetTab Modal: Edit Goal Bottom Sheet */}
      <AnimatePresence>
        {isEditGoalLocalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditGoalLocalOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full sm:max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-5"
            >
              <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full mx-auto sm:hidden mb-1" />

              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-base font-black text-brand-text dark:text-white flex items-center gap-1.5">
                    แก้ไขข้อมูลเป้าหมาย <IconPencil className="w-3.5 h-3.5" />
                  </h3>
                  <p className="text-[10px] text-brand-muted mt-0.5">
                    แก้ไขเป้าหมายของคุณเพื่อสอดรับกับสภาวะการสะสมและดีลเสบียงรายเดือน
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditGoalLocalOpen(false)}
                  className="p-1 bg-brand-faint hover:bg-brand-border dark:bg-stone-800 rounded-lg text-brand-muted hover:text-brand-text transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleEditGoalSubmit} className="space-y-4 text-xs">
                {/* Name */}
                <div className="space-y-1">
                  <label className="text-brand-muted uppercase tracking-wider block">ชื่อเป้าหมายสะสม *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น เงินสำรองฉุกเฉิน, ซื้อกล้องใหม่"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-brand-faint dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl p-2.5 text-sm font-bold text-brand-text outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Grid Inputs */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Type Selection */}
                  <div className="space-y-1">
                    <label className="text-brand-muted uppercase tracking-wider block">ประเภทบัญชีสะสม</label>
                    <select
                      value={formType}
                      onChange={(e: any) => setFormType(e.target.value)}
                      className="w-full bg-brand-faint dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl p-2.5 text-xs font-bold text-brand-text outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="save">บัญชีเก็บออม</option>
                      <option value="invest">กองทุนสะสม</option>
                      <option value="emergency">เงินสำรองฉุกเฉิน</option>
                      <option value="buy">ชอปปิงของชิ้นใหญ่</option>
                    </select>
                  </div>

                  {/* Deadline date */}
                  <div className="space-y-1">
                    <label className="text-brand-muted uppercase tracking-wider block">เดดไลน์เป้าหมาย (วันดีเดย์)</label>
                    <input
                      type="date"
                      value={formDeadline}
                      onChange={(e) => setFormDeadline(e.target.value)}
                      onClick={(e) => {
                        try {
                          e.currentTarget.showPicker();
                        } catch (err) {
                          console.log(err);
                        }
                      }}
                      className="w-full bg-brand-faint dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl p-2 text-xs font-bold font-mono text-brand-text outline-none focus:border-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Target & Current Values */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-brand-muted uppercase tracking-wider block">เป้ายอดเงินที่อยากจัดเก็บ (฿)</label>
                    <input
                      type="number"
                      min="0"
                      required
                      placeholder="เป้า เช่น 50000"
                      value={formTarget}
                      onChange={(e) => setFormTarget(e.target.value)}
                      className="w-full bg-brand-faint dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl p-2.5 text-sm font-bold font-mono text-brand-text outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-brand-muted uppercase tracking-wider block">เงินตั้งต้นที่มีตอนนี้ (฿)</label>
                    <input
                      type="number"
                      min="0"
                      required
                      placeholder="ยอดมีอยู่แล้ว เช่น 2000"
                      value={formCurrent}
                      onChange={(e) => setFormCurrent(e.target.value)}
                      className="w-full bg-brand-faint dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl p-2.5 text-sm font-bold font-mono text-brand-text outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Profit Split slider input */}
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-2xl border border-brand-border/60 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider block">ปันผลแบ่งเก็บรายเดือน %</span>
                    <span className="text-[9px] text-brand-muted leading-relaxed block mt-0.5">
                      แบ่งกำไรสุทธิจัดสรรเพื่อเข้าเป้าหมายนี้โดยอัตโนมัติ (เหลือโควตาให้ตั้งได้อีก {Math.max(0, 100 - (totalAllocatedPct - (selectedGoal?.allocatedPercentage || 0)))}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min="0"
                      max={Math.max(0, 100 - (totalAllocatedPct - (selectedGoal?.allocatedPercentage || 0)))}
                      value={formAllocatedPercentage}
                      onChange={(e) => {
                        const maxPct = Math.max(0, 100 - (totalAllocatedPct - (selectedGoal?.allocatedPercentage || 0)));
                        const val = Math.min(maxPct, Math.max(0, parseInt(e.target.value) || 0));
                        setFormAllocatedPercentage(String(val));
                      }}
                      className="bg-brand-white dark:bg-stone-800 border border-brand-border dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold font-mono text-brand-text outline-none focus:border-emerald-500 w-16 text-center"
                    />
                  </div>
                </div>

                {/* Emoji presets selection & Free input */}
                <div className="space-y-2">
                  <label className="text-brand-muted uppercase tracking-wider flex items-center gap-1">เลือกหรือกำหนดสัญลักษณ์เป้าหมาย <IconPalette className="w-3 h-3" /></label>
                  
                  {/* Preset list */}
                  <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar">
                    {emojiPresets.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          setFormEmoji(emoji);
                          setFormImageUrl('');
                        }}
                        className={`w-10 h-10 rounded-xl text-lg shrink-0 flex items-center justify-center border transition-all cursor-pointer ${
                          formEmoji === emoji && !formImageUrl
                            ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 scale-105 font-bold' 
                            : 'bg-brand-faint border-brand-border/40 text-brand-text hover:bg-brand-border/40 dark:bg-stone-800'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Free-form Inputs with Gallery Upload */}
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-muted uppercase tracking-wider block font-bold">1. กำหนดอีโมจิเอง</label>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="เช่น 🚀 หรือ 💎"
                          value={formEmoji}
                          onChange={(e) => {
                            setFormEmoji(e.target.value);
                            setFormImageUrl('');
                          }}
                          className="w-full bg-brand-faint text-sm text-brand-text placeholder-brand-muted rounded-xl p-2.5 outline-none border border-brand-border/40 focus:border-emerald-500 text-center font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-brand-muted uppercase tracking-wider block font-bold">2. อัปโหลดรูปแกลเลอรี</label>
                        <div className="relative">
                          <input
                            type="file"
                            id="edit-goal-image-gallery-form"
                            accept="image/*"
                            onChange={(e) => handleGalleryUpload(e, false)}
                            className="hidden"
                          />
                          <label
                            htmlFor="edit-goal-image-gallery-form"
                            className="w-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/25 border border-dashed border-emerald-500/30 hover:border-emerald-500 text-emerald-700 dark:text-emerald-400 rounded-xl p-2.5 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
                          >
                            <span>เลือกรูปจากเครื่อง</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Image Preview */}
                    {formImageUrl && (
                      <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <img 
                            src={formImageUrl} 
                            alt="Preview" 
                            className="w-10 h-10 rounded-lg object-cover border border-emerald-500/20"
                          />
                          <div>
                            <span className="text-[10px] font-bold text-brand-text block">เลือกใช้รูปภาพนี้แล้ว!</span>
                            <span className="text-[8px] text-brand-muted font-mono truncate block max-w-[180px]">
                              อัปโหลดสำเร็จ
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormImageUrl('')}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                        >
                          ลบรูปภาพ
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Color presets selection */}
                <div className="space-y-1.5">
                  <label className="text-brand-muted uppercase tracking-wider block">เลือกธีมโทนสี</label>
                  <div className="flex gap-3 py-1">
                    {colorPresets.map(preset => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setFormBg(preset.bg);
                          setFormAcc(preset.acc);
                        }}
                        className={`w-7 h-7 rounded-full transition-all flex items-center justify-center border-2 ${
                          formBg === preset.bg ? 'border-brand-text scale-110' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: preset.acc }}
                        title={preset.name}
                      >
                        {formBg === preset.bg && <IconCheck className="w-2.5 h-2.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all cursor-pointer border-none flex items-center justify-center gap-1.5"
                >
                  บันทึกการแก้ไขข้อมูลเป้าหมาย
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Merged TargetTab Modal: Detail bottom sheet */}
      <AnimatePresence>
        {selectedGoal && !isEditGoalLocalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedGoal(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full sm:max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-6"
            >
              <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full mx-auto sm:hidden mb-2" />

              <button
                type="button"
                onClick={() => setSelectedGoal(null)}
                className="absolute top-4 right-4 p-1.5 bg-brand-faint hover:bg-brand-border/40 dark:bg-stone-800 rounded-lg text-brand-muted hover:text-brand-text transition-all cursor-pointer z-10"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-4">
                <div className="relative group shrink-0">
                  <input
                    type="file"
                    id="edit-goal-image-gallery"
                    accept="image/*"
                    onChange={(e) => handleGalleryUpload(e, true)}
                    className="hidden"
                  />
                  <label 
                    htmlFor="edit-goal-image-gallery"
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-brand-border/30 overflow-hidden cursor-pointer relative transition-all hover:brightness-95 block bg-neutral-100 dark:bg-stone-800"
                    style={{ backgroundColor: selectedGoal.bg }}
                    title="คลิกเพื่ออัปโหลดรูปภาพใหม่จากแกลเลอรี"
                  >
                    {selectedGoal.imageUrl ? (
                      <img src={selectedGoal.imageUrl} alt={selectedGoal.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      selectedGoal.emoji
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold">
                      เปลี่ยนรูป
                    </div>
                  </label>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold font-display text-brand-text dark:text-white leading-tight truncate">{selectedGoal.name}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <p className="text-xs text-brand-muted font-bold uppercase shrink-0">
                      {selectedGoal.type === 'save' ? 'บัญชีเก็บออม' : 'กองทุนสะสม'}
                    </p>
                    <span className="text-neutral-300 dark:text-neutral-700">•</span>
                    <label 
                      htmlFor="edit-goal-image-gallery"
                      className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      อัปโหลดรูปหน้าตัวเอง/แกลเลอรี
                    </label>
                  </div>
                </div>
              </div>

              {/* Stats detail */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest block">ความก้าวหน้า</span>
                <div className="flex justify-between items-baseline">
                  <span className="text-3xl font-extrabold font-mono text-brand-text dark:text-white">{formatCurrency(selectedGoal.current)}</span>
                  <span className="text-xs text-brand-muted font-bold">จากเป้าหมาย {formatCurrency(selectedGoal.target)}</span>
                </div>

                <div className="w-full h-3 bg-brand-faint dark:bg-neutral-800 rounded-full overflow-hidden mt-3">
                  <div 
                    className="h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${Math.min(100, (selectedGoal.current / selectedGoal.target) * 100)}%`, 
                      backgroundColor: selectedGoal.acc 
                    }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="font-extrabold" style={{ color: selectedGoal.acc }}>
                    {((selectedGoal.current / selectedGoal.target) * 100).toFixed(1)}% สำเร็จแล้ว
                  </span>
                  {selectedGoal.deadline && (
                    <span className="text-brand-muted">
                      ครบกำหนดเดดไลน์: {new Date(selectedGoal.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>

              {/* Allocation ratio card inside detail modal */}
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/50 border border-brand-border/60 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest block">สัดส่วนการออมรายเดือน</span>
                  <span className="text-xs font-black font-mono text-emerald-600">{(selectedGoal.allocatedPercentage ?? 0)}% ของกำไรสุทธิ</span>
                </div>
                <p className="text-[10px] text-brand-muted leading-relaxed">
                  ระบบจะแบ่งเงินรายได้กำไรสุทธิ {selectedGoal.allocatedPercentage ?? 0}% มาหยอดเข้าเป้าหมายนี้ในแต่ละเดือนโดยอัตโนมัติเมื่อกดจัดสรร
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const otherGoalsTotalPct = totalAllocatedPct - (selectedGoal.allocatedPercentage || 0);
                    const maxPctForThisGoal = Math.max(0, 100 - otherGoalsTotalPct);
                    triggerPrompt(
                      'แก้ไขสัดส่วนเปอร์เซ็นต์สะสม',
                      `ระบุเปอร์เซ็นต์ของกำไรสุทธิที่จะถูกจัดสรรเข้าเป้าหมาย "${selectedGoal.name}" นี้ในแต่ละเดือน (0 - ${maxPctForThisGoal} เนื่องจากเป้าหมายอื่นถูกตั้งไว้รวมแล้ว ${otherGoalsTotalPct}% เพื่อไม่ให้รวมกันเกิน 100%):`,
                      String(selectedGoal.allocatedPercentage ?? 0),
                      'พิมพ์ตัวเลขเปอร์เซ็นต์ (เช่น 25)',
                      'number',
                      (val) => {
                        const pct = Math.min(maxPctForThisGoal, Math.max(0, parseFloat(val) || 0));
                        onUpdateGoal(selectedGoal.id, { allocatedPercentage: pct });
                        setSelectedGoal(prev => prev ? { ...prev, allocatedPercentage: pct } : null);
                        triggerAlert('อัปเดตสัดส่วนสำเร็จ!', `เปลี่ยนสัดส่วนจัดสรรของเป้าหมาย "${selectedGoal.name}" เป็น ${pct}% เรียบร้อยแล้ว`);
                      }
                    );
                  }}
                  className="w-full py-1.5 bg-white dark:bg-stone-800 hover:bg-neutral-100 dark:hover:bg-stone-700 border border-brand-border text-brand-text dark:text-neutral-200 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <IconTarget className="w-3 h-3" /> ปรับแต่งเปอร์เซ็นต์เป้าหมายนี้
                </button>
              </div>

              {/* Action buttons on Goal */}
              <div className="space-y-2 pt-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openTxModal(selectedGoal, 'deposit')}
                    className="flex items-center justify-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 p-3 rounded-xl font-bold transition-all cursor-pointer border-none shadow-sm"
                  >
                    <IconCoin className="w-4 h-4" /> ฝากเงินเพิ่ม
                  </button>

                  <button
                    type="button"
                    onClick={() => openTxModal(selectedGoal, 'withdraw')}
                    className="flex items-center justify-center gap-1.5 bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-900/10 dark:text-rose-400 dark:border-rose-900/30 hover:bg-rose-100 p-3 rounded-xl font-bold transition-all cursor-pointer shadow-xs"
                  >
                    <IconCoinOut className="w-4 h-4" /> ดึงเงินออก
                  </button>
                </div>

                {goals.length > 1 && (
                  <button
                    type="button"
                    onClick={() => openTransferModal(selectedGoal)}
                    className="w-full flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/30 p-3 rounded-xl font-bold transition-all cursor-pointer"
                  >
                    <IconLoop className="w-4 h-4" /> โอนย้ายเงินไปเป้าหมายอื่น
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => openEditGoalForm(selectedGoal)}
                  className="w-full flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30 p-3 rounded-xl font-bold transition-all cursor-pointer"
                >
                  <IconPencil className="w-3.5 h-3.5" /> แก้ไขข้อมูลเป้าหมาย
                </button>
              </div>

              {/* Transaction History Section */}
              <div className="pt-4 border-t border-brand-border/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <History className="w-4 h-4 text-brand-text dark:text-white" />
                    <h4 className="text-xs font-extrabold text-brand-text dark:text-white">
                      ประวัติการโอนเข้า & ดึงเงินออก
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-brand-muted bg-brand-faint dark:bg-neutral-800 px-2 py-0.5 rounded-md">
                    {(selectedGoal.history || []).length} รายการ
                  </span>
                </div>

                {/* History Stats Summary Bar */}
                {selectedGoal.history && selectedGoal.history.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">รวมโอนเข้า</span>
                      <span className="font-mono font-extrabold text-emerald-700 dark:text-emerald-400">
                        +{formatCurrency(selectedGoal.history.filter(h => h.type === 'deposit').reduce((sum, h) => sum + h.amount, 0))}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400">รวมดึงออก</span>
                      <span className="font-mono font-extrabold text-rose-700 dark:text-rose-400">
                        -{formatCurrency(selectedGoal.history.filter(h => h.type === 'withdraw').reduce((sum, h) => sum + h.amount, 0))}
                      </span>
                    </div>
                  </div>
                )}

                {/* Filter Pills */}
                <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                  <div className="flex items-center gap-1 bg-brand-faint dark:bg-neutral-800 p-1 rounded-xl w-full justify-between">
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('all')}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer text-center ${historyFilter === 'all' ? 'bg-white dark:bg-stone-700 text-brand-text dark:text-white shadow-xs font-black' : 'text-brand-muted hover:text-brand-text'}`}
                    >
                      ทั้งหมด ({selectedGoal.history?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('deposit')}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer text-center ${historyFilter === 'deposit' ? 'bg-emerald-600 text-white shadow-xs font-black' : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                    >
                      <IconDot className="w-2 h-2 text-emerald-500 inline-block" /> โอนเข้า ({selectedGoal.history?.filter(h => h.type === 'deposit').length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter('withdraw')}
                      className={`flex-1 py-1 rounded-lg transition-all cursor-pointer text-center ${historyFilter === 'withdraw' ? 'bg-rose-600 text-white shadow-xs font-black' : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20'}`}
                    >
                      <IconDot className="w-2 h-2 text-rose-500 inline-block" /> ดึงออก ({selectedGoal.history?.filter(h => h.type === 'withdraw').length || 0})
                    </button>
                  </div>
                </div>

                {/* History Items List */}
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1 no-scrollbar">
                  {(() => {
                    const filtered = (selectedGoal.history || []).filter(item => {
                      if (historyFilter === 'deposit' && item.type !== 'deposit') return false;
                      if (historyFilter === 'withdraw' && item.type !== 'withdraw') return false;
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="p-6 text-center bg-brand-faint/50 dark:bg-neutral-800/40 rounded-2xl border border-dashed border-brand-border/40">
                          <Mascot mood="happy" size={40} className="mx-auto mb-1.5 opacity-80" />
                          <p className="text-xs font-bold text-brand-text dark:text-neutral-300">ยังไม่มีประวัติในหมวดหมู่นี้</p>
                          <p className="text-[10px] text-brand-muted mt-0.5">
                            กดปุ่ม <span className="text-emerald-600 font-bold">ฝากเงินเพิ่ม</span> หรือ <span className="text-rose-600 font-bold">ดึงเงินออก</span> ด้านบนเพื่อเริ่มบันทึกประวัติ
                          </p>
                        </div>
                      );
                    }

                    return filtered.map((tx) => {
                      const isDeposit = tx.type === 'deposit';
                      const formattedDate = new Date(tx.date).toLocaleDateString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      });

                      return (
                        <div
                          key={tx.id}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-2 text-xs transition-all ${
                            isDeposit 
                              ? 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200/50 dark:border-emerald-900/30' 
                              : 'bg-rose-50/40 dark:bg-rose-950/10 border-rose-200/50 dark:border-rose-900/30'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold ${
                              isDeposit 
                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' 
                                : 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400'
                            }`}>
                              {isDeposit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-brand-text dark:text-white truncate leading-tight">
                                {tx.reason || (isDeposit ? 'ฝากเงินเข้า' : 'ดึงเงินออก')}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-brand-muted flex-wrap">
                                <span className="font-medium">{formattedDate}</span>
                                {tx.note && <span className="truncate">({tx.note})</span>}
                                {tx.relatedGoalId && (
                                  <span className="flex items-center gap-0.5 font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.2 rounded-md">
                                    <RefreshCcw className="w-2.5 h-2.5" />
                                    {isDeposit ? 'มาจาก' : 'ไปยัง'} {tx.relatedGoalName || '—'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`font-mono font-extrabold ${
                              isDeposit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {isDeposit ? '+' : '-'}{formatCurrency(tx.amount)}
                            </span>

                            {onDeleteGoalTransaction && (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerConfirm(
                                    'ลบรายการประวัติตัวนี้',
                                    `คุณต้องการลบรายการ "${tx.reason}" (ยอด ${formatCurrency(tx.amount)}) ใช่หรือไม่?\n\nกดยืนยันเพื่อลบประวัติและปรับปรุงยอดเงินสะสมคงเหลืออัตโนมัติ`,
                                    () => {
                                      onDeleteGoalTransaction(selectedGoal.id, tx.id, true);
                                    }
                                  );
                                }}
                                className="p-1 text-neutral-400 hover:text-rose-600 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer"
                                title="ลบรายการประวัตินี้"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Delete Goal Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerConfirm(
                      'ยืนยันการลบเป้าหมาย',
                      `คุณแน่ใจหรือไม่ว่าต้องการลบเป้าหมาย "${selectedGoal.name}"? ข้อมูลทั้งหมดที่ออมมาในเป้าหมายนี้จะหายไปถาวร`,
                      () => {
                        onDeleteGoal(selectedGoal.id);
                        setSelectedGoal(null);
                      }
                    );
                  }}
                  className="w-full flex items-center justify-center gap-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 p-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-none"
                >
                  <Trash2 className="w-3.5 h-3.5" /> ลบเป้าหมายนี้
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Modal (Deposit / Withdraw with Reasons) */}
      <AnimatePresence>
        {isTxModalOpen && txGoal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 w-full max-w-md shadow-xl space-y-4 relative"
            >
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 bg-brand-faint hover:bg-brand-border/40 dark:bg-stone-800 rounded-lg text-brand-muted hover:text-brand-text transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl ${
                  txType === 'deposit' 
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' 
                    : 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                }`}>
                  {txType === 'deposit' ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-base text-brand-text dark:text-white">
                    {txType === 'deposit' ? 'ฝากเงินออมเพิ่ม' : 'ดึงเงินออก / ถอนเงิน'}
                  </h3>
                  <p className="text-xs text-brand-muted">
                    เป้าหมาย: <span className="font-bold text-brand-text dark:text-white">{txGoal.emoji} {txGoal.name}</span>
                  </p>
                </div>
              </div>

              <form onSubmit={handleTxSubmit} className="space-y-4 pt-1">
                {/* Transaction type switcher inside modal */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-brand-faint dark:bg-stone-800 rounded-2xl text-xs font-extrabold">
                  <button
                    type="button"
                    onClick={() => setTxType('deposit')}
                    className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      txType === 'deposit' 
                        ? 'bg-emerald-600 text-white shadow-xs' 
                        : 'text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4" /> โอนเงินเข้า
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('withdraw')}
                    className={`py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      txType === 'withdraw' 
                        ? 'bg-rose-600 text-white shadow-xs' 
                        : 'text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4" /> ดึงเงินออก
                  </button>
                </div>

                {/* Amount input */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                      จำนวนเงิน (บาท) <span className="text-rose-500">*</span>
                    </label>
                    {txType === 'withdraw' && txGoal.current > 0 && (
                      <button
                        type="button"
                        onClick={() => setTxAmount(String(txGoal.current))}
                        className="text-[10px] font-extrabold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        ดึงออกทั้งหมด 100% ({formatCurrency(txGoal.current)})
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="1"
                      required
                      value={txAmount}
                      onChange={(e) => setTxAmount(e.target.value)}
                      placeholder="เช่น 2000"
                      className="w-full pl-9 pr-4 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-sm font-mono font-extrabold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="absolute left-3 top-2.5 text-brand-muted font-bold text-xs">฿</span>
                  </div>
                </div>

                {/* Deduct-from-cash toggle -- only relevant for deposits. Lets money go into a
                    goal before it's technically "net profit" yet, but still marks it as spent
                    out of tracked income so cash-on-hand totals elsewhere reflect it. */}
                {txType === 'deposit' && (
                  <label className="flex items-start gap-2.5 p-3 bg-brand-faint/60 dark:bg-stone-800/60 border border-brand-border/60 dark:border-neutral-700 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={txDeductFromCash}
                      onChange={(e) => setTxDeductFromCash(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0 cursor-pointer"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-brand-text dark:text-neutral-200 block">
                        หักออกจากยอดรายรับ/เงินสดคงเหลือด้วย
                      </span>
                      <p className="text-[10px] text-brand-muted leading-relaxed">
                        ติ๊กถ้าเงินก้อนนี้มาจากรายรับที่บันทึกในระบบอยู่แล้ว (จะไปลดยอด "เงินสดคงเหลือ" ในหน้าภาพรวม/สรุปยอดรับให้อัตโนมัติ)
                        ไม่ต้องติ๊กถ้าเงินมาจากที่อื่นที่ไม่เกี่ยวกับรายรับในแอป
                      </p>
                    </div>
                  </label>
                )}

                {/* Date input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    วันที่ทำรายการ
                  </label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-xs font-bold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Reason / Details input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    สาเหตุ / หักค่าอะไร / หมายเหตุ
                  </label>
                  <input
                    type="text"
                    value={txReason}
                    onChange={(e) => setTxReason(e.target.value)}
                    placeholder={txType === 'deposit' ? 'เช่น ฝากออมประจำเดือน, รายได้สปอนเซอร์' : 'เช่น หักค่ามัดจำอุปกรณ์กล้อง, ค่าซ่อมคอมพิวเตอร์'}
                    className="w-full px-3.5 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-xs font-bold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />

                  {/* Reason Quick Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(txType === 'deposit'
                      ? [
                          { icon: IconCoin, label: 'ฝากประจำเดือน' },
                          { icon: IconGift, label: 'รายได้สปอนเซอร์' },
                          { icon: IconGem, label: 'เงินโบนัส/ทิป' },
                          { icon: IconBolt, label: 'จัดสรรกำไรสุทธิ' },
                        ]
                      : [
                          { icon: IconCamera, label: 'หักค่าอุปกรณ์' },
                          { icon: IconTool, label: 'หักค่าซ่อมบำรุง' },
                          { icon: IconAlertDot, label: 'ดึงใช้ฉุกเฉิน' },
                          { icon: IconGraduation, label: 'หักค่าเทอม/ศึกษา' },
                          { icon: IconLoop, label: 'โอนย้ายบัญชี' },
                        ]
                    ).map(({ icon: PresetIcon, label }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setTxReason(label)}
                        className="px-2.5 py-1 bg-brand-faint hover:bg-brand-border/30 dark:bg-stone-800 text-[10px] font-bold text-brand-text dark:text-neutral-200 rounded-lg border border-brand-border/40 transition-all cursor-pointer flex items-center gap-1"
                      >
                        <PresetIcon className="w-3 h-3" /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsTxModalOpen(false)}
                    className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-brand-text dark:text-neutral-200 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className={`flex-1 py-2.5 font-extrabold text-xs text-white rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      txType === 'deposit' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    {txType === 'deposit' ? <IconCoin className="w-3.5 h-3.5" /> : <IconCoinOut className="w-3.5 h-3.5" />}
                    {txType === 'deposit' ? 'ยืนยันฝากเงินเข้า' : 'ยืนยันดึงเงินออก'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transfer Modal (Move money from one goal to another) */}
      <AnimatePresence>
        {isTransferModalOpen && transferFromGoal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-neutral-800 rounded-3xl p-6 w-full max-w-md shadow-xl space-y-4 relative"
            >
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 bg-brand-faint hover:bg-brand-border/40 dark:bg-stone-800 rounded-lg text-brand-muted hover:text-brand-text transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                  <RefreshCcw className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-base text-brand-text dark:text-white">
                    โอนย้ายเงินระหว่างเป้าหมาย
                  </h3>
                  <p className="text-xs text-brand-muted">
                    ต้นทาง: <span className="font-bold text-brand-text dark:text-white">{transferFromGoal.emoji} {transferFromGoal.name}</span>
                  </p>
                </div>
              </div>

              <form onSubmit={handleTransferSubmit} className="space-y-4 pt-1">
                {/* Destination goal select */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    โอนไปยังเป้าหมาย <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={transferToGoalId}
                    onChange={(e) => setTransferToGoalId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-xs font-bold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {goals.filter(g => g.id !== transferFromGoal.id).map(g => (
                      <option key={g.id} value={g.id}>
                        {g.emoji} {g.name} (มี {formatCurrency(g.current)} / เป้า {formatCurrency(g.target)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    จำนวนเงิน (บาท) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="1"
                      max={transferFromGoal.current}
                      required
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="เช่น 2000"
                      className="w-full pl-9 pr-4 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-sm font-mono font-extrabold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute left-3 top-2.5 text-brand-muted font-bold text-xs">฿</span>
                  </div>
                  <p className="text-[10px] text-brand-muted">
                    ยอดคงเหลือในเป้าหมายต้นทาง: {formatCurrency(transferFromGoal.current)}
                  </p>
                </div>

                {/* Date input */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    วันที่ทำรายการ
                  </label>
                  <input
                    type="date"
                    required
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-xs font-bold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Reason / Details input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-brand-muted uppercase tracking-wider block">
                    สาเหตุ / หมายเหตุ (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="เช่น ย้ายเงินจากกองทุนลงทุนมาเก็บออม"
                    className="w-full px-3.5 py-2.5 bg-brand-faint/60 dark:bg-stone-800/80 border border-brand-border/80 dark:border-neutral-700 rounded-xl text-xs font-bold text-brand-text dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(false)}
                    className="flex-1 py-2.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-brand-text dark:text-neutral-200 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 font-extrabold text-xs text-white rounded-xl shadow-sm transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center gap-1.5"
                  >
                    <IconLoop className="w-3.5 h-3.5" /> ยืนยันโอนย้ายเงิน
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

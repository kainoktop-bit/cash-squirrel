import React from 'react';
import { Job, StatusOption } from '../types';
import { formatCurrency, safeFormatThaiDate, getRelativeDaysText } from '../utils';
import { motion, AnimatePresence } from 'motion/react';
import { User, Calendar, Clock, FileText, Edit2 } from 'lucide-react';
import { IconCalendar } from './icons';

interface JobDetailModalProps {
  job: Job | null;
  statuses: StatusOption[];
  onClose: () => void;
  onEdit: () => void;
}

function getStatusDisplay(statuses: StatusOption[], statusId: string) {
  const s = statuses.find((opt) => opt.id === statusId);
  if (!s) {
    if (statusId === 'unspecified') return { label: 'ยังไม่ระบุ', behavior: 'pending' as const };
    if (statusId === 'done') return { label: 'จ่ายเงินครบแล้ว', behavior: 'done' as const };
    if (statusId === 'partial') return { label: 'มัดจำแล้ว', behavior: 'partial' as const };
    return { label: 'ยังไม่จ่าย', behavior: 'pending' as const };
  }
  return { label: s.label, behavior: s.behavior };
}

// Read-only "what is this, how was it recorded" view — clicking a Timeline entry lands
// here first; editing is a deliberate extra tap via the "แก้ไข" button, not the default.
export function JobDetailModal({ job, statuses, onClose, onEdit }: JobDetailModalProps) {
  if (!job) return null;

  const statusInfo = getStatusDisplay(statuses, job.status);
  const isDone = statusInfo.behavior === 'done';
  const isPartial = statusInfo.behavior === 'partial';
  const showPayCountdown = job.pending > 0 && job.payDate && job.isPosted !== false;
  const relText = showPayCountdown ? getRelativeDaysText(job.payDate) : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-200">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/45 backdrop-blur-xs"
        />

        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-brand-white dark:bg-stone-900 rounded-t-3xl shadow-2xl p-6 overflow-y-auto max-h-[90vh] space-y-4 font-sans border-t border-brand-border/40"
        >
          <div className="w-12 h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full mx-auto mb-1 shrink-0" />

          <div className="flex justify-between items-start gap-3 shrink-0">
            <div className="min-w-0">
              <span className="text-[9px] font-black tracking-wider text-[#E65F2B] uppercase">
                รายละเอียดงาน
              </span>
              <h3 className="text-lg font-black text-brand-text dark:text-white font-display mt-0.5 leading-snug break-words">
                {job.name}
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] text-brand-muted font-medium flex-wrap mt-1">
                <span>{job.type}</span>
                {job.client && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{job.client}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 shrink-0 rounded-full bg-brand-faint dark:bg-stone-850 hover:bg-brand-border/40 text-xl text-brand-muted hover:text-brand-text flex items-center justify-center transition-colors cursor-pointer"
            >
              ×
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-brand-faint dark:bg-stone-850">
            <span className="text-xs font-bold text-brand-muted">มูลค่างาน</span>
            <span className="text-2xl font-black font-mono text-brand-text dark:text-white">
              {formatCurrency(job.value)}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {job.isPosted === false && (
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-brand-faint text-brand-muted">
                กำลังเตรียมงาน / ถ่ายทำ
              </span>
            )}
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${
              isDone
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                : isPartial
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
            }`}>
              {statusInfo.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="bg-brand-faint p-2.5 rounded-xl">
              <span className="text-[9px] text-brand-muted uppercase font-extrabold tracking-wider block">รับแล้ว</span>
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 font-mono text-sm">{formatCurrency(job.received)}</span>
            </div>
            <div className={`p-2.5 rounded-xl ${job.pending > 0 ? 'bg-amber-500/10' : 'bg-brand-faint'}`}>
              <span className={`text-[9px] uppercase font-extrabold tracking-wider block ${job.pending > 0 ? 'text-amber-600 dark:text-amber-400/80' : 'text-brand-muted'}`}>ค้างจ่าย</span>
              <span className={`font-extrabold font-mono text-sm ${job.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-brand-muted'}`}>
                {formatCurrency(job.pending)}
              </span>
            </div>
          </div>

          {job.whtRate && job.whtRate > 0 ? (
            <div className="flex items-center justify-between text-[10px] bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-xl text-amber-800 dark:text-amber-400 font-bold leading-none select-none">
              <span>หัก ณ ที่จ่าย {job.whtRate}%</span>
              <span className="font-mono">-{formatCurrency(job.whtAmount || 0)}</span>
            </div>
          ) : null}

          <div className="space-y-2 text-xs text-brand-text dark:text-neutral-200">
            {job.isPosted === false ? (
              <>
                <div className="flex items-center justify-between border-t border-brand-faint pt-3">
                  <span className="flex items-center gap-1.5 text-brand-muted font-semibold"><Calendar className="w-3.5 h-3.5" /> เริ่มงาน</span>
                  <span className="font-bold">{safeFormatThaiDate(job.startDate || job.postDate)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-brand-muted font-semibold"><IconCalendar className="w-3.5 h-3.5" /> เป้าออนแอร์</span>
                  <span className="font-bold">{job.postDate ? safeFormatThaiDate(job.postDate) : 'ยังไม่ระบุ'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-brand-muted font-semibold"><Clock className="w-3.5 h-3.5" /> เครดิตเทอม</span>
                  <span className="font-bold">{job.creditTerm === 0 ? 'รับทันที' : `+${job.creditTerm} วัน`}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-t border-brand-faint pt-3">
                  <span className="flex items-center gap-1.5 text-brand-muted font-semibold"><Calendar className="w-3.5 h-3.5" /> วันดีล/ออนแอร์</span>
                  <span className="font-bold">{safeFormatThaiDate(job.postDate)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-brand-muted font-semibold"><Clock className="w-3.5 h-3.5" /> เครดิตเทอม</span>
                  <span className="font-bold">{job.creditTerm === 0 ? 'รับทันที (No Credit)' : `+${job.creditTerm} วัน`}</span>
                </div>
                {job.payDate && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-brand-muted font-semibold"><IconCalendar className="w-3.5 h-3.5" /> วันกำหนดชำระ</span>
                    <span className="font-bold">{safeFormatThaiDate(job.payDate)}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {showPayCountdown && relText && (
            <div className={`p-2.5 rounded-xl text-xs flex items-center justify-between font-semibold border ${
              relText.isOverdue
                ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-100/40 dark:border-rose-500/10'
                : 'bg-amber-50/50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-100/40 dark:border-amber-500/10'
            }`}>
              <span className="flex items-center gap-1">
                <Clock className={`w-4 h-4 shrink-0 ${relText.isOverdue ? 'text-rose-500' : 'text-amber-500'}`} /> กำหนดชำระเงินที่เหลือ
              </span>
              <span className="font-black">{relText.text}</span>
            </div>
          )}

          {job.note && (
            <p className="text-xs text-brand-muted bg-brand-faint p-2.5 rounded-xl border border-brand-border/40 italic flex items-start gap-1.5">
              <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{job.note}</span>
            </p>
          )}

          <button
            type="button"
            onClick={onEdit}
            className="w-full py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 border border-brand-border text-brand-text dark:text-neutral-200 hover:bg-brand-faint dark:hover:bg-stone-850 transition-all cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
            แก้ไขข้อมูล
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

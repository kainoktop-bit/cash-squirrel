import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Job } from '../types';
import { formatCurrency } from '../utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Users, Briefcase, Crown } from 'lucide-react';
import { Mascot } from './Mascot';

interface InsightTabProps {
  jobs: Job[];
}

type PeriodOption = '3' | '6' | '12' | 'all';

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: '3', label: '3 เดือนล่าสุด' },
  { value: '6', label: '6 เดือนล่าสุด' },
  { value: '12', label: '12 เดือนล่าสุด' },
  { value: 'all', label: 'ทั้งหมด' }
];

interface Bucket {
  key: string;
  value: number;
  received: number;
  pending: number;
  count: number;
}

const TOP_N = 8;
const CHART_COLORS = ['#E65F2B', '#C96B5A', '#D98324', '#C17817', '#7A4419', '#A63F1B', '#557c72', '#7A5C43'];

function aggregate(jobs: Job[], keyFn: (j: Job) => string): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const j of jobs) {
    const key = keyFn(j);
    const existing = map.get(key) || { key, value: 0, received: 0, pending: 0, count: 0 };
    existing.value += j.value || 0;
    existing.received += j.received || 0;
    existing.pending += j.pending || 0;
    existing.count += 1;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.received - a.received);
}

function topNWithRest(buckets: Bucket[], n: number): Bucket[] {
  if (buckets.length <= n) return buckets;
  const top = buckets.slice(0, n);
  const rest = buckets.slice(n);
  const restBucket = rest.reduce<Bucket>(
    (acc, b) => ({
      key: 'อื่นๆ',
      value: acc.value + b.value,
      received: acc.received + b.received,
      pending: acc.pending + b.pending,
      count: acc.count + b.count
    }),
    { key: 'อื่นๆ', value: 0, received: 0, pending: 0, count: 0 }
  );
  return [...top, restBucket];
}

export const InsightTab: React.FC<InsightTabProps> = ({ jobs }) => {
  const [period, setPeriod] = useState<PeriodOption>('6');

  const filteredJobs = useMemo(() => {
    if (period === 'all') return jobs;
    const months = parseInt(period, 10);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    cutoff.setHours(0, 0, 0, 0);
    return jobs.filter((j) => {
      const dateStr = j.postDate || j.payDate;
      if (!dateStr) return true; // keep undated jobs rather than silently drop them
      return new Date(dateStr + 'T00:00:00') >= cutoff;
    });
  }, [jobs, period]);

  const byClient = useMemo(
    () => topNWithRest(aggregate(filteredJobs, (j) => (j.client || '').trim() || 'ไม่ระบุลูกค้า'), TOP_N),
    [filteredJobs]
  );

  const byType = useMemo(
    () => topNWithRest(aggregate(filteredJobs, (j) => (j.type || '').trim() || 'ยังไม่ระบุ'), TOP_N),
    [filteredJobs]
  );

  const topClient = byClient.find((b) => b.key !== 'อื่นๆ');
  const totalReceived = filteredJobs.reduce((sum, j) => sum + (j.received || 0), 0);

  const renderChart = (data: Bucket[], title: string, icon: React.ReactNode) => (
    <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-sm">
      <h3 className="font-display font-extrabold text-sm text-brand-text dark:text-white flex items-center gap-2 mb-5">
        {icon}
        {title}
      </h3>
      {data.length === 0 ? (
        <p className="text-xs text-brand-muted text-center py-10">ยังไม่มีข้อมูลในช่วงเวลานี้</p>
      ) : (
        <div className="w-full text-xs font-bold" style={{ height: Math.max(220, data.length * 42) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dfd9cd" opacity={0.3} horizontal={false} />
              <XAxis
                type="number"
                stroke="#4f5350"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <YAxis type="category" dataKey="key" stroke="#4f5350" fontSize={10} tickLine={false} axisLine={false} width={110} />
              <Tooltip
                cursor={{ fill: 'rgba(230, 95, 43, 0.05)' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload as Bucket;
                    return (
                      <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/60 p-3.5 rounded-2xl shadow-lg space-y-1.5 min-w-[180px]">
                        <p className="text-xs font-black text-brand-text dark:text-white mb-1 border-b border-brand-border/40 pb-1">
                          {d.key}
                        </p>
                        <div className="flex justify-between gap-4 text-[11px]">
                          <span className="text-brand-muted font-bold">รับแล้ว:</span>
                          <span className="font-extrabold text-[#E65F2B] dark:text-[#FFA473] font-mono">{formatCurrency(d.received)}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-[11px]">
                          <span className="text-brand-muted font-bold">ค้างรับ:</span>
                          <span className="font-extrabold text-brand-text dark:text-white font-mono">{formatCurrency(d.pending)}</span>
                        </div>
                        <div className="flex justify-between gap-4 text-[11px] pt-1 border-t border-brand-border/20">
                          <span className="text-brand-muted font-bold">จำนวนงาน:</span>
                          <span className="font-extrabold text-brand-text dark:text-white font-mono">{d.count} งาน</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="received" radius={[0, 6, 6, 0]} maxBarSize={26}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.key === 'อื่นๆ' ? '#a89689' : CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-black text-lg text-brand-text dark:text-white">วิเคราะห์รายได้เชิงลึก</h2>
          <p className="text-xs text-brand-muted mt-0.5">ดูว่าลูกค้าคนไหนหรืองานประเภทไหนทำเงินให้คุณมากที่สุด</p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodOption)}
          className="bg-brand-white dark:bg-stone-900 border border-brand-border dark:border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-brand-text dark:text-white outline-none focus:border-[#E65F2B] cursor-pointer"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {topClient ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#3D2314] dark:bg-[#261810] text-white rounded-3xl p-6 flex items-center gap-4 relative overflow-hidden"
        >
          <div className="absolute -right-6 -top-6 opacity-10">
            <Crown className="w-32 h-32" />
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#E65F2B]/20 flex items-center justify-center shrink-0 relative">
            <Crown className="w-7 h-7 text-[#FFA473]" />
          </div>
          <div className="min-w-0 relative">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/60">ลูกค้าอันดับ 1 ของช่วงนี้</p>
            <p className="text-lg font-display font-black truncate">{topClient.key}</p>
            <p className="text-sm font-mono font-black text-[#FFA473] mt-0.5">
              {formatCurrency(topClient.received)}
              <span className="text-[10px] font-sans font-bold text-white/50 ml-1.5">
                ({totalReceived > 0 ? Math.round((topClient.received / totalReceived) * 100) : 0}% ของรายรับทั้งหมด)
              </span>
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="bg-brand-faint dark:bg-neutral-800/40 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-8 text-center">
          <Mascot mood="wave" size={56} className="mx-auto mb-3" />
          <p className="text-xs text-brand-muted">ยังไม่มีข้อมูลรายรับในช่วงเวลานี้ ลองเปลี่ยนช่วงเวลาดูครับ</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderChart(byClient, 'รายรับตามลูกค้า', <Users className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />)}
        {renderChart(byType, 'รายรับตามประเภทงาน', <Briefcase className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />)}
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Job } from '../types';
import { formatCurrency, getMonthKey, formatMonthKey } from '../utils';
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
import { Users, Briefcase, Crown, AlertTriangle, UserPlus, TrendingUp, Clock, ArrowRight } from 'lucide-react';
import { Mascot } from './Mascot';

interface InsightTabProps {
  jobs: Job[];
  onSwitchTab: (tabId: string) => void;
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
const CONCENTRATION_RISK_THRESHOLD = 0.4;
const CHART_COLORS = ['#E65F2B', '#C96B5A', '#D98324', '#C17817', '#7A4419', '#A63F1B', '#557c72', '#7A5C43'];

function clientKey(j: Job): string {
  return (j.client || '').trim() || 'ไม่ระบุลูกค้า';
}

function typeKey(j: Job): string {
  return (j.type || '').trim() || 'ยังไม่ระบุ';
}

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

const StatTile: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }> = ({
  icon,
  label,
  value,
  sub
}) => (
  <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-2xl p-4 space-y-1">
    <div className="flex items-center gap-1.5 text-brand-muted">
      {icon}
      <span className="text-[9px] font-extrabold uppercase tracking-wider">{label}</span>
    </div>
    <p className="text-base font-black font-mono text-brand-text dark:text-white">{value}</p>
    {sub && <p className="text-[9px] text-brand-muted">{sub}</p>}
  </div>
);

export const InsightTab: React.FC<InsightTabProps> = ({ jobs, onSwitchTab }) => {
  const [period, setPeriod] = useState<PeriodOption>('6');

  const periodCutoff = useMemo(() => {
    if (period === 'all') return null;
    const months = parseInt(period, 10);
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    cutoff.setHours(0, 0, 0, 0);
    return cutoff;
  }, [period]);

  const filteredJobs = useMemo(() => {
    if (!periodCutoff) return jobs;
    return jobs.filter((j) => {
      const dateStr = j.postDate || j.payDate;
      if (!dateStr) return true; // keep undated jobs rather than silently drop them
      return new Date(dateStr + 'T00:00:00') >= periodCutoff;
    });
  }, [jobs, periodCutoff]);

  const byClient = useMemo(() => topNWithRest(aggregate(filteredJobs, clientKey), TOP_N), [filteredJobs]);
  const byType = useMemo(() => topNWithRest(aggregate(filteredJobs, typeKey), TOP_N), [filteredJobs]);

  const topClient = byClient.find((b) => b.key !== 'อื่นๆ');
  const totalReceived = filteredJobs.reduce((sum, j) => sum + (j.received || 0), 0);
  const totalPending = filteredJobs.reduce((sum, j) => sum + (j.pending || 0), 0);
  const distinctClientCount = new Set(filteredJobs.map(clientKey)).size;

  const avgPerClient = distinctClientCount > 0 ? totalReceived / distinctClientCount : 0;
  const avgPerJob = filteredJobs.length > 0 ? totalReceived / filteredJobs.length : 0;

  const hoursStat = useMemo(() => {
    const hoursJobs = filteredJobs.filter((j) => (j.hoursSpent || 0) > 0);
    const totalHours = hoursJobs.reduce((s, j) => s + (j.hoursSpent || 0), 0);
    const totalRev = hoursJobs.reduce((s, j) => s + (j.received || 0), 0);
    return totalHours > 0 ? totalRev / totalHours : null;
  }, [filteredJobs]);

  const unidentifiedCount = useMemo(() => filteredJobs.filter((j) => !(j.client || '').trim()).length, [filteredJobs]);

  const concentrationPct = topClient && totalReceived > 0 ? topClient.received / totalReceived : 0;

  const trendData = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of filteredJobs) {
      const dateStr = j.postDate || j.payDate;
      if (!dateStr) continue;
      const key = getMonthKey(dateStr);
      map.set(key, (map.get(key) || 0) + (j.received || 0));
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, received]) => ({ month: key, monthLabel: formatMonthKey(key), received }));
  }, [filteredJobs]);

  const retention = useMemo(() => {
    if (!periodCutoff) return null; // "ทั้งหมด" has no prior period to compare against
    const earliestByClient = new Map<string, Date>();
    for (const j of jobs) {
      const dateStr = j.postDate || j.payDate;
      if (!dateStr) continue;
      const key = clientKey(j);
      const d = new Date(dateStr + 'T00:00:00');
      const existing = earliestByClient.get(key);
      if (!existing || d < existing) earliestByClient.set(key, d);
    }
    const seenClients = new Set<string>();
    let newCount = 0;
    let newRevenue = 0;
    let recurringCount = 0;
    let recurringRevenue = 0;
    for (const j of filteredJobs) {
      const key = clientKey(j);
      const earliest = earliestByClient.get(key);
      const isNew = !earliest || earliest >= periodCutoff;
      if (isNew) newRevenue += j.received || 0;
      else recurringRevenue += j.received || 0;
      if (!seenClients.has(key)) {
        seenClients.add(key);
        if (isNew) newCount += 1;
        else recurringCount += 1;
      }
    }
    return { newCount, newRevenue, recurringCount, recurringRevenue };
  }, [jobs, filteredJobs, periodCutoff]);

  const effortRanking = useMemo(() => {
    const map = new Map<string, { type: string; received: number; hours: number }>();
    for (const j of filteredJobs) {
      if (!j.hoursSpent || j.hoursSpent <= 0) continue;
      const key = typeKey(j);
      const existing = map.get(key) || { type: key, received: 0, hours: 0 };
      existing.received += j.received || 0;
      existing.hours += j.hoursSpent;
      map.set(key, existing);
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, rate: e.hours > 0 ? e.received / e.hours : 0 }))
      .sort((a, b) => b.rate - a.rate);
  }, [filteredJobs]);

  const renderBarChart = (data: Bucket[], title: string, icon: React.ReactNode) => (
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
                tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`}
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

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<Users className="w-3.5 h-3.5" />}
          label="รายรับเฉลี่ย/ลูกค้า"
          value={formatCurrency(avgPerClient)}
        />
        <StatTile icon={<Briefcase className="w-3.5 h-3.5" />} label="รายรับเฉลี่ย/งาน" value={formatCurrency(avgPerJob)} />
        <StatTile
          icon={<ArrowRight className="w-3.5 h-3.5" />}
          label="รับแล้ว / ค้างรับ"
          value={formatCurrency(totalReceived)}
          sub={`ค้างรับ ${formatCurrency(totalPending)}`}
        />
        <StatTile
          icon={<Clock className="w-3.5 h-3.5" />}
          label="฿/ชั่วโมงเฉลี่ย"
          value={hoursStat !== null ? formatCurrency(hoursStat) : '—'}
          sub={hoursStat === null ? 'ยังไม่มีข้อมูลชั่วโมง' : undefined}
        />
      </div>

      {/* Concentration risk & unidentified-client nudges */}
      {topClient && concentrationPct >= CONCENTRATION_RISK_THRESHOLD && (
        <div className="flex items-start gap-2.5 bg-pink-bg border border-pink-acc/15 rounded-2xl p-4">
          <AlertTriangle className="w-4.5 h-4.5 text-pink-acc shrink-0 mt-0.5" />
          <p className="text-xs text-pink-acc leading-relaxed">
            <span className="font-black">รายได้ {Math.round(concentrationPct * 100)}% มาจากลูกค้าเจ้าเดียว ({topClient.key})</span>
            <br />
            ลองกระจายฐานลูกค้าเพิ่มเติมเพื่อลดความเสี่ยงหากลูกค้ารายนี้หายไป
          </p>
        </div>
      )}
      {unidentifiedCount > 0 && (
        <div className="flex items-center gap-2.5 bg-brand-faint dark:bg-neutral-800/40 border border-brand-border/40 dark:border-neutral-800 rounded-2xl p-4">
          <UserPlus className="w-4.5 h-4.5 text-brand-muted shrink-0" />
          <p className="text-xs text-brand-text dark:text-neutral-200 leading-relaxed flex-1">
            มี {unidentifiedCount} งานที่ยังไม่ได้ระบุชื่อลูกค้า ระบุให้ครบเพื่อให้การวิเคราะห์แม่นยำขึ้น
          </p>
          <button
            type="button"
            onClick={() => onSwitchTab('jobs')}
            className="shrink-0 text-[11px] font-black text-[#E65F2B] dark:text-[#FFA473] hover:underline cursor-pointer flex items-center gap-0.5"
          >
            ไปที่งานดีล <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Top client hero card */}
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

      {/* Revenue trend over time */}
      <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-sm">
        <h3 className="font-display font-extrabold text-sm text-brand-text dark:text-white flex items-center gap-2 mb-5">
          <TrendingUp className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
          แนวโน้มรายรับรายเดือน
        </h3>
        {trendData.length === 0 ? (
          <p className="text-xs text-brand-muted text-center py-10">ยังไม่มีข้อมูลในช่วงเวลานี้</p>
        ) : (
          <div className="h-64 w-full text-xs font-bold">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dfd9cd" opacity={0.3} vertical={false} />
                <XAxis dataKey="monthLabel" stroke="#4f5350" fontSize={10} tickLine={false} axisLine={false} dy={8} />
                <YAxis
                  stroke="#4f5350"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(230, 95, 43, 0.05)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload as { monthLabel: string; received: number };
                      return (
                        <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/60 p-3.5 rounded-2xl shadow-lg space-y-1.5 min-w-[160px]">
                          <p className="text-xs font-black text-brand-text dark:text-white mb-1 border-b border-brand-border/40 pb-1">
                            {d.monthLabel}
                          </p>
                          <div className="flex justify-between gap-4 text-[11px]">
                            <span className="text-brand-muted font-bold">รับแล้ว:</span>
                            <span className="font-extrabold text-[#E65F2B] dark:text-[#FFA473] font-mono">{formatCurrency(d.received)}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="received" fill="#E65F2B" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* By-client / by-job-type charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderBarChart(byClient, 'รายรับตามลูกค้า', <Users className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />)}
        {renderBarChart(byType, 'รายรับตามประเภทงาน', <Briefcase className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />)}
      </div>

      {/* Client retention */}
      {retention && (
        <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-sm">
          <h3 className="font-display font-extrabold text-sm text-brand-text dark:text-white flex items-center gap-2 mb-5">
            <UserPlus className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
            ลูกค้าใหม่ vs. ลูกค้าเดิม
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-brand-faint dark:bg-neutral-800/40 rounded-2xl p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-brand-muted">ลูกค้าใหม่</p>
              <p className="text-lg font-black font-mono text-brand-text dark:text-white mt-0.5">{retention.newCount} ราย</p>
              <p className="text-[10px] text-brand-muted mt-0.5">{formatCurrency(retention.newRevenue)}</p>
            </div>
            <div className="bg-emerald-500/10 rounded-2xl p-4">
              <p className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">ลูกค้าเดิม (ซื้อซ้ำ)</p>
              <p className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">{retention.recurringCount} ราย</p>
              <p className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70 mt-0.5">{formatCurrency(retention.recurringRevenue)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Effort vs Return */}
      <div className="bg-brand-white dark:bg-stone-900 border border-brand-border/40 dark:border-neutral-800 rounded-3xl p-5 sm:p-6 shadow-sm">
        <h3 className="font-display font-extrabold text-sm text-brand-text dark:text-white flex items-center gap-2 mb-1">
          <Clock className="w-4.5 h-4.5 text-[#E65F2B] dark:text-[#FFA473]" />
          ความคุ้มค่าต่อชั่วโมง (฿/ชม.) ตามประเภทงาน
        </h3>
        <p className="text-[11px] text-brand-muted mb-4">รู้ว่างานประเภทไหนทำแล้วได้เงินเยอะแต่ใช้เวลาน้อย</p>
        {effortRanking.length === 0 ? (
          <p className="text-xs text-brand-muted text-center py-8">
            ยังไม่มีข้อมูลชั่วโมงที่ใช้ ลองกรอกตอนเพิ่ม/แก้ไขงานดีลได้เลย
          </p>
        ) : (
          <div className="space-y-2">
            {effortRanking.map((e, i) => (
              <div
                key={e.type}
                className="flex items-center justify-between gap-3 p-3 bg-brand-faint dark:bg-neutral-800/40 rounded-2xl"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-[#E65F2B]/10 text-[#E65F2B] dark:text-[#FFA473] text-[10px] font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-xs font-bold text-brand-text dark:text-neutral-200 truncate">{e.type}</span>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black font-mono text-[#E65F2B] dark:text-[#FFA473]">{formatCurrency(e.rate)}/ชม.</p>
                  <p className="text-[9px] text-brand-muted">{e.hours} ชม. รวม</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

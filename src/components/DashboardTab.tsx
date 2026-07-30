import React from 'react';
import { Job, Goal, AppSettings, StatusOption, NotifSettings } from '../types';
import { formatCurrency, getForecastMonths, formatMonthKey, getRelativeDaysText, getMonthKey, safeFormatThaiDate } from '../utils';
import { motion } from 'motion/react';
import { Mascot } from './Mascot';
import { IconArrowUpRight, IconBolt, IconCoin } from './icons';
import { VineDivider } from './VineDivider';
import {
  TrendingUp,
  TrendingDown,
  Coins,
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  CheckCircle,
  ChevronRight, 
  Plus, 
  Sparkles,
  Search,
  Check,
  Copy,
  MessageSquare,
  Calendar,
  Flame,
  Bell,
  ChevronDown,
  ChevronUp,
  Mail,
  AlertCircle,
  Send
} from 'lucide-react';

interface DashboardTabProps {
  jobs: Job[];
  goals: Goal[];
  settings: AppSettings;
  onUpdateSettings?: (settings: AppSettings) => void;
  onSwitchTab: (tabId: string) => void;
  onOpenAddGoal: () => void;
  onOpenGoalDetail: (goalId: string) => void;
  statuses?: StatusOption[];
  selectedMonthKey: string;
  onEditJob?: (id: string, updated: Partial<Job>) => void;
  userEmail: string;
  notifSettings: NotifSettings;
  triggerAlert: (title: string, message: string, onConfirm?: () => void) => void;
  triggerConfirm: (title: string, message: string, onConfirm: () => void, onCancel?: () => void) => void;
}

// Animates a number counting up from 0 to `target` whenever the target changes
function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = React.useState(0);

  React.useEffect(() => {
    let rafId: number;
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return value;
}

const formatAbbreviatedTarget = (value: number): string => {
  if (value >= 1000000) {
    const m = value / 1000000;
    return (m % 1 === 0 ? m : m.toFixed(1).replace(/\.0$/, '')) + 'M';
  } else {
    const k = value / 1000;
    return (k % 1 === 0 ? k : k.toFixed(1).replace(/\.0$/, '')) + 'k';
  }
};

export default function DashboardTab({
  jobs,
  goals,
  settings,
  onUpdateSettings,
  onSwitchTab,
  onOpenAddGoal,
  onOpenGoalDetail,
  statuses = [],
  selectedMonthKey,
  onEditJob,
  userEmail,
  notifSettings,
  triggerAlert,
  triggerConfirm,
}: DashboardTabProps) {
  const [isAlertExpanded, setIsAlertExpanded] = React.useState(false);
  const [isRadarExpanded, setIsRadarExpanded] = React.useState(false);
  const [quickSearch, setQuickSearch] = React.useState('');
  const [visibleCount, setVisibleCount] = React.useState(4);
  const [isSendingSimulated, setIsSendingSimulated] = React.useState(false);

  // Credit Term Report for the 3-box dashboard
  const creditTermReport = React.useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date(todayStr + 'T00:00:00');

    const dueToday: Job[] = [];
    const overdue: Job[] = [];
    const upcoming: Job[] = [];

    jobs.forEach(j => {
      if (j.pending > 0 && j.payDate) {
        const payDate = new Date(j.payDate + 'T00:00:00');
        const diffTime = payDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          dueToday.push(j);
        } else if (diffDays < 0) {
          overdue.push(j);
        } else if (diffDays > 0 && diffDays <= 14) {
          upcoming.push(j);
        }
      }
    });

    // Sort overdue by oldest first, upcoming by earliest first
    overdue.sort((a, b) => (a.payDate || '').localeCompare(b.payDate || ''));
    upcoming.sort((a, b) => (a.payDate || '').localeCompare(b.payDate || ''));

    return {
      dueToday,
      overdue,
      upcoming,
      totalPendingCount: dueToday.length + overdue.length + upcoming.length,
      totalPendingValue: [...dueToday, ...overdue, ...upcoming].reduce((sum, j) => sum + j.pending, 0)
    };
  }, [jobs]);

  // Send alert to self via email about unpaid money
  const handleAlertSelfEmail = (job: Job) => {
    const days = getRelativeDaysText(job.payDate);
    let alertStatusText = '';

    if (days.isOverdue) {
      alertStatusText = `เกินกำหนดชำระแล้ว ${Math.abs(days.daysCount)} วัน 🚨`;
    } else if (days.daysCount === 0) {
      alertStatusText = `ครบกำหนดชำระวันนี้! ⏰`;
    } else {
      alertStatusText = `กำลังจะครบกำหนดในอีก ${days.daysCount} วัน 📅`;
    }

    const recipient = notifSettings.alertEmail || userEmail;
    const subjectText = `[แจ้งเตือนกระแสเงินสด] ยอดเงินยังไม่เข้า! ${alertStatusText} - งาน ${job.name}`;

    let bodyText = `แจ้งเตือนความจำถึงตัวเอง (Personal Cashflow Alert):\n`;
    bodyText += `ระบบตรวจพบว่างานนี้ "เงินยังไม่เข้า" หรือยอดชำระยังค้างอยู่!\n\n`;
    bodyText += `-----------------------------------------\n`;
    bodyText += `📌 รายละเอียดงานที่ผิดนัดชำระ/ค้างชำระ:\n`;
    bodyText += `• ชื่องาน/ดีล: ${job.name}\n`;
    bodyText += `• ลูกค้า/ผู้จ้าง: ${job.client}\n`;
    bodyText += `• สถานะเครดิตเทอม: ${alertStatusText}\n`;
    bodyText += `• วันครบกำหนดชำระเงิน: ${job.payDate || 'ไม่ระบุ'}\n`;
    bodyText += `• มูลค่างานทั้งหมด: ${formatCurrency(job.value)}\n`;
    bodyText += `• ยอดคงเหลือค้างจ่าย (Pending): ${formatCurrency(job.pending)}\n`;
    bodyText += `• ยอดที่จ่ายมาแล้ว: ${formatCurrency(job.received)}\n`;
    bodyText += `-----------------------------------------\n\n`;
    bodyText += `💡 คำแนะนำในการดำเนินการต่อไป:\n`;
    bodyText += `1. ตรวจสอบแอปพลิเคชันธนาคาร/รายการเดินบัญชี เพื่อยืนยันว่าไม่มีเงินโอนเข้าจากคุณ "${job.client || 'ลูกค้า'}" จริงๆ\n`;
    bodyText += `2. หากยังไม่ได้รับเงิน ให้จัดทำและส่งใบเตือนยอดหนี้ค้างชำระ หรือโทร/ทักแชตไปสอบถามสถานะกับทางฝั่งลูกค้าทันที\n`;
    bodyText += `3. หากได้รับเงินครบถ้วนแล้ว อย่าลืมกดแก้ไขงานนี้ในหน้า "ดีลงานทั้งหมด" หรือ "ไทม์ไลน์" และเปลี่ยนสถานะเป็น "จ่ายเงินครบแล้ว" เพื่อลบการแจ้งเตือนนี้ออก\n\n`;
    bodyText += `ส่งจากระบบรายงานและติดตามเครดิตเทอม Cashflow Tracker\n`;
    bodyText += `ผู้ใช้: ${userEmail}`;

    const mailtoUrl = `mailto:${recipient}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;

    triggerConfirm(
      'แจ้งเตือนเงินค้างชำระเข้าเมลตัวเอง',
      `คุณต้องการส่งร่างอีเมลแจ้งเตือนถึงตัวเอง เพื่อติดตามงาน "${job.name}" ที่${alertStatusText} หรือไม่? ระบบจะส่งอีเมลหาตัวคุณเองที่ ${recipient}`,
      () => {
        if (notifSettings.serviceType === 'emailjs' && notifSettings.emailjsServiceId && notifSettings.emailjsPublicKey) {
          setIsSendingSimulated(true);
          fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: notifSettings.emailjsServiceId,
              template_id: notifSettings.emailjsTemplateId,
              user_id: notifSettings.emailjsPublicKey,
              template_params: {
                to_email: recipient,
                subject: subjectText,
                message: bodyText,
              }
            })
          })
          .then(res => {
            setIsSendingSimulated(false);
            if (res.ok) {
              triggerAlert('ส่งอีเมลแจ้งเตือนสำเร็จ!', `ระบบส่งอีเมลตรวจสอบรายการค้างชำระไปที่ ${recipient} เรียบร้อยแล้ว`);
            } else {
              res.text().then(errText => {
                triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', `EmailJS แจ้งข้อผิดพลาด: ${errText}\n\nระบบจะเปิดหน้าเมลสำรอง (Mailto) เพื่อให้คุณส่งแมนนวลแทนครับ`, () => {
                  window.location.href = mailtoUrl;
                });
              });
            }
          })
          .catch(err => {
            setIsSendingSimulated(false);
            triggerAlert('ส่งอัตโนมัติไม่สำเร็จ', `เชื่อมต่อ EmailJS ผิดพลาด: ${err.message}\n\nระบบจะเปิดหน้าเมลสำรอง (Mailto) เพื่อให้คุณส่งแมนนวลแทนครับ`, () => {
              window.location.href = mailtoUrl;
            });
          });
        } else {
          window.location.href = mailtoUrl;
        }
      }
    );
  };

  // Helper to trigger email client and display animated/active feedback
  const handleSendEmailReport = () => {
    const todayThaiStr = new Date().toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const recipient = notifSettings.alertEmail || userEmail;
    const subjectText = `[รายงานสรุป] ยอดหนี้เครดิตเทอมและเงินค้างชำระ - ข้อมูล ณ วันที่ ${todayThaiStr}`;

    let bodyText = `เรียนผู้ใช้งาน Cashflow Tracker (คุณ ${userEmail})\n\n`;
    bodyText += `ระบบสรุปสถานะเครดิตเทอมของดิวดังต่อไปนี้ ประจำวันที่ ${todayThaiStr}:\n\n`;
    bodyText += `=========================================\n`;
    bodyText += `📊 สรุปภาพรวมยอดค้างชำระทั้งหมด: ${formatCurrency(creditTermReport.totalPendingValue)}\n`;
    bodyText += `=========================================\n\n`;

    if (creditTermReport.dueToday.length > 0) {
      bodyText += `🔴 [ครบกำหนดชำระวันนี้ - วันที่ ${todayThaiStr}]\n`;
      creditTermReport.dueToday.forEach((j, i) => {
        bodyText += `${i + 1}. ชื่องาน: ${j.name} | ลูกค้า: ${j.client} | ยอดค้าง: ${formatCurrency(j.pending)} (มูลค่างาน: ${formatCurrency(j.value)})\n`;
      });
      bodyText += `\n`;
    }

    if (creditTermReport.overdue.length > 0) {
      bodyText += `⚠️ [เกินกำหนดชำระแล้ว - OVERDUE]\n`;
      creditTermReport.overdue.forEach((j, i) => {
        const days = getRelativeDaysText(j.payDate);
        bodyText += `${i + 1}. ชื่องาน: ${j.name} | ลูกค้า: ${j.client} | ยอดค้าง: ${formatCurrency(j.pending)} (${days.text})\n`;
      });
      bodyText += `\n`;
    }

    if (creditTermReport.upcoming.length > 0) {
      bodyText += `📅 [กำลังจะครบกำหนดใน 14 วัน - UPCOMING]\n`;
      creditTermReport.upcoming.forEach((j, i) => {
        const days = getRelativeDaysText(j.payDate);
        bodyText += `${i + 1}. ชื่องาน: ${j.name} | ลูกค้า: ${j.client} | ยอดค้าง: ${formatCurrency(j.pending)} (${days.text})\n`;
      });
      bodyText += `\n`;
    }

    bodyText += `-----------------------------------------\n`;
    bodyText += `💡 คำแนะนำ:\n`;
    bodyText += `• กรุณาตรวจสอบกระแสเงินสดและทวงถามกับฝ่ายบัญชีของลูกค้าตามรายการด้านบน\n`;
    bodyText += `• สามารถคัดลอกร่างข้อความทวงเงินอัจฉริยะ (1-Click Templates) ได้ในแถบเมนูของแอปพลิเคชัน\n\n`;
    bodyText += `ขอแสดงความนับถือ\n`;
    bodyText += `ระบบติดตามเครดิตเทอมอัตโนมัติ Cashflow Tracker`;

    const mailtoUrl = `mailto:${recipient}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;

    triggerConfirm(
      'ส่งอีเมลรายงานสรุปยอดค้างจ่าย',
      `ระบบจะทำการสร้างร่างรายงานสรุปยอดค้างจ่ายทั้งหมดจำนวน ${formatCurrency(creditTermReport.totalPendingValue)} และเปิดช่องทางจัดส่งไปที่เมล ${recipient} ของคุณ เพื่อช่วยเก็บประวัติ`,
      () => {
        if (notifSettings.serviceType === 'emailjs' && notifSettings.emailjsServiceId && notifSettings.emailjsPublicKey) {
          setIsSendingSimulated(true);
          
          // Show quick simulation flow
          triggerAlert('กำลังส่งรายงานผ่าน EmailJS...', 'กรุณารอระบบประมวลผลสักครู่เดียวครับ');
          
          fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              service_id: notifSettings.emailjsServiceId,
              template_id: notifSettings.emailjsTemplateId,
              user_id: notifSettings.emailjsPublicKey,
              template_params: {
                to_email: recipient,
                subject: subjectText,
                message: bodyText,
              }
            })
          })
          .then(res => {
            setIsSendingSimulated(false);
            if (res.ok) {
              triggerAlert(
                'ส่งอีเมลรายงานสำเร็จ!',
                `ระบบได้ส่งรายงานวิเคราะห์ยอดค้างรับไปยังอีเมล ${recipient} เรียบร้อยแล้วครับ`
              );
            } else {
              res.text().then(errText => {
                triggerAlert(
                  'ส่งผ่าน EmailJS ไม่สำเร็จ',
                  `ตรวจพบข้อผิดพลาด: ${errText}\n\nระบบจะสลับไปทำงานผ่านระบบเมลสำรอง (Mailto Link) แทนเพื่อเปิดแอปพลิเคชันอีเมลของคุณ`,
                  () => {
                    window.location.href = mailtoUrl;
                  }
                );
              });
            }
          })
          .catch(err => {
            setIsSendingSimulated(false);
            triggerAlert(
              'เกิดข้อผิดพลาดในการเชื่อมต่อ',
              `ไม่สามารถเชื่อมต่ออีเมลเซิร์ฟเวอร์ได้: ${err.message}\n\nระบบจะเปลี่ยนไปส่งผ่านเมลสำรองของคุณแทนครับ`,
              () => {
                window.location.href = mailtoUrl;
              }
            );
          });
        } else {
          // Fallback to mailto link immediately
          setIsSendingSimulated(true);
          setTimeout(() => {
            setIsSendingSimulated(false);
            window.location.href = mailtoUrl;
            
            setTimeout(() => {
              triggerAlert(
                'เปิดระบบเมลสำเร็จ!',
                `รายงานจะถูกร่างและเปิดขึ้นบนระบบของคุณเรียบร้อยแล้ว ปลายทางคือ ${recipient}`
              );
            }, 1000);
          }
          , 2000);
        }
      }
    );
  };

  // Credit term dashboard states
  const [creditFilter, setCreditFilter] = React.useState<'all' | 'overdue' | 'dueSoon' | 'onTrack'>('all');
  const [expandedJobId, setExpandedJobId] = React.useState<string | null>(null);
  const [copiedJobId, setCopiedJobId] = React.useState<string | null>(null);
  const [followUpStyle, setFollowUpStyle] = React.useState<'polite' | 'cute' | 'urgent'>('polite');

  const unpaidJobs = React.useMemo(() => {
    return jobs.filter(j => {
      const isPaid = j.status === 'done' || 
                      j.paymentStatus === 'paid' || 
                      (statuses && statuses.find(s => s.id === j.status)?.behavior === 'done');
      return !isPaid;
    });
  }, [jobs, statuses]);

  const filteredUnpaidJobs = React.useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    if (!q) {
      return unpaidJobs
        .map(j => {
          const rel = getRelativeDaysText(j.payDate || j.postDate);
          return {
            ...j,
            daysText: rel.text,
            isOverdue: rel.isOverdue,
            daysCount: rel.daysCount,
          };
        })
        .sort((a, b) => {
          if (a.isOverdue && !b.isOverdue) return -1;
          if (!a.isOverdue && b.isOverdue) return 1;
          return a.daysCount - b.daysCount;
        });
    }
    return unpaidJobs
      .filter(j => 
        j.name.toLowerCase().includes(q) || 
        (j.client && j.client.toLowerCase().includes(q))
      )
      .map(j => {
        const rel = getRelativeDaysText(j.payDate || j.postDate);
        return {
          ...j,
          daysText: rel.text,
          isOverdue: rel.isOverdue,
          daysCount: rel.daysCount,
        };
      });
  }, [unpaidJobs, quickSearch]);

  // Calculations for Credit Term tracking dashboard
  const creditStats = React.useMemo(() => {
    let totalUnpaid = 0;
    let totalOverdue = 0;
    let totalDueSoon = 0;
    let totalOnTrack = 0;

    let overdueCount = 0;
    let dueSoonCount = 0;
    let onTrackCount = 0;

    const mapped = unpaidJobs.map(j => {
      const rel = getRelativeDaysText(j.payDate || j.postDate);
      const isOverdue = rel.isOverdue;
      const isDueSoon = !isOverdue && rel.daysCount >= 0 && rel.daysCount <= 7;
      const isOnTrack = !isOverdue && !isDueSoon;

      totalUnpaid += j.pending;
      if (isOverdue) {
        totalOverdue += j.pending;
        overdueCount++;
      } else if (isDueSoon) {
        totalDueSoon += j.pending;
        dueSoonCount++;
      } else {
        totalOnTrack += j.pending;
        onTrackCount++;
      }

      return {
        ...j,
        daysText: rel.text,
        isOverdue,
        isDueSoon,
        isOnTrack,
        daysCount: rel.daysCount
      };
    });

    return {
      mapped,
      totalUnpaid,
      totalOverdue,
      totalDueSoon,
      totalOnTrack,
      overdueCount,
      dueSoonCount,
      onTrackCount,
      totalCount: mapped.length
    };
  }, [unpaidJobs]);

  const filteredUnpaidJobsByTabAndSearch = React.useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    
    // First apply search
    let list = creditStats.mapped;
    if (q) {
      list = list.filter(j => 
        j.name.toLowerCase().includes(q) || 
        (j.client && j.client.toLowerCase().includes(q))
      );
    }

    // Then apply credit term status tab filter
    if (creditFilter === 'overdue') {
      list = list.filter(j => j.isOverdue);
    } else if (creditFilter === 'dueSoon') {
      list = list.filter(j => j.isDueSoon);
    } else if (creditFilter === 'onTrack') {
      list = list.filter(j => j.isOnTrack);
    }

    // Sort: overdue first, then by daysCount ascending
    return list.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return a.daysCount - b.daysCount;
    });
  }, [creditStats, quickSearch, creditFilter]);

  const generateFollowUpMessage = (j: any, style: 'polite' | 'cute' | 'urgent') => {
    const clientName = j.client || 'คุณลูกค้า';
    const projectName = j.name;
    const valueStr = formatCurrency(j.pending);
    const dateStr = safeFormatThaiDate(j.payDate || j.postDate);
    const creditStr = j.creditTerm ? `${j.creditTerm} วัน` : 'ไม่ระบุ';

    if (style === 'polite') {
      return `เรียน คุณลูกค้า/ผู้ติดต่อจากแบรนด์ ${clientName}\n\n` +
             `ขออนุญาตติดตามสถานะและการดำเนินการตั้งเบิกสำหรับโปรเจกต์ "${projectName}" ` +
             `ซึ่งมียอดค้างชำระจำนวน ${valueStr} บาท (กำหนดชำระเมื่อวันที่ ${dateStr} ตามเงื่อนไขเครดิตเทอม ${creditStr} ครับ)\n\n` +
             `หากท่านได้ทำการโอนชำระเงินเข้ามาแล้ว หรือหากต้องการเอกสาร/ใบเสร็จเพิ่มเติมประการใด ` +
             `สามารถแจ้งกระผมทราบได้ทันทีนะครับ ขอบพระคุณสำหรับความร่วมมือและขออภัยที่ส่งข้อความมาติดตามครับ 🙏💼\n\n` +
             `ขอแสดงความนับถือ,\n[ชื่อของคุณ]`;
    } else if (style === 'cute') {
      return `สวัสดีค่าแบรนด์ ${clientName} ที่น่ารัก 🐿️💖\n\n` +
             `วันนี้นัททิเจ้ากระรอกน้อย ขออนุญาตแวะมาสะกิดติดตามเรื่องคลังเสบียงของโปรเจกต์ "${projectName}" น้าค้า ` +
             `มียอดค้างโอนอยู่จำนวน ${valueStr} บาท (เลยกำหนดกำหนดส่งมอบและเครดิตเทอมวันที่ ${dateStr} แย้วงับ 🥺)\n\n` +
             `คุณลูกค้าโอนเข้าโพรงไม้เรียบร้อยแล้วแจ้งนัททิได้น้า หรือถ้าติดขั้นตอนตรงไหนปรึกษาบอกได้เลยงับ! ` +
             `ขอขอบพระคุณที่น่ารักและคอยดูแลนัททิตลอดมาน้าค้า รักเลยยยย 🥜✨`;
    } else {
      return `⚠️ [ติดตามด่วน - ยอดเลยกำหนดชำระเครดิตเทอม]\n\n` +
             `เรียน ฝ่ายบัญชี/ผู้ดูแลแบรนด์ ${clientName}\n\n` +
             `อ้างอิงถึงการส่งมอบงานโครงการ "${projectName}" ยอดเงินค้างชำระคงเหลือสุทธิจำนวน ${valueStr} บาท ซึ่งครบกำหนดรับเงินตั้งแต่วันที่ ${dateStr} แล้วนั้น\n\n` +
             `เนื่องจากยอดนี้เลยดีลการชำระเงินตามสัญญามาแล้ว รบกวนช่วยเร่งตรวจสอบกับทางฝ่ายที่เกี่ยวข้อง ` +
             `และขอความกรุณาช่วยแจ้งวันที่ยอดเงินจะเข้าบัญชี หรือส่งหลักฐานการโอนกลับมาที่ช่องทางนี้โดยด่วนที่สุดครับ\n\n` +
             `หากต้องการให้จัดส่งเอกสารใบเสร็จ/ใบกำกับภาษีเพิ่มเติม กรุณาแจ้งให้ทราบทันทีครับ\n\n` +
             `ขอบคุณครับ,\n[ชื่อของคุณ]`;
    }
  };

  const handleCopyMessage = (j: any) => {
    const text = generateFollowUpMessage(j, followUpStyle);
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedJobId(j.id);
        setTimeout(() => setCopiedJobId(null), 2000);
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
      });
  };

  const handleMarkFollowUp = (j: any) => {
    if (onEditJob) {
      onEditJob(j.id, {
        followUpCount: (j.followUpCount || 0) + 1,
        lastFollowUpDate: new Date().toISOString().split('T')[0]
      });
      
      // Play sound effect
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(1000, now + 0.1);
          gain.gain.setValueAtTime(0.1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.15);
        }
      } catch (e) {}
    }
  };

  const currentMonthKey = React.useMemo(() => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
  }, []);
  
  const selectedMonthJobs = jobs.filter(j => getMonthKey(j.payDate || j.postDate) === selectedMonthKey);
  
  const totalReceived = selectedMonthJobs.reduce((sum, j) => {
    const isPaid = j.status === 'done' || 
                    j.paymentStatus === 'paid' || 
                    statuses.find(s => s.id === j.status)?.behavior === 'done';
    const effectiveReceived = isPaid 
       ? (j.received || Math.max(0, j.value - Math.round(j.value * ((j.whtRate || 0) / 100))))
       : j.received;
    return sum + effectiveReceived;
  }, 0);

  const totalPending = selectedMonthJobs.reduce((sum, j) => {
    const isPaid = j.status === 'done' || 
                    j.paymentStatus === 'paid' || 
                    statuses.find(s => s.id === j.status)?.behavior === 'done';
    return sum + (isPaid ? 0 : j.pending);
  }, 0);

  const totalContractVal = selectedMonthJobs.reduce((sum, j) => {
    const isPaid = j.status === 'done' || 
                    j.paymentStatus === 'paid' || 
                    statuses.find(s => s.id === j.status)?.behavior === 'done';
    return sum + (isPaid ? (j.received || j.value) : j.value);
  }, 0);

  const profit = totalReceived - settings.monthlyExpense;

  // Month-over-month comparison for the hero card
  const prevMonthKey = React.useMemo(() => {
    const [y, m] = selectedMonthKey.split('-').map(Number);
    const d = new Date(y, m - 1 - 1, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0');
  }, [selectedMonthKey]);

  const prevMonthReceived = jobs
    .filter(j => getMonthKey(j.payDate || j.postDate) === prevMonthKey)
    .reduce((sum, j) => {
      const isPaid = j.status === 'done' ||
                      j.paymentStatus === 'paid' ||
                      statuses.find(s => s.id === j.status)?.behavior === 'done';
      const effectiveReceived = isPaid
         ? (j.received || Math.max(0, j.value - Math.round(j.value * ((j.whtRate || 0) / 100))))
         : j.received;
      return sum + effectiveReceived;
    }, 0);

  const receivedChangePct = prevMonthReceived > 0
    ? Math.round(((totalReceived - prevMonthReceived) / prevMonthReceived) * 100)
    : null;

  let alertStatus: 'danger' | 'warning' | 'success' = 'success';
  let alertHeadline = '';
  let alertFullMessage = '';
  const monthName = formatMonthKey(selectedMonthKey);

  if (selectedMonthJobs.length === 0) {
    alertStatus = 'warning';
    alertHeadline = `ยังไม่มีบันทึกเสบียงในเดือน ${monthName}`;
    alertFullMessage = `คลังเสบียงเดือน ${monthName} ยังไม่มีการบันทึกการเก็บลูกนัทเข้ามาในระบบ`;
  } else if (totalReceived < settings.monthlyExpense) {
    alertStatus = 'danger';
    alertHeadline = `วิกฤตเสบียงไม่พอรายจ่าย (ขาดอีก ${formatCurrency(settings.monthlyExpense - totalReceived)})`;
    alertFullMessage = `วิกฤตหน้าหนาวเดือน ${monthName}: ลูกนัทในรังมีเพียง (${formatCurrency(totalReceived)}) ซึ่งยังไม่พอประทังชีวิตจากเป้ารายจ่ายคงที่ (${formatCurrency(settings.monthlyExpense)}) คุณยังขาดลูกนัทอีกจำนวน ${formatCurrency(settings.monthlyExpense - totalReceived)}`;
  } else if (profit >= 0 && profit < 5000) {
    alertStatus = 'warning';
    alertHeadline = `เสบียงสะสมเดือน ${monthName} อยู่ระดับหมิ่นเหม่ (${formatCurrency(profit)})`;
    alertFullMessage = `คลังเสบียงเดือน ${monthName}: มีลูกนัทสำรองหลังจากหักรายจ่ายคงที่อยู่หมิ่นเหม่ (${formatCurrency(profit)}) แนะนำให้เร่งหาลูกนัทเพิ่มเข้าโพรงไม้`;
  } else {
    alertStatus = 'success';
    alertHeadline = `เสบียงอุดมสมบูรณ์ดี! มีเสบียงส่วนเกินสะสม (+${formatCurrency(profit)})`;
    alertFullMessage = `เสบียงอุดมสมบูรณ์ในเดือน ${monthName}: มีลูกนัทกินเหลือเก็บสุทธิเพิ่มขึ้นจำนวน ${formatCurrency(profit)} สำหรับจัดสรรลงรังออม`;
  }

  const playHapticAndSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, now);
        osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(329.63, now);
        osc2.frequency.exponentialRampToValueAtTime(523.25, now + 0.15);
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.25);
        osc2.stop(now + 0.25);
      }
    } catch (e) {
      console.log("Audio feedback error", e);
    }
    if (navigator.vibrate) {
      navigator.vibrate([40, 30, 40]);
    }
  };

  const forecastMonthsList = getForecastMonths();
  const projectedMonthsData = forecastMonthsList.map(monthKey => {
    let totalConfirmed = 0;
    let totalPending = 0;
    jobs.forEach(j => {
      if (j.received > 0 && getMonthKey(j.payDate || j.postDate) === monthKey) {
        totalConfirmed += j.received;
      }
      if (j.pending > 0 && j.isPosted !== false) {
        const expectedPayDate = j.payDate || j.postDate;
        if (getMonthKey(expectedPayDate) === monthKey) {
          totalPending += j.pending;
        }
      }
    });
    const totalIncome = totalConfirmed + totalPending;
    const isSufficient = totalIncome >= settings.monthlyExpense;
    const balance = totalIncome - settings.monthlyExpense;
    return {
      monthKey,
      totalIncome,
      isSufficient,
      balance,
    };
  });

  const upcomingPayments = jobs
    .filter(j => j.pending > 0 && j.isPosted !== false)
    .map(j => {
      const rel = getRelativeDaysText(j.payDate || j.postDate);
      return {
        ...j,
        daysText: rel.text,
        isOverdue: rel.isOverdue,
        daysCount: rel.daysCount,
      };
    })
    .sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return a.daysCount - b.daysCount;
    })
    .slice(0, 4);

  // Count-up animated values for the hero card
  const animatedContractVal = useCountUp(totalContractVal);
  const animatedReceived = useCountUp(totalReceived);
  const animatedPending = useCountUp(totalPending);
  const animatedProfit = useCountUp(profit);

  return (
    <div id="dashboard-top" className="space-y-6 scroll-mt-6 text-brand-text">
      
      {/* 1. Header Bar */}
      <div className="px-1">
        <span className="text-xs font-semibold tracking-wider text-brand-muted uppercase font-bold" title="คลังพยากรณ์ประจำรังกระรอก">
          พยากรณ์รังเสบียง
        </span>
        <h2 className="text-3xl font-bold font-display text-brand-text tracking-tight mt-0.5">
          ภาพรวมเสบียง
        </h2>
      </div>

      {/* 2. Hero Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#3D2314] text-white rounded-3xl p-6 border border-[#2B180D]"
      >
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-white/60 tracking-wider uppercase" title="มูลค่างานตามสัญญาทั้งหมด">
                มูลค่างานตามสัญญา ({formatMonthKey(selectedMonthKey)})
              </p>
              <h3 className="text-4xl font-extrabold font-mono tracking-tight text-[#E65F2B] mt-1.5">
                {formatCurrency(animatedContractVal)}
              </h3>
            </div>
            {totalReceived > 0 && (
              <motion.div
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.15 }}
                className="shrink-0"
              >
                <Mascot mood="celebrate" size={56} />
              </motion.div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/10">
            <div>
              <p className="text-[10px] font-medium text-white/60 tracking-wider uppercase flex items-center gap-1.5" title="ยอดเงินที่รับเข้ามาแล้วจริง">
                <span>รับเงินแล้ว</span>
                {receivedChangePct !== null && receivedChangePct !== 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-black normal-case ${
                    receivedChangePct > 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {receivedChangePct > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {receivedChangePct > 0 ? '+' : ''}{receivedChangePct}%
                  </span>
                )}
              </p>
              <p className="text-lg font-black font-mono text-white mt-0.5">
                {formatCurrency(animatedReceived)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-white/60 tracking-wider uppercase" title="ยอดเงินที่ยังไม่ได้รับ">
                ยอดค้างรับ
              </p>
              <p className="text-lg font-black font-mono text-white mt-0.5">
                {formatCurrency(animatedPending)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-white/60 tracking-wider uppercase" title="รับเงินแล้ว หักด้วยรายจ่ายคงที่ต่อเดือน">
                กำไรสุทธิ
              </p>
              <p className={`text-lg font-black font-mono mt-0.5 ${profit >= 0 ? 'text-[#E65F2B]' : 'text-rose-400'}`}>
                {formatCurrency(animatedProfit)}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 3. Alert Zone */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`p-4 rounded-2xl border border-l-4 bg-brand-white flex flex-col gap-2 transition-all ${
          alertStatus === 'danger'
            ? 'border-brand-border border-l-[#A63F1B]'
            : alertStatus === 'warning'
            ? 'border-brand-border border-l-[#D98324]'
            : 'border-brand-border border-l-[#125442]'
        }`}
      >
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0">
              {alertStatus === 'danger' ? (
                <AlertTriangle className="w-5 h-5 text-[#A63F1B] dark:text-[#FA7E52]" />
              ) : alertStatus === 'warning' ? (
                <AlertTriangle className="w-5 h-5 text-[#D98324] dark:text-[#F2B76B]" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-[#125442] dark:text-[#4ade80]" />
              )}
            </div>
            <h4 className="text-xs font-black tracking-tight font-sans text-brand-text">
              {alertHeadline}
            </h4>
          </div>
          <button
            onClick={() => setIsAlertExpanded(!isAlertExpanded)}
            className="text-[10px] font-black underline shrink-0 px-2.5 py-1 rounded-lg text-brand-muted hover:bg-brand-faint transition-colors cursor-pointer"
          >
            {isAlertExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
          </button>
        </div>

        {isAlertExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-2 border-t border-brand-border/40 text-[11px] leading-relaxed font-medium text-brand-muted"
          >
            {alertFullMessage}
          </motion.div>
        )}
      </motion.div>

      {/* 4-Month Cash Flow Projections: กราฟแสดงโพรงไม้แบบใหม่ (Acorn Hollows) */}
      <motion.div layout className="space-y-3 bg-brand-white border border-brand-border rounded-3xl p-4 shadow-sm transition-all">
        <div 
          onClick={() => setIsRadarExpanded(!isRadarExpanded)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D98324] dark:text-[#F2B76B] animate-pulse" />
            <div>
              <h4 className="text-xs font-black tracking-wider text-brand-muted uppercase" title="เรดาร์สแกนความอุดมสมบูรณ์โพรงไม้ 4 เดือนล่วงหน้า">
                เรดาร์เสบียง 4 เดือน
              </h4>
              <p className="text-[10px] text-brand-muted mt-0.5">
                {isRadarExpanded 
                  ? "วิเคราะห์และคาดการณ์ปริมาณลูกนัทสะสมล่วงหน้า" 
                  : `ภาพรวมเสบียงล่วงหน้า: พอใช้ ${projectedMonthsData.filter(m => m.isSufficient).length}/4 เดือน`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-extrabold text-brand-muted bg-brand-faint px-2 py-0.5 rounded-full uppercase tracking-wider">
              {isRadarExpanded ? 'ย่อแผนภูมิ' : 'ดูรายเดือน'}
            </span>
          </div>
        </div>
        
        {isRadarExpanded && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="pt-3 border-t border-brand-border/40 space-y-3"
          >
            <div className="flex justify-between items-center text-[10px] text-brand-muted">
              <span>* เกณฑ์ประเมินอิงรายจ่ายคงที่: {formatCurrency(settings.monthlyExpense)} / เดือน</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {projectedMonthsData.map((m, idx) => {
                const isCurrent = m.monthKey === currentMonthKey;
                const fillPercentage = Math.min(100, (m.totalIncome / Math.max(1, settings.monthlyExpense)) * 100);
                
                return (
                  <motion.div
                    key={m.monthKey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="p-4 rounded-3xl border border-brand-border flex flex-col justify-between space-y-4 transition-all bg-brand-white"
                  >
                    {/* ด้านบนการ์ด: ข้อมูลเดือนและสถานะความอุดมสมบูรณ์ */}
                    <div className="flex justify-between items-start">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-stone-900 dark:text-white">
                            {formatMonthKey(m.monthKey)}
                          </span>
                          {isCurrent && (
                            <span className="text-[8px] bg-brand-text text-brand-bg px-1.5 py-0.2 rounded font-black uppercase">
                              ฤดูนี้
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-brand-muted">รวมผลผลิตที่คาดฝัน</p>
                      </div>

                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-brand-faint border border-brand-border/40">
                        <Mascot mood={m.isSufficient ? "celebrate" : "sleepy"} size={32} />
                      </div>
                    </div>

                    {/* ส่วนกลางการ์ด: ดีไซน์รูปทรงกราฟิกโพรงไม้เก็บลูกนัทโอ๊ค (Acorn Hollows Visual) */}
                    <div className="relative w-full h-20 bg-brand-faint rounded-2xl border border-brand-border flex items-end overflow-hidden">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${fillPercentage}%` }}
                        transition={{ duration: 0.8, delay: idx * 0.1 }}
                        className={`w-full transition-all rounded-b-xl ${
                          m.isSufficient ? 'bg-[#E65F2B]' : 'bg-[#A63F1B]'
                        }`}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-1 text-center">
                        <span className="text-xs font-mono font-black text-stone-950 dark:text-stone-100">
                          {formatCurrency(m.totalIncome)}
                        </span>
                        <span className="text-[8px] font-bold text-brand-muted uppercase tracking-wider mt-0.5">
                          {fillPercentage.toFixed(0)}% ของรัง
                        </span>
                      </div>
                    </div>

                    {/* ด้านล่างการ์ด: ข้อมูลดุลบัญชีเสบียงประจำเดือน */}
                    <div className="pt-2 border-t border-brand-border/40 space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-brand-muted">เสบียงส่วนเกิน:</span>
                        <span className={`font-mono text-xs font-black ${m.isSufficient ? 'text-emerald-600 dark:text-emerald-400' : 'text-[#A63F1B] dark:text-[#FA7E52]'}`}>
                          {m.balance >= 0 ? '+' : ''}{formatCurrency(m.balance)}
                        </span>
                      </div>
                      {!m.isSufficient && (
                        <p className="text-[9px] text-[#A63F1B] dark:text-[#FA7E52] font-black leading-normal animate-pulse">
                          * ขาดเสบียงรอดตายอีก {formatCurrency(Math.abs(m.balance))}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* 4. Financial Goals Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h4 className="text-xs font-black tracking-widest text-brand-muted uppercase" title="เป้าหมายการจัดเก็บรังสำรองชิ้นใหญ่">
              เป้าออมสะสม
            </h4>
          </div>
          <button 
            onClick={() => onSwitchTab('split')}
            className="text-xs font-black text-[#E65F2B] dark:text-[#FFA473] hover:text-[#D98324] flex items-center gap-0.5"
          >
            ไปที่คลังขุดออม <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
          {goals.map(g => {
            const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
            return (
              <motion.div
                key={g.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => onOpenGoalDetail(g.id)}
                className="w-40 shrink-0 bg-brand-white border border-brand-border rounded-2xl p-4 cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden"
              >
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3 shadow-inner overflow-hidden border border-brand-border/40 bg-brand-faint"
                >
                  {g.imageUrl ? (
                    <img src={g.imageUrl} alt={g.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : (
                    <Sparkles className="w-6 h-6 text-[#E65F2B]" />
                  )}
                </div>
                <h5 className="text-sm font-bold text-brand-text truncate">{g.name}</h5>
                <p className="text-[10px] text-brand-muted mt-0.5">
                  สะสมแล้ว: <span className="font-extrabold text-stone-950 dark:text-white font-mono text-xs">{formatCurrency(g.current)}</span>
                </p>
                <div className="w-full h-1.5 bg-brand-faint rounded-full overflow-hidden mt-3 mb-1">
                  <div 
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: '#E65F2B' }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] font-semibold text-brand-muted">
                  <span className="text-[#E65F2B] dark:text-[#FFA473] font-black text-xs">{pct.toFixed(0)}%</span>
                  <span>เป้า <span className="font-extrabold text-stone-900 dark:text-stone-100 font-mono">{formatAbbreviatedTarget(g.target)}</span></span>
                </div>
              </motion.div>
            );
          })}
          
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onOpenAddGoal}
            className="w-36 shrink-0 bg-brand-white/40 dark:bg-stone-800/20 border-2 border-dashed border-brand-border rounded-2xl flex flex-col items-center justify-center gap-2 text-brand-muted hover:text-[#E65F2B] dark:hover:text-[#FFA473] hover:border-[#E65F2B]/40 hover:bg-brand-faint transition-all p-4"
          >
            <div className="w-10 h-10 rounded-full bg-brand-white border border-brand-border flex items-center justify-center text-brand-muted">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold">ขุดรังเก็บออมเพิ่ม</span>
          </motion.button>
        </div>
      </div>

      <VineDivider />

      {/* 4.5 บันทึกรับเงินด่วน (Quick Payment Recorder) */}
      <div className="bg-brand-white p-5 sm:p-6 rounded-3xl border border-brand-border/40 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div>
            <h4 className="text-base font-extrabold font-display text-brand-text flex items-center gap-1.5">
              บันทึกรับเงินด่วน <IconBolt className="w-3.5 h-3.5" />
            </h4>
            <p className="text-[11px] text-brand-muted">
              ค้นหาดีลงานค้างชำระจากทุกช่วงเวลา แล้วกดปุ่มรับเงินได้ทันทีโดยไม่ต้องเลื่อนหา!
            </p>
          </div>
          <span className="self-start sm:self-center text-[11px] font-extrabold text-brand-text bg-brand-faint px-3 py-1 rounded-full uppercase tracking-wider">
            ดีลรอเก็บเงินทั้งหมด: {unpaidJobs.length} งาน
          </span>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
          <input
            type="text"
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            className="w-full bg-brand-white border border-brand-border/60 hover:border-brand-border focus:border-[#E65F2B] rounded-2xl py-3 pl-10 pr-4 text-xs font-semibold text-brand-text placeholder-brand-muted/70 outline-none transition-all"
            placeholder="พิมพ์ค้นชื่อโปรเจกต์ หรือชื่อแบรนด์ลูกค้า เช่น 'ดีลวิดีโอ', 'Shopee'..."
          />
          {quickSearch && (
            <button 
              onClick={() => setQuickSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-muted hover:text-brand-text"
            >
              ล้าง
            </button>
          )}
        </div>

        {/* Alert bar with Mascot inside */}
        {creditTermReport.overdue.length > 0 && (
          <div 
            onClick={() => {
              playHapticAndSound();
              if (onSwitchTab) {
                onSwitchTab('report');
              }
            }}
            className="bg-brand-white border border-l-4 border-brand-border border-l-[#A63F1B] rounded-2xl p-3 flex items-center gap-3 cursor-pointer hover:bg-brand-faint/60 transition-all group"
          >
            <div className="w-10 h-10 bg-brand-faint border border-brand-border/40 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
              <Mascot mood="alert" size={32} className="animate-wiggle" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-brand-text group-hover:underline">
                ตรวจพบดีลค้างชำระ! มีแบรนด์ส่งมอบช้ากว่าดีลเครดิตเทอม (คลิกเพื่อเปิดแดชบอร์ดติดตามทวงถามเครดิตเทอม <IconArrowUpRight className="w-3 h-3 inline-block align-middle" />)
              </p>
            </div>
          </div>
        )}

        {/* Card list */}
        <div className="space-y-2.5">
          {filteredUnpaidJobs.slice(0, visibleCount).map((j: any) => {
            const isOverdue = j.isOverdue;

            return (
              <motion.div
                key={j.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-brand-white hover:border-brand-border/75 border border-brand-border/40 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* Coin icon circle */}
                  <div className="w-10 h-10 rounded-full bg-brand-faint flex items-center justify-center text-brand-muted border border-brand-border/30 shrink-0">
                    <Coins className="w-5 h-5" />
                  </div>
                  
                  {/* Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-extrabold text-xs text-brand-text truncate block max-w-[200px] sm:max-w-xs">
                        {j.name}
                      </span>
                      {isOverdue && (
                        <span className="text-[9px] font-extrabold text-pink-acc bg-pink-bg px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 shrink-0">
                          เกินดีล!
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-brand-muted font-semibold truncate block mt-0.5">
                      {j.client || 'เป้าหมายไม่ระบุแบรนด์'}
                    </span>
                  </div>
                </div>

                {/* Right actions and money */}
                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 pt-3 sm:pt-0 border-t sm:border-0 border-brand-border/20">
                  <div className="text-left sm:text-right">
                    <span className="font-mono font-black text-sm text-[#E65F2B] block">
                      {formatCurrency(j.pending)}
                    </span>
                    <span className={`text-[10px] font-bold block mt-0.5 ${isOverdue ? 'text-pink-acc' : 'text-brand-muted'}`}>
                      {j.daysText || 'ยังไม่ระบุวัน'}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      const today = new Date();
                      const localDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                      
                      triggerConfirm(
                        'บันทึกรับเงินครบถ้วน',
                        `คุณได้รับเงินจำนวน ${formatCurrency(j.pending)} จากดีลงาน "${j.name}" เรียบร้อยแล้วใช่ไหม?`,
                        () => {
                          if (onEditJob) {
                            onEditJob(j.id, {
                              status: 'done',
                              received: j.value - Math.round(j.value * ((j.whtRate || 0) / 100)),
                              pending: 0,
                              paymentStatus: 'paid',
                              payDate: localDateStr
                            });
                          }
                        }
                      );
                    }}
                    className="py-1.5 px-3.5 bg-brand-text hover:bg-brand-muted text-brand-white text-[10px] font-extrabold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>ได้เงินครบแล้ว</span>
                  </button>
                </div>
              </motion.div>
            );
          })}

          {filteredUnpaidJobs.length === 0 && (
            <div className="text-center py-10 bg-brand-white/40 border border-dashed border-brand-border rounded-2xl text-xs text-brand-muted font-medium flex flex-col items-center gap-1.5">
              <IconCoin className="w-5 h-5" />
              <span>ยินดีด้วยค้าบ! ไม่มีดีลงานค้างเก็บเงินเหลืออยู่เลย ทุกแบรนด์จ่ายครบหมดแล้ว!</span>
            </div>
          )}
        </div>

        {/* Load more / Actions bottom bar */}
        {filteredUnpaidJobs.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            {filteredUnpaidJobs.length > visibleCount ? (
              <button
                onClick={() => setVisibleCount(prev => prev + 4)}
                className="w-full sm:w-auto py-2.5 px-6 bg-brand-faint hover:bg-brand-border/30 text-brand-text text-xs font-extrabold rounded-2xl transition-all cursor-pointer border border-brand-border/40 text-center flex-1"
              >
                แสดงเพิ่มอีก {filteredUnpaidJobs.length - visibleCount} งาน (เหลือค้างอีก {unpaidJobs.length - visibleCount} งาน)
              </button>
            ) : visibleCount > 4 ? (
              <button
                onClick={() => setVisibleCount(4)}
                className="w-full sm:w-auto py-2.5 px-6 bg-brand-faint hover:bg-brand-border/30 text-brand-text text-xs font-extrabold rounded-2xl transition-all cursor-pointer border border-brand-border/40 text-center flex-1"
              >
                ย่อรายการกลับ
              </button>
            ) : (
              <div className="flex-1" />
            )}

            <button
              onClick={() => onSwitchTab('jobs')}
              className="w-full sm:w-auto py-2.5 px-5 bg-brand-white hover:bg-brand-faint border border-brand-border text-brand-text text-xs font-extrabold rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1"
            >
              <span>จัดการดีลทั้งหมด</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Lock, Loader2, AlertCircle, CheckCircle2, Moon, Sun, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ResetPasswordProps {
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  onComplete: () => void;
}

export default function ResetPassword({ darkMode, setDarkMode, onComplete }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!password || !confirmPassword) {
      setError('กรุณากรอกรหัสผ่านใหม่ให้ครบถ้วน');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษรเพื่อความปลอดภัย');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('การยืนยันรหัสผ่านใหม่ไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      setSuccess('เปลี่ยนรหัสผ่านใหม่สำเร็จแล้ว! กำลังนำคุณเข้าสู่ระบบ...');
      setPassword('');
      setConfirmPassword('');
      
      // Hold success message for 3 seconds, then complete
      setTimeout(() => {
        onComplete();
      }, 3000);

    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || 'ไม่สามารถเปลี่ยนรหัสผ่านใหม่ได้';
      if (errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('rate_limit') || errMsg.toLowerCase().includes('too many requests')) {
        errMsg = 'ส่งคำขอถี่เกินไป กรุณารอ 1-2 นาทีแล้วลองส่งใหม่อีกครั้งค่ะ';
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden transition-colors duration-300">
      
      {/* Background Decorative Rings */}
      <div className="absolute top-[-20%] left-[-10%] w-96 h-96 rounded-full bg-purple-600/5 dark:bg-purple-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 rounded-full bg-emerald-600/5 dark:bg-emerald-500/5 blur-3xl pointer-events-none" />

      {/* Theme Toggle (Top Right) */}
      <div className="absolute top-6 right-6">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-3 rounded-2xl bg-brand-white hover:bg-brand-faint/60 text-brand-text transition-all duration-300 active:scale-95 flex items-center justify-center border border-brand-border/40 shadow-sm cursor-pointer"
          title={darkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}
        >
          {darkMode ? (
            <Sun className="w-5 h-5 text-amber-500 fill-amber-500/10" />
          ) : (
            <Moon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 fill-emerald-600/10" />
          )}
        </button>
      </div>

      <div className="w-full max-w-md z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-600 dark:bg-purple-500 rounded-3xl text-white font-bold font-display shadow-lg shadow-purple-600/10 dark:shadow-purple-500/5 mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-display font-extrabold tracking-tight text-brand-text sm:text-3xl">
            ตั้งค่ารหัสผ่านใหม่
          </h2>
          <p className="mt-1.5 text-xs font-bold text-brand-muted uppercase tracking-wider">
            โปรดกำหนดรหัสผ่านใหม่สำหรับบัญชีของคุณ
          </p>
        </div>

        {/* Form Card */}
        <motion.div
          layout
          className="bg-brand-white border border-brand-border/40 rounded-3xl p-6 sm:p-8 shadow-xl shadow-brand-text/5 dark:shadow-none"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-extrabold text-sm text-brand-text flex items-center gap-1.5">
              กำหนดรหัสผ่านความปลอดภัยสูง
            </h3>
            <span className="text-[10px] font-mono text-brand-muted bg-brand-faint px-2.5 py-1 rounded-md border border-brand-border/20">
              รักษาความปลอดภัย
            </span>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 p-3.5 rounded-2xl bg-pink-bg border border-pink-acc/10 text-pink-acc text-xs font-medium flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 p-3.5 rounded-2xl bg-green-bg border border-green-acc/10 text-green-acc text-xs font-medium flex items-start gap-2.5 animate-pulse"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                รหัสผ่านใหม่ (New Password)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                  <Lock className="w-4.5 h-4.5" />
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="รหัสผ่านใหม่ 6 ตัวขึ้นไป"
                  required
                  disabled={loading || !!success}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-purple-600/10 focus:border-purple-600 dark:focus:ring-purple-400/10 dark:focus:border-purple-400 outline-none transition-all placeholder:text-brand-muted/50"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                ยืนยันรหัสผ่านใหม่ (Confirm New Password)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                  <Lock className="w-4.5 h-4.5" />
                </span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="ป้อนรหัสผ่านใหม่อีกครั้ง"
                  required
                  disabled={loading || !!success}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-purple-600/10 focus:border-purple-600 dark:focus:ring-purple-400/10 dark:focus:border-purple-400 outline-none transition-all placeholder:text-brand-muted/50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !!success}
              className="w-full py-3.5 px-4 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600 text-white font-extrabold rounded-2xl text-xs shadow-md shadow-purple-600/10 dark:shadow-none hover:shadow-lg hover:shadow-purple-600/15 cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังบันทึกรหัสผ่านใหม่...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  บันทึกรหัสผ่านใหม่
                </>
              )}
            </button>
          </form>

          <div className="mt-5 p-4 rounded-2xl bg-brand-faint/60 border border-brand-border/20 flex gap-2.5 items-start text-[10px] text-brand-muted leading-relaxed">
            <ShieldAlert className="w-4.5 h-4.5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-brand-text block mb-0.5">คำแนะนำด้านความปลอดภัย:</strong>
              ควรตั้งรหัสผ่านที่คาดเดาได้ยากโดยผสมผสานตัวอักษรพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษเพื่อป้องกันการเข้าถึงจากผู้ไม่ประสงค์ดี
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Mail, Lock, Loader2, AlertCircle, CheckCircle2, Moon, Sun, ArrowRight, UserPlus, LogIn, KeyRound, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Mascot, MascotMood } from './Mascot';

interface LoginProps {
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  onGuestLogin: (email: string) => void;
}

export default function Login({ darkMode, setDarkMode, onGuestLogin }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mascotMood, setMascotMood] = useState<MascotMood>('happy');

  React.useEffect(() => {
    if (error) {
      setMascotMood('alert');
    } else if (success) {
      setMascotMood('celebrate');
    } else {
      setMascotMood('happy');
    }
  }, [error, success]);

  // Password recovery states
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'verify'>('request');
  const [otpToken, setOtpToken] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (isSignUp && password !== confirmPassword) {
      setError('รหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้งค่ะ');
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        const { error: signUpErr, data } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpErr) throw signUpErr;
        
        if (data?.session) {
          setSuccess('สมัครสมาชิกและเข้าสู่ระบบสำเร็จแล้ว!');
        } else {
          setSuccess('สมัครสมาชิกสำเร็จแล้ว! กรุณาตรวจสอบอีเมลของคุณเพื่อยืนยันการสมัครสมาชิกก่อนเข้าใช้งานค่ะ (หรือลองเข้าสู่ระบบได้เลยหากระบบของคุณไม่ได้บังคับยืนยันอีเมล)');
        }
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInErr) throw signInErr;
      }
    } catch (err: any) {
      let message = err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง';
      if (message.toLowerCase().includes('invalid login credentials') || message.toLowerCase().includes('wrong password') || message.toLowerCase().includes('user not found') || message.toLowerCase().includes('invalid_credentials')) {
        message = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้งค่ะ';
      } else if (message.toLowerCase().includes('email already in use') || message.toLowerCase().includes('user already exists')) {
        message = 'อีเมลนี้ถูกใช้งานแล้วในระบบ กรุณาใช้คุณลักษณะเข้าสู่ระบบหรือกู้คืนรหัสผ่านค่ะ';
      } else if (message.toLowerCase().includes('signup disabled')) {
        message = 'การสมัครสมาชิกถูกปิดใช้งานชั่วคราวในระบบ';
      } else if (
        message.toLowerCase().includes('too many requests') ||
        message.toLowerCase().includes('security purposes')
      ) {
        message = 'ระบบตรวจพบการส่งคำขอถี่เกินไปชั่วคราว เพื่อความปลอดภัยกรุณารอประมาณ 1-2 นาทีแล้วลองใหม่อีกครั้ง หรือหากต้องการเข้าทดสอบระบบทันทีสามารถกดปุ่ม "เข้าใช้งานโหมดผู้เยี่ยมชม" ด้านล่างได้เลยค่ะ';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetErr) throw resetErr;
      setSuccess('ระบบได้ส่งรหัสยืนยันไปยัง ' + email + ' เรียบร้อยแล้วค่ะ! กรุณาเช็คกล่องข้อความ (และเมลขยะ/Spam) แล้วกรอกรหัสด้านล่างเพื่อตั้งรหัสผ่านใหม่');
      setRecoveryStep('verify');
    } catch (err: any) {
      let message = err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email,
        token: otpToken,
        type: 'recovery',
      });
      if (verifyErr) throw verifyErr;
      // Supabase emits a PASSWORD_RECOVERY auth event on success, which the
      // app listens for (App.tsx) and switches to the "set new password" screen.
    } catch (err: any) {
      let message = err.message || 'รหัสไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่อีกครั้ง';
      if (message.toLowerCase().includes('expired') || message.toLowerCase().includes('invalid') || message.toLowerCase().includes('token')) {
        message = 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่อีกครั้งค่ะ';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: resendErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resendErr) throw resendErr;
      setOtpToken('');
      setSuccess('ส่งรหัสยืนยันใหม่ไปยัง ' + email + ' เรียบร้อยแล้วค่ะ');
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: googleErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        }
      });
      if (googleErr) throw googleErr;
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อด้วย Google');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden transition-colors duration-300">
      
      {/* Background Decorative Rings */}
      <div className="absolute top-[-20%] left-[-10%] w-96 h-96 rounded-full bg-orange-600/5 dark:bg-orange-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 rounded-full bg-orange-600/5 dark:bg-orange-500/5 blur-3xl pointer-events-none" />

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
            <Moon className="w-5 h-5 text-orange-600 dark:text-orange-400 fill-orange-600/10" />
          )}
        </button>
      </div>

      <div className="w-full max-w-md z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <Mascot mood={mascotMood} size={100} className="mb-2" />
          <h2 className="text-2xl font-display font-extrabold tracking-tight text-brand-text sm:text-3xl">
            The Cash Squirrel
          </h2>
          <p className="mt-1.5 text-xs font-bold text-[#E65F2B] dark:text-[#FFA473] uppercase tracking-wider">
            คลังกระรอกตุนเสบียง ระบบติดตามกระแสเงินสด
          </p>
        </div>

        {/* Form Card */}
        <motion.div
          layout
          className="bg-brand-white border border-brand-border/40 rounded-3xl p-6 sm:p-8 shadow-xl shadow-brand-text/5 dark:shadow-none"
        >
          {/* Tabs for Login / SignUp (only show if not in Forgot Password mode) */}
          {!isForgotPassword ? (
            <div className="flex p-1 bg-brand-bg/50 border border-brand-border/20 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setIsForgotPassword(false);
                  setRecoveryStep('request');
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  !isSignUp
                    ? 'bg-brand-white text-[#E65F2B] dark:text-[#FFA473] shadow-sm border border-brand-border/10'
                    : 'text-brand-muted hover:text-brand-text'
                }`}
              >
                <LogIn className="w-4 h-4" />
                เข้าสู่ระบบ
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setIsForgotPassword(false);
                  setRecoveryStep('request');
                  setError(null);
                  setSuccess(null);
                }}
                className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSignUp
                    ? 'bg-brand-white text-[#E65F2B] dark:text-[#FFA473] shadow-sm border border-brand-border/10'
                    : 'text-brand-muted hover:text-brand-text'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                สมัครสมาชิก
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-6">
              <button
                type="button"
                onClick={() => {
                  if (recoveryStep === 'verify') {
                    setRecoveryStep('request');
                  } else {
                    setIsForgotPassword(false);
                  }
                  setError(null);
                  setSuccess(null);
                }}
                className="p-1.5 rounded-lg bg-brand-bg hover:bg-brand-faint border border-brand-border/40 text-brand-muted hover:text-brand-text transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="font-display font-extrabold text-lg text-brand-text">
                {recoveryStep === 'request' ? 'กู้คืนรหัสผ่าน' : 'ตั้งรหัสผ่านใหม่'}
              </h3>
            </div>
          )}

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 p-3.5 rounded-2xl bg-pink-bg border border-pink-acc/10 text-pink-acc text-xs font-medium flex items-start gap-2.5"
              >
                <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 p-3.5 rounded-2xl bg-green-bg border border-green-acc/10 text-green-acc text-xs font-medium flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {isForgotPassword ? (
            /* Forgot Password Form Flow */
            recoveryStep === 'request' ? (
              <form onSubmit={handleResetRequest} className="space-y-4">
                <p className="text-[11px] text-brand-muted leading-relaxed">
                  กรอกอีเมลของคุณเพื่อรับรหัสยืนยันสำหรับตั้งรหัสผ่านใหม่ เพื่อความปลอดภัยของบัญชีคุณค่ะ
                </p>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                    อีเมลของคุณ (Your Email)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                      <Mail className="w-4.5 h-4.5" />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="example@yourdomain.com"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#E65F2B] hover:bg-[#D98324] dark:bg-[#E65F2B] dark:hover:bg-[#FFA473] text-white font-extrabold rounded-2xl text-xs shadow-md shadow-orange-600/10 dark:shadow-none hover:shadow-lg hover:shadow-orange-600/15 cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      กำลังส่งลิงก์กู้คืนรหัสผ่าน...
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      ส่งคำขอกู้คืนรหัสผ่าน
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* OTP Verification + New Password Form */
              <form onSubmit={handleVerifyAndReset} className="space-y-4">
                <p className="text-[11px] text-brand-muted leading-relaxed">
                  กรอกรหัสยืนยันที่ส่งไปยัง <strong className="text-brand-text">{email}</strong> เพื่อยืนยันตัวตนและเข้าสู่ขั้นตอนตั้งรหัสผ่านใหม่
                </p>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                    รหัสยืนยัน (Verification Code)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                      <KeyRound className="w-4.5 h-4.5" />
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={12}
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      placeholder="กรอกรหัสยืนยัน"
                      required
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-base tracking-[0.5em] text-center font-mono focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50 placeholder:tracking-normal placeholder:text-xs placeholder:font-sans"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otpToken.length < 6}
                  className="w-full py-3.5 px-4 bg-[#E65F2B] hover:bg-[#D98324] dark:bg-[#E65F2B] dark:hover:bg-[#FFA473] text-white font-extrabold rounded-2xl text-xs shadow-md shadow-orange-600/10 dark:shadow-none hover:shadow-lg hover:shadow-orange-600/15 cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      กำลังตรวจสอบรหัส...
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      ยืนยันรหัส
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading}
                  className="w-full text-center text-[11px] font-bold text-brand-muted hover:text-[#E65F2B] dark:hover:text-[#FFA473] cursor-pointer transition-all disabled:opacity-50"
                >
                  ไม่ได้รับรหัส? ส่งอีกครั้ง
                </button>
              </form>
            )
          ) : (
            /* Login & Sign Up Form */
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                  อีเมล (Email)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                    <Mail className="w-4.5 h-4.5" />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@yourdomain.com"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted">
                    รหัสผ่าน (Password)
                  </label>
                  {!isSignUp && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setError(null);
                        setSuccess(null);
                      }}
                      className="text-[11px] font-bold text-[#E65F2B] dark:text-[#FFA473] hover:underline cursor-pointer"
                    >
                      ลืมรหัสผ่าน?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                    <Lock className="w-4.5 h-4.5" />
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignUp ? 'ตั้งรหัสผ่าน 6 ตัวขึ้นไป' : 'กรอกรหัสผ่านของคุณ'}
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                  />
                </div>
              </div>

              {isSignUp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-brand-muted mb-1.5">
                    ยืนยันรหัสผ่าน (Confirm Password)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-brand-muted">
                      <Lock className="w-4.5 h-4.5" />
                    </span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="ป้อนรหัสผ่านอีกครั้ง"
                      required={isSignUp}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-brand-border/60 bg-brand-bg/20 text-brand-text text-xs focus:ring-4 focus:ring-orange-500/10 focus:border-[#E65F2B] dark:focus:ring-orange-500/5 dark:focus:border-[#FFA473] outline-none transition-all placeholder:text-brand-muted/50"
                    />
                  </div>
                </motion.div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-[#E65F2B] hover:bg-[#D98324] dark:bg-[#E65F2B] dark:hover:bg-[#FFA473] text-white font-extrabold rounded-2xl text-xs shadow-md shadow-orange-600/10 dark:shadow-none hover:shadow-lg hover:shadow-orange-600/15 cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังดำเนินการ...
                  </>
                ) : isSignUp ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    สมัครสมาชิกใหม่
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    เข้าสู่ระบบ
                  </>
                )}
              </button>
            </form>
          )}

          <div className="space-y-3 mt-4">
            <button
              type="button"
              onClick={() => {
                const guestEmail = email.trim() || 'guest_demo@cashflow.com';
                onGuestLogin(guestEmail);
              }}
              className="w-full py-3.5 px-4 bg-orange-500/10 dark:bg-orange-500/5 hover:bg-orange-500/15 text-[#E65F2B] dark:text-[#FFA473] font-extrabold rounded-2xl text-xs border border-orange-500/20 cursor-pointer flex items-center justify-center gap-2 select-none active:scale-[0.98] transition-all shadow-sm"
            >
              ทดลองใช้งานระบบฟรี
            </button>
          </div>
        </motion.div>

        {/* Footer info */}
        <p className="text-center mt-6 text-[10px] text-brand-muted leading-relaxed max-w-[280px] mx-auto">
          ข้อมูลถูกเข้ารหัสปลอดภัยด้วยบริการรับรองตัวตนสากลจาก Supabase
        </p>
      </div>
    </div>
  );
}

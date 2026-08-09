import React, { useRef, useState } from 'react';
import { Mic, Square, Loader2, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../supabaseClient';
import { IconSpark } from './icons';
import { Mascot } from './Mascot';

// Speaks a follow-up question out loud so the user doesn't have to read it -- best-effort only,
// silently does nothing if the browser has no speechSynthesis support or no Thai voice.
function speakThai(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'th-TH';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  } catch {
    // TTS is a nice-to-have here; the question text is still shown on screen regardless.
  }
}

export interface VoiceParsedJobFields {
  name?: string;
  client?: string;
  type?: string;
  value?: number;
  creditTerm?: number;
  note?: string;
  paymentStatus?: string; // 'paid' | 'partial' | 'pending'
  receivedAmount?: number;
}

interface VoiceJobRecorderProps {
  isPro: boolean;
  onSwitchTab: (tabId: string) => void;
  triggerAlert: (title: string, message: string) => void;
  onParsed: (fields: VoiceParsedJobFields) => void;
}

type Status = 'idle' | 'recording' | 'processing' | 'awaiting_followup';

const MAX_TURNS = 3;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function VoiceJobRecorder({ isPro, onSwitchTab, triggerAlert, onParsed }: VoiceJobRecorderProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [seconds, setSeconds] = useState(0);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fieldsRef = useRef<VoiceParsedJobFields>({});
  const turnRef = useRef(0);
  const questionRef = useRef<string>('');

  const reset = () => {
    fieldsRef.current = {};
    turnRef.current = 0;
    questionRef.current = '';
    setFollowUpQuestion('');
    setStatus('idle');
  };

  const handleStop = async (mimeType: string) => {
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size === 0) throw new Error('ไม่ได้บันทึกเสียงไว้ ลองพูดใหม่อีกครั้งครับ');

      const base64 = await blobToBase64(blob);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('ไม่พบเซสชันผู้ใช้ กรุณาล็อกอินใหม่');

      turnRef.current += 1;

      const res = await fetch('/api/parse-voice-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType,
          priorFields: fieldsRef.current,
          priorQuestion: questionRef.current || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'แปลงเสียงไม่สำเร็จ');

      const newFields = json as VoiceParsedJobFields;
      // Merge: only overwrite a field when this turn actually returned something for it.
      fieldsRef.current = { ...fieldsRef.current, ...Object.fromEntries(Object.entries(newFields).filter(([, v]) => v !== '' && v !== undefined && v !== null)) };

      // Decide deterministically whether to ask a follow-up -- asking the model to make this
      // call itself turned out unreliable with real audio input, so it's plain JS here instead.
      const hasValue = typeof fieldsRef.current.value === 'number' && fieldsRef.current.value > 0;
      const hasPaymentStatus = !!fieldsRef.current.paymentStatus;

      let nextQuestion = '';
      if (!hasValue) {
        nextQuestion = 'งานนี้มูลค่าเท่าไหร่ครับ พูดยอดเงินมาได้เลยครับ';
      } else if (!hasPaymentStatus) {
        nextQuestion = 'ตอนนี้ได้รับเงินหรือยังครับ จ่ายครบแล้ว มัดจำมาบางส่วน หรือยังไม่ได้จ่ายเลยครับ';
      }

      if (nextQuestion && turnRef.current < MAX_TURNS) {
        questionRef.current = nextQuestion;
        setFollowUpQuestion(nextQuestion);
        setStatus('awaiting_followup');
        speakThai(nextQuestion);
      } else {
        onParsed(fieldsRef.current);
        reset();
      }
    } catch (err: any) {
      triggerAlert('แปลงเสียงไม่สำเร็จ', err.message || 'ลองพูดใหม่อีกครั้ง หรือกรอกฟอร์มด้วยตัวเองแทนได้เลยครับ');
      // Keep whatever we already gathered rather than throwing it away on a mid-conversation error.
      if (Object.keys(fieldsRef.current).length > 0) onParsed(fieldsRef.current);
      reset();
    }
  };

  const startRecording = async () => {
    window.speechSynthesis?.cancel(); // don't let the question keep talking over the mic
    if (!isPro) {
      onSwitchTab('plans');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => handleStop(mimeType);
      recorder.start();
      mediaRecorderRef.current = recorder;
      setStatus('recording');
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      triggerAlert('เข้าถึงไมโครโฟนไม่ได้', 'กรุณาอนุญาตให้เบราว์เซอร์ใช้ไมโครโฟน แล้วลองใหม่อีกครั้งครับ');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setStatus('processing');
  };

  const skipRemaining = () => {
    if (Object.keys(fieldsRef.current).length > 0) onParsed(fieldsRef.current);
    reset();
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  if (status === 'recording') {
    return (
      <button
        type="button"
        onClick={stopRecording}
        className="w-full py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white transition-all cursor-pointer"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
        </span>
        กำลังฟัง... {mm}:{ss}
        <Square className="w-3 h-3 fill-current" />
        หยุดบันทึก
      </button>
    );
  }

  if (status === 'processing') {
    return (
      <button
        type="button"
        disabled
        className="w-full py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 bg-brand-faint dark:bg-stone-800 text-brand-muted cursor-wait"
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        กำลังแปลงเสียงเป็นข้อมูล...
      </button>
    );
  }

  if (status === 'awaiting_followup') {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2.5 p-3.5 rounded-2xl bg-[#E65F2B]/5 border border-[#E65F2B]/20"
        >
          <div className="flex items-start gap-2.5">
            <Mascot mood="happy" size={32} className="shrink-0" />
            <p className="text-[11px] font-bold text-brand-text dark:text-neutral-200 leading-relaxed pt-1 flex-1">
              {followUpQuestion}
            </p>
            <button
              type="button"
              onClick={() => speakThai(followUpQuestion)}
              title="ฟังคำถามอีกครั้ง"
              className="shrink-0 p-1.5 rounded-lg text-[#E65F2B] dark:text-[#FFA473] hover:bg-[#E65F2B]/10 transition-colors cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={startRecording}
              className="flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 bg-[#E65F2B] hover:bg-[#D8551F] text-white transition-all cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              ตอบด้วยเสียง
            </button>
            <button
              type="button"
              onClick={skipRemaining}
              className="py-2.5 px-3.5 rounded-xl text-xs font-black text-brand-muted hover:text-brand-text border border-brand-border transition-all cursor-pointer"
            >
              ข้าม กรอกเอง
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      className="w-full py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 border border-dashed border-[#E65F2B]/40 text-[#E65F2B] dark:text-[#FFA473] hover:bg-[#E65F2B]/5 transition-all cursor-pointer"
    >
      <Mic className="w-3.5 h-3.5" />
      พูดกรอกข้อมูลงานด้วยเสียง
      {!isPro && <IconSpark className="w-3 h-3" />}
    </button>
  );
}

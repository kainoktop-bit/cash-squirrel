import React, { useRef, useState } from 'react';
import { Mic, Square, Loader2, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../supabaseClient';
import { IconSpark } from './icons';
import { Mascot } from './Mascot';

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

type Status = 'idle' | 'asking' | 'recording' | 'processing';

// Fixed order the user asked for: walk through every field from first to last, never
// skipping straight to money-related questions -- name, then client, then type, etc.
const STEPS: { field: keyof VoiceParsedJobFields; question: string }[] = [
  { field: 'name', question: 'ชื่องานหรือโปรเจกต์นี้ ชื่ออะไรครับ' },
  { field: 'client', question: 'ใครเป็นคนจ้างครับ ลูกค้าหรือแบรนด์ไหน' },
  { field: 'type', question: 'งานนี้เป็นงานประเภทไหนครับ เช่น โพสต์รีวิว วิดีโอ หรือให้คำปรึกษา' },
  { field: 'value', question: 'มูลค่างานนี้เท่าไหร่ครับ พูดยอดเงินมาได้เลยครับ' },
  { field: 'creditTerm', question: 'งานนี้มีเครดิตเทอมกี่วันครับ หรือได้รับเงินทันทีเลยครับ' },
  { field: 'paymentStatus', question: 'ตอนนี้ได้รับเงินหรือยังครับ จ่ายครบแล้ว มัดจำมาบางส่วน หรือยังไม่ได้จ่ายเลยครับ' },
];

const MAX_RETRIES_PER_STEP = 2;

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
  const [stepIndex, setStepIndex] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fieldsRef = useRef<VoiceParsedJobFields>({});
  const stepIndexRef = useRef(0);
  const retriesRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const reset = () => {
    fieldsRef.current = {};
    stepIndexRef.current = 0;
    retriesRef.current = 0;
    setStepIndex(0);
    setStatus('idle');
  };

  const stopAnyPlayback = () => {
    audioRef.current?.pause();
    audioRef.current = null;
  };

  // Fetches natural-sounding speech from Gemini's TTS and plays it -- best-effort, the
  // question text is always shown on screen too so a playback failure isn't blocking.
  const speak = async (text: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/speak-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (!json.audioBase64) return;
      stopAnyPlayback();
      const audio = new Audio(`data:audio/wav;base64,${json.audioBase64}`);
      audioRef.current = audio;
      audio.play().catch(() => {});
    } catch {
      // Silent question text on screen is still enough to proceed without spoken audio.
    }
  };

  const askStep = (index: number) => {
    stepIndexRef.current = index;
    retriesRef.current = 0;
    setStepIndex(index);
    setStatus('asking');
    speak(STEPS[index].question);
  };

  const finish = () => {
    onParsed(fieldsRef.current);
    reset();
  };

  const handleStop = async (mimeType: string) => {
    const step = STEPS[stepIndexRef.current];
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size === 0) throw new Error('ไม่ได้บันทึกเสียงไว้ ลองพูดใหม่อีกครั้งครับ');

      const base64 = await blobToBase64(blob);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('ไม่พบเซสชันผู้ใช้ กรุณาล็อกอินใหม่');

      const res = await fetch('/api/parse-voice-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType,
          priorFields: fieldsRef.current,
          targetField: step.field,
          questionText: step.question,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'แปลงเสียงไม่สำเร็จ');

      const newFields = json as VoiceParsedJobFields;
      fieldsRef.current = {
        ...fieldsRef.current,
        ...Object.fromEntries(Object.entries(newFields).filter(([, v]) => v !== '' && v !== undefined && v !== null)),
      };

      const gotAnswerForStep =
        step.field === 'paymentStatus' ? !!fieldsRef.current.paymentStatus : fieldsRef.current[step.field] !== undefined;

      if (!gotAnswerForStep && retriesRef.current < MAX_RETRIES_PER_STEP) {
        // Didn't catch an answer for this specific field -- ask the same question again
        // rather than silently moving on and leaving it blank.
        retriesRef.current += 1;
        setStatus('asking');
        speak('ขอโทษครับ ไม่ได้ยินชัดเจน ' + step.question);
        return;
      }

      const nextIndex = stepIndexRef.current + 1;
      if (nextIndex < STEPS.length) {
        askStep(nextIndex);
      } else {
        finish();
      }
    } catch (err: any) {
      triggerAlert('แปลงเสียงไม่สำเร็จ', err.message || 'ลองพูดใหม่อีกครั้ง หรือกรอกฟอร์มด้วยตัวเองแทนได้เลยครับ');
      if (Object.keys(fieldsRef.current).length > 0) {
        finish();
      } else {
        reset();
      }
    }
  };

  const startRecording = async () => {
    stopAnyPlayback();
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

  const start = () => {
    if (!isPro) {
      onSwitchTab('plans');
      return;
    }
    askStep(0);
  };

  const skipStep = () => {
    stopAnyPlayback();
    const nextIndex = stepIndexRef.current + 1;
    if (nextIndex < STEPS.length) {
      askStep(nextIndex);
    } else {
      finish();
    }
  };

  const skipAll = () => {
    stopAnyPlayback();
    finish();
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const currentQuestion = STEPS[stepIndex]?.question || '';

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

  if (status === 'asking') {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2.5 p-3.5 rounded-2xl bg-[#E65F2B]/5 border border-[#E65F2B]/20"
        >
          <div className="flex items-center justify-between text-[9px] font-black text-brand-muted uppercase tracking-wide">
            <span>คำถามที่ {stepIndex + 1} / {STEPS.length}</span>
          </div>
          <div className="flex items-start gap-2.5">
            <Mascot mood="happy" size={32} className="shrink-0" />
            <p className="text-[11px] font-bold text-brand-text dark:text-neutral-200 leading-relaxed pt-1 flex-1">
              {currentQuestion}
            </p>
            <button
              type="button"
              onClick={() => speak(currentQuestion)}
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
              onClick={skipStep}
              className="py-2.5 px-3 rounded-xl text-xs font-black text-brand-muted hover:text-brand-text border border-brand-border transition-all cursor-pointer"
            >
              ข้ามข้อนี้
            </button>
          </div>
          <button
            type="button"
            onClick={skipAll}
            className="w-full text-[10px] font-bold text-brand-muted hover:text-brand-text underline underline-offset-2 cursor-pointer"
          >
            ข้ามที่เหลือทั้งหมด กรอกเอง
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      className="w-full py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 border border-dashed border-[#E65F2B]/40 text-[#E65F2B] dark:text-[#FFA473] hover:bg-[#E65F2B]/5 transition-all cursor-pointer"
    >
      <Mic className="w-3.5 h-3.5" />
      พูดกรอกข้อมูลงานด้วยเสียง
      {!isPro && <IconSpark className="w-3 h-3" />}
    </button>
  );
}

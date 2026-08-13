import React, { useEffect, useRef, useState } from 'react';
import { Mic, Loader2, Volume2 } from 'lucide-react';
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

// Fixed order the user asked for: name, then client, then type, etc -- but any step is
// skipped automatically once its field is already known (answered early, or incidentally
// mentioned while answering an earlier question) or explicitly declined by the user.
const STEPS: { field: keyof VoiceParsedJobFields; question: string }[] = [
  { field: 'name', question: 'ชื่องานหรือโปรเจกต์นี้ ชื่ออะไรครับ' },
  { field: 'client', question: 'ใครเป็นคนจ้างครับ ลูกค้าหรือแบรนด์ไหน' },
  { field: 'type', question: 'งานนี้เป็นงานประเภทไหนครับ เช่น โพสต์รีวิว วิดีโอ หรือให้คำปรึกษา' },
  { field: 'value', question: 'มูลค่างานนี้เท่าไหร่ครับ พูดยอดเงินมาได้เลยครับ' },
  { field: 'creditTerm', question: 'งานนี้มีเครดิตเทอมกี่วันครับ หรือได้รับเงินทันทีเลยครับ' },
  { field: 'paymentStatus', question: 'ตอนนี้ได้รับเงินหรือยังครับ จ่ายครบแล้ว มัดจำมาบางส่วน หรือยังไม่ได้จ่ายเลยครับ' },
];

const MAX_RETRIES_PER_STEP = 1;

// Voice-activity detection tuning -- lets the conversation flow like a real call instead of
// requiring a manual stop tap every turn: keep listening while the user talks, auto-stop
// shortly after they go quiet, and give up if they never say anything at all.
const SPEECH_RMS_THRESHOLD = 0.02;
const SILENCE_MS_TO_STOP = 1300;
const NO_SPEECH_TIMEOUT_MS = 4500;
const MAX_RECORDING_MS = 20000;

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

function isFieldFilled(fields: VoiceParsedJobFields, field: keyof VoiceParsedJobFields): boolean {
  if (field === 'paymentStatus') return !!fields.paymentStatus;
  return fields[field] !== undefined;
}

export function VoiceJobRecorder({ isPro, onSwitchTab, triggerAlert, onParsed }: VoiceJobRecorderProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [stepIndex, setStepIndex] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const fieldsRef = useRef<VoiceParsedJobFields>({});
  const declinedRef = useRef<Set<keyof VoiceParsedJobFields>>(new Set());
  const stepIndexRef = useRef(0);
  const retriesRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number | null>(null);
  // When a manual skip stops an in-flight recording, this suppresses the recorder's normal
  // onstop handler so the (irrelevant, partial) audio never gets sent for extraction.
  const suppressNextStopRef = useRef(false);
  // The 6 questions are fixed text, so their TTS audio is generated once up front instead of
  // per-turn -- otherwise every question would wait on a fresh Gemini TTS round trip right
  // when the user is expecting the conversation to keep moving.
  const questionAudioCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    return () => {
      cleanupVad();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      stopAnyPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupVad = () => {
    if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
    vadRafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const reset = () => {
    cleanupVad();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    fieldsRef.current = {};
    declinedRef.current = new Set();
    stepIndexRef.current = 0;
    retriesRef.current = 0;
    setStepIndex(0);
    setStatus('idle');
  };

  const stopAnyPlayback = () => {
    audioRef.current?.pause();
    audioRef.current = null;
  };

  const playAudioBase64 = (audioBase64: string, onDone?: () => void) => {
    stopAnyPlayback();
    const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
    audioRef.current = audio;
    audio.onended = () => onDone?.();
    audio.onerror = () => onDone?.();
    audio.play().catch(() => onDone?.());
  };

  // Fetches natural-sounding speech from Gemini's TTS and plays it -- best-effort. If it
  // fails, onDone still fires so the conversation keeps moving without spoken audio. Reuses
  // a cached clip when this exact text was already synthesized (see questionAudioCacheRef).
  const speak = async (text: string, onDone?: () => void) => {
    const cached = questionAudioCacheRef.current.get(text);
    if (cached) {
      playAudioBase64(cached, onDone);
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { onDone?.(); return; }
      const res = await fetch('/api/speak-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) { onDone?.(); return; }
      const json = await res.json();
      if (!json.audioBase64) { onDone?.(); return; }
      questionAudioCacheRef.current.set(text, json.audioBase64);
      playAudioBase64(json.audioBase64, onDone);
    } catch {
      onDone?.();
    }
  };

  // Kicks off TTS generation for every fixed question in parallel as soon as the user starts
  // the wizard, so by the time each one is actually needed it plays back instantly instead of
  // making the user wait mid-conversation.
  const prefetchQuestionAudio = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;
    await Promise.all(
      STEPS.map(async (step) => {
        if (questionAudioCacheRef.current.has(step.question)) return;
        try {
          const res = await fetch('/api/speak-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ text: step.question }),
          });
          if (!res.ok) return;
          const json = await res.json();
          if (json.audioBase64) questionAudioCacheRef.current.set(step.question, json.audioBase64);
        } catch {
          // best-effort -- speak() falls back to a live fetch if this never lands
        }
      })
    );
  };

  // Finds the next step whose field isn't already known or declined -- lets the wizard skip
  // ahead instead of nagging about things the user already answered or waved off.
  const findNextStepIndex = (from: number): number => {
    for (let i = from; i < STEPS.length; i++) {
      const field = STEPS[i].field;
      if (declinedRef.current.has(field)) continue;
      if (isFieldFilled(fieldsRef.current, field)) continue;
      return i;
    }
    return STEPS.length;
  };

  const askStep = (index: number) => {
    stepIndexRef.current = index;
    retriesRef.current = 0;
    setStepIndex(index);
    setStatus('asking');
    speak(STEPS[index].question, () => startRecording());
  };

  const finish = () => {
    onParsed(fieldsRef.current);
    reset();
  };

  const advance = () => {
    const nextIndex = findNextStepIndex(stepIndexRef.current + 1);
    if (nextIndex < STEPS.length) {
      askStep(nextIndex);
    } else {
      finish();
    }
  };

  const handleStop = async (mimeType: string) => {
    const step = STEPS[stepIndexRef.current];
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size === 0) throw new Error('ไม่ได้ยินเสียงเลยครับ');

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

      const { declined, ...newFields } = json as VoiceParsedJobFields & { declined?: boolean };
      fieldsRef.current = {
        ...fieldsRef.current,
        ...Object.fromEntries(Object.entries(newFields).filter(([, v]) => v !== '' && v !== undefined && v !== null)),
      };

      if (declined) {
        declinedRef.current.add(step.field);
        advance();
        return;
      }

      if (!isFieldFilled(fieldsRef.current, step.field) && retriesRef.current < MAX_RETRIES_PER_STEP) {
        // Didn't catch an answer for this specific field -- ask once more rather than
        // silently moving on, but don't nag past that. Reuses the cached clip (no new TTS
        // round trip) so the retry itself doesn't add any extra delay.
        retriesRef.current += 1;
        setStatus('asking');
        speak(step.question, () => startRecording());
        return;
      }

      advance();
    } catch (err: any) {
      triggerAlert('แปลงเสียงไม่สำเร็จ', err.message || 'ลองพูดใหม่อีกครั้ง หรือกรอกฟอร์มด้วยตัวเองแทนได้เลยครับ');
      if (Object.keys(fieldsRef.current).length > 0) {
        finish();
      } else {
        reset();
      }
    }
  };

  // Watches mic volume so recording stops itself shortly after the user finishes talking --
  // no manual stop tap needed, closer to a live back-and-forth than a walkie-talkie.
  const startVad = (stream: MediaStream, onAutoStop: () => void) => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtx();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.fftSize);

    const startedAt = Date.now();
    let hasSpoken = false;
    let lastVoiceAt = Date.now();

    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const norm = (dataArray[i] - 128) / 128;
        sumSquares += norm * norm;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const now = Date.now();

      if (rms > SPEECH_RMS_THRESHOLD) {
        hasSpoken = true;
        lastVoiceAt = now;
      }

      const elapsed = now - startedAt;
      if (elapsed > MAX_RECORDING_MS) { onAutoStop(); return; }
      if (!hasSpoken && elapsed > NO_SPEECH_TIMEOUT_MS) { onAutoStop(); return; }
      if (hasSpoken && now - lastVoiceAt > SILENCE_MS_TO_STOP) { onAutoStop(); return; }

      vadRafRef.current = requestAnimationFrame(tick);
    };
    vadRafRef.current = requestAnimationFrame(tick);
  };

  const startRecording = async () => {
    stopAnyPlayback();
    if (!isPro) {
      onSwitchTab('plans');
      return;
    }
    try {
      let stream = streamRef.current;
      if (!stream || stream.getAudioTracks().every((t) => t.readyState === 'ended')) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        streamRef.current = stream;
      }
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        cleanupVad();
        if (suppressNextStopRef.current) {
          suppressNextStopRef.current = false;
          return;
        }
        handleStop(mimeType);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setStatus('recording');
      startVad(stream, () => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      });
    } catch {
      triggerAlert('เข้าถึงไมโครโฟนไม่ได้', 'กรุณาอนุญาตให้เบราว์เซอร์ใช้ไมโครโฟน แล้วลองใหม่อีกครั้งครับ');
    }
  };

  const start = () => {
    if (!isPro) {
      onSwitchTab('plans');
      return;
    }
    prefetchQuestionAudio(); // fire-and-forget -- fills the cache while Q1 plays/is answered
    askStep(findNextStepIndex(0));
  };

  // Lets the user end their turn early instead of waiting out the silence timeout -- this
  // still processes whatever was said, unlike skipStep which discards the turn entirely.
  const stopRecordingNow = () => {
    cleanupVad();
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
  };

  const skipStep = () => {
    stopAnyPlayback();
    cleanupVad();
    if (mediaRecorderRef.current?.state === 'recording') {
      suppressNextStopRef.current = true;
      mediaRecorderRef.current.stop();
    }
    declinedRef.current.add(STEPS[stepIndexRef.current].field);
    advance();
  };

  const skipAll = () => {
    stopAnyPlayback();
    cleanupVad();
    if (mediaRecorderRef.current?.state === 'recording') {
      suppressNextStopRef.current = true;
      mediaRecorderRef.current.stop();
    }
    finish();
  };

  const currentQuestion = STEPS[stepIndex]?.question || '';

  if (status === 'recording') {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={stopRecordingNow}
          className="w-full py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white transition-all cursor-pointer"
          title="แตะเพื่อจบคำตอบทันที"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          กำลังฟัง... พูดได้เลยครับ
        </button>
        <div className="flex items-center justify-center gap-2 text-[10px]">
          <p className="text-brand-muted">หยุดพูดสักครู่แล้วไปข้อถัดไปให้เองครับ</p>
          <span className="opacity-30">•</span>
          <button
            type="button"
            onClick={skipStep}
            className="font-bold text-brand-muted hover:text-brand-text underline underline-offset-2 cursor-pointer"
          >
            ข้ามข้อนี้
          </button>
        </div>
      </div>
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
          <div className="flex items-center gap-2 text-[10px]">
            <button
              type="button"
              onClick={skipStep}
              className="font-bold text-brand-muted hover:text-brand-text underline underline-offset-2 cursor-pointer"
            >
              ข้ามข้อนี้
            </button>
            <span className="opacity-30">•</span>
            <button
              type="button"
              onClick={skipAll}
              className="font-bold text-brand-muted hover:text-brand-text underline underline-offset-2 cursor-pointer"
            >
              ข้ามที่เหลือทั้งหมด กรอกเอง
            </button>
          </div>
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

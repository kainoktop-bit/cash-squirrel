import React, { useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { IconSpark } from './icons';

export interface VoiceParsedJobFields {
  name?: string;
  client?: string;
  type?: string;
  value?: number;
  creditTerm?: number;
  note?: string;
}

interface VoiceJobRecorderProps {
  isPro: boolean;
  onSwitchTab: (tabId: string) => void;
  triggerAlert: (title: string, message: string) => void;
  onParsed: (fields: VoiceParsedJobFields) => void;
}

type Status = 'idle' | 'recording' | 'processing';

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleStop = async (mimeType: string) => {
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
        body: JSON.stringify({ audioBase64: base64, mimeType }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'แปลงเสียงไม่สำเร็จ');

      onParsed(json);
    } catch (err: any) {
      triggerAlert('แปลงเสียงไม่สำเร็จ', err.message || 'ลองพูดใหม่อีกครั้ง หรือกรอกฟอร์มด้วยตัวเองแทนได้เลยครับ');
    } finally {
      setStatus('idle');
    }
  };

  const startRecording = async () => {
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

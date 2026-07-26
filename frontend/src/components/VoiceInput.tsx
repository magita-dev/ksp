"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface VoiceInterfaceState {
  supported: boolean;
  active: boolean;
  locale: "en-IN" | "kn-IN";
  transcript: string | null;
}

export interface VoiceInputProps {
  onTranscript: (text: string) => void;
  locale?: "en-IN" | "kn-IN";
  disabled?: boolean;
}

function getSpeechRecognitionConstructor():
  | (new () => SpeechRecognition)
  | null {
  if (typeof window === "undefined") return null;
  return (
    (window as typeof window & { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ??
    (window as typeof window & { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition ??
    null
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 glass-panel border border-outline-variant/40 text-on-surface px-md py-sm rounded-lg text-body-sm z-50 shadow-2xl"
    >
      {message}
    </div>
  );
}

export default function VoiceInput({
  onTranscript,
  locale = "en-IN",
  disabled = false,
}: VoiceInputProps) {
  const [state, setState] = useState<VoiceInterfaceState>({
    supported: false,
    active: false,
    locale,
    transcript: null,
  });

  const [toast, setToast] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SRConstructor = getSpeechRecognitionConstructor();
    setState((prev) => ({ ...prev, supported: SRConstructor !== null }));
  }, []);

  useEffect(() => {
    setState((prev) => ({ ...prev, locale }));
  }, [locale]);

  const stopRecognition = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState((prev) => ({ ...prev, active: false }));
  }, []);

  const startRecognition = useCallback(() => {
    const SRConstructor = getSpeechRecognitionConstructor();
    if (!SRConstructor) return;

    stopRecognition();

    const recognition = new SRConstructor();
    recognition.lang = locale;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setState((prev) => ({ ...prev, active: true }));
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setState((prev) => ({ ...prev, transcript }));
      onTranscript(transcript);
    };

    recognition.onend = () => {
      setState((prev) => ({ ...prev, active: false }));
      recognitionRef.current = null;
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setState((prev) => ({ ...prev, active: false }));
      recognitionRef.current = null;

      if (event.error === "no-speech") {
        setToast("No speech detected — try again.");
      }
    };

    recognition.start();
  }, [locale, onTranscript, stopRecognition]);

  const handleMicClick = useCallback(() => {
    if (!state.supported) {
      setToast("Voice recognition is supported in Chrome, Edge, and Safari.");
      return;
    }
    if (state.active) {
      stopRecognition();
    } else {
      startRecognition();
    }
  }, [state.supported, state.active, startRecognition, stopRecognition]);

  useEffect(() => {
    return () => {
      stopRecognition();
    };
  }, [stopRecognition]);

  return (
    <div className="flex items-center gap-1.5">
      {state.active && (
        <span
          aria-label="Recording in progress"
          className="w-2.5 h-2.5 rounded-full bg-error animate-ping"
        />
      )}

      <button
        type="button"
        onClick={handleMicClick}
        disabled={disabled}
        aria-label={state.active ? "Stop recording" : "Start voice input"}
        aria-pressed={state.active}
        title={
          state.supported
            ? `Voice Search (${locale === "kn-IN" ? "Kannada" : "English"})`
            : "Voice search (supported in Chrome/Edge/Safari)"
        }
        className={`p-2.5 rounded-lg border transition-all flex items-center justify-center cursor-pointer ${
          state.active
            ? "bg-error-container/40 text-error border-error/50 shadow-[0_0_10px_rgba(255,180,171,0.5)]"
            : "bg-surface-container-high/60 text-primary border-outline-variant/40 hover:bg-surface-container-highest"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span className="material-symbols-outlined text-[18px]">
          {state.active ? "mic_off" : "mic"}
        </span>
      </button>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Clock, Copy } from 'lucide-react';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface VoiceBarProps {
  onTranscript: (text: string) => void;
  onInsertTimestamp: () => void;
  onCopyNote: () => void;
  onNotify: (title: string, icon?: string, subtitle?: string) => void;
}

export const VoiceBar: React.FC<VoiceBarProps> = ({
  onTranscript,
  onInsertTimestamp,
  onCopyNote,
  onNotify,
}) => {
  const [isDictating, setIsDictating] = useState(false);
  const [lang, setLang] = useState('en-US');
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isDictatingRef = useRef(false);

  useEffect(() => {
    return () => {
      isDictatingRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const stopVoiceDictationUI = () => {
    isDictatingRef.current = false;
    setIsDictating(false);
    setInterimText('');
  };

  const initSpeechRecognition = (): SpeechRecognitionInstance | null => {
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRecognitionCtor =
      win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return null;

    const rec = new SpeechRecognitionCtor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let finalTranscript = '';
      let currentInterim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }
      setInterimText(currentInterim);
      if (finalTranscript.trim()) {
        onTranscript(finalTranscript.trim());
        setInterimText('');
      }
    };

    rec.onerror = () => {
      stopVoiceDictationUI();
    };

    rec.onend = () => {
      if (isDictatingRef.current) {
        try {
          rec.start();
        } catch {
          stopVoiceDictationUI();
        }
      }
    };

    recognitionRef.current = rec;
    return rec;
  };

  const handleToggleVoice = () => {
    let rec = recognitionRef.current;
    if (!rec) {
      rec = initSpeechRecognition();
    }

    if (!rec) {
      // Fallback simulated dictation if browser blocks mic or lacks SpeechRecognition in sandbox
      onTranscript(
        '\n[Voice Dictation Sample]: Follow up on system tray hotkey integration and export the onboarding flowchart to Lucidchart.'
      );
      onNotify(
        'Simulated Voice Note Added',
        'mic',
        'Web Speech API fallback triggered'
      );
      return;
    }

    if (isDictating) {
      isDictatingRef.current = false;
      try {
        rec.stop();
      } catch {
        // ignore
      }
      stopVoiceDictationUI();
    } else {
      rec.lang = lang;
      isDictatingRef.current = true;
      setIsDictating(true);
      try {
        rec.start();
      } catch {
        stopVoiceDictationUI();
      }
    }
  };

  return (
    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          id="voice-record-btn"
          aria-label={isDictating ? 'Stop voice dictation' : 'Start voice dictation'}
          onClick={handleToggleVoice}
          className={`relative w-10 h-10 rounded-full border border-rose-500/40 flex items-center justify-center transition shrink-0 ${
            isDictating
              ? 'recording-pulse bg-rose-600 text-white'
              : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400'
          }`}
        >
          <Mic className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              id="voice-status-title"
              className="text-xs font-semibold text-white truncate"
            >
              {isDictating
                ? 'Listening & Transcribing Live...'
                : 'Voice Dictation Ready'}
            </span>
            <select
              id="voice-lang-badge"
              aria-label="Dictation Language"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 focus:outline-none"
            >
              <option value="en-US">en-US</option>
              <option value="en-GB">en-GB</option>
              <option value="es-ES">es-ES</option>
              <option value="fr-FR">fr-FR</option>
              <option value="de-DE">de-DE</option>
              <option value="ja-JP">ja-JP</option>
            </select>
          </div>
          <p
            id="voice-status-subtitle"
            className="text-[11px] text-slate-400 truncate"
          >
            {interimText
              ? `"${interimText}..."`
              : isDictating
              ? 'Speak clearly — words appear in real time below'
              : 'Click the mic to dictate hands-free into your note'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onInsertTimestamp}
          aria-label="Insert Timestamp"
          title="Insert Timestamp"
          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300"
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onCopyNote}
          aria-label="Copy Note"
          title="Copy Note"
          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center gap-1"
        >
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
      </div>
    </div>
  );
};

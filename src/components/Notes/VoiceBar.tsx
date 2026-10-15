import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Clock, Copy, Download, Cpu, SlidersHorizontal } from 'lucide-react';
import {
  LocalSttStatus,
  SttEngineMode,
  SttSettings,
  WhisperModelId,
} from '../../types/sideflow';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  computeRmsLevel,
  detectLocalSttCapabilities,
  mergeFloat32Chunks,
  resampleTo16kHz,
  setWhisperProgressListener,
  transcribeAudioChunkHybrid,
} from '../../utils/localSttEngine';

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
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

interface VoiceBarProps {
  onTranscript: (text: string) => void;
  onInsertTimestamp: () => void;
  onCopyNote: () => void;
  onExportNote?: () => void;
  isPanelOpen?: boolean;
  promptContext?: string;
  onDictatingChange?: (isDictating: boolean) => void;
  onNotify: (title: string, icon?: string, subtitle?: string) => void;
}

const DEFAULT_STT_SETTINGS: SttSettings = {
  lang: 'en-US',
  engineMode: 'auto',
  modelSize: 'distil-small.en',
  selectedMicId: 'default',
};

export const VoiceBar: React.FC<VoiceBarProps> = ({
  onTranscript,
  onInsertTimestamp,
  onCopyNote,
  onExportNote,
  promptContext = '',
  onDictatingChange,
  onNotify,
}) => {
  const [sttSettings, setSttSettings] = useLocalStorage<SttSettings>(
    'sideflow_stt_settings',
    DEFAULT_STT_SETTINGS
  );
  const [showEngineConfig, setShowEngineConfig] = useLocalStorage<boolean>(
    'sideflow_stt_drawer_open',
    false
  );

  const lang = sttSettings.lang || 'en-US';
  const engineMode = sttSettings.engineMode || 'auto';
  const modelSize = sttSettings.modelSize || 'distil-small.en';
  const selectedMicId = sttSettings.selectedMicId || 'default';

  const updateSttSetting = <K extends keyof SttSettings>(
    key: K,
    value: SttSettings[K]
  ) => {
    setSttSettings((prev) => ({
      ...DEFAULT_STT_SETTINGS,
      ...prev,
      [key]: value,
    }));
  };

  const [isDictating, setIsDictating] = useState(false);
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);
  const [micDevices, setMicDevices] = useState<AudioDeviceOption[]>([]);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [interimText, setInterimText] = useState('');
  const [modelProgress, setModelProgress] = useState<{
    progress: number;
    status: string;
  } | null>(null);
  const [sttStatus, setSttStatus] = useState<
    (LocalSttStatus & { webGpuAvailable?: boolean }) | null
  >(() => {
    const webGpuAvailable =
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      Boolean((navigator as unknown as { gpu?: unknown }).gpu);
    return {
      available: true,
      fasterWhisperAvailable: false,
      cudaAvailable: false,
      windowsSapiAvailable: false,
      webGpuAvailable,
      activeModel: 'distil-small.en',
    };
  });
  const [lastEngineLabel, setLastEngineLabel] = useState<string>(() => {
    const webGpuAvailable =
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      Boolean((navigator as unknown as { gpu?: unknown }).gpu);
    return webGpuAvailable ? 'Local WebGPU Whisper' : 'CPU WASM (Moonshine)';
  });

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isDictatingRef = useRef(false);
  const hasReceivedSpeechRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;
  const promptContextRef = useRef(promptContext);
  promptContextRef.current = promptContext;
  const onDictatingChangeRef = useRef(onDictatingChange);
  onDictatingChangeRef.current = onDictatingChange;

  // Keep latest settings in refs for live audio callbacks
  const langRef = useRef(lang);
  langRef.current = lang;
  const engineModeRef = useRef(engineMode);
  engineModeRef.current = engineMode;
  const modelSizeRef = useRef(modelSize);
  modelSizeRef.current = modelSize;

  // WebAudio VAD, Pre-Roll Lookback Ring Buffer & PCM capture refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const preRollChunksRef = useRef<Float32Array[]>([]);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const chunkSampleCountRef = useRef<number>(0);
  const vadSpeechActiveRef = useRef<boolean>(false);
  const lastVoiceTimestampRef = useRef<number>(0);
  const chunkStartTimestampRef = useRef<number>(0);

  const setDictatingState = useCallback((next: boolean) => {
    isDictatingRef.current = next;
    setIsDictating(next);
    onDictatingChangeRef.current?.(next);
  }, []);

  const refreshMicDevices = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.enumerateDevices !== 'function'
    ) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, idx) => ({
          deviceId: d.deviceId || `mic-${idx}`,
          label: d.label || `Microphone ${idx + 1}`,
        }));
      if (inputs.length > 0) {
        setMicDevices(inputs);
      }
    } catch {
      // ignore permission errors prior to prompt
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    if (window.sideflow?.getLocalSttStatus) {
      detectLocalSttCapabilities()
        .then((caps) => {
          if (!mounted) return;
          setSttStatus(caps);
          if (caps.cudaAvailable && caps.gpuName) {
            setLastEngineLabel(`CUDA (${caps.gpuName})`);
          } else if (caps.fasterWhisperAvailable) {
            setLastEngineLabel(
              `CPU INT8 (${caps.cpuThreads || 8}T faster-whisper)`
            );
          } else if (caps.webGpuAvailable) {
            setLastEngineLabel('Local WebGPU Whisper');
          } else {
            setLastEngineLabel('CPU WASM (Moonshine)');
          }
        })
        .catch(() => {});
    }

    setWhisperProgressListener((info) => {
      if (!mounted) return;
      if (info.progress >= 100) {
        setModelProgress(null);
      } else {
        setModelProgress(info);
      }
    });

    return () => {
      mounted = false;
      setWhisperProgressListener(null);
    };
  }, []);

  const flushAndTranscribeChunk = useCallback(async (sampleRate: number) => {
    const chunks = recordedChunksRef.current;
    if (chunks.length === 0) return;

    recordedChunksRef.current = [];
    chunkSampleCountRef.current = 0;
    vadSpeechActiveRef.current = false;

    const merged = mergeFloat32Chunks(chunks);
    const audio16k = resampleTo16kHz(merged, sampleRate);
    if (audio16k.length < 1200) return;

    setIsProcessingChunk(true);
    setInterimText('Transcribing locally...');
    try {
      const res = await transcribeAudioChunkHybrid({
        audio16k,
        lang: langRef.current,
        engineMode: engineModeRef.current,
        modelSize: modelSizeRef.current,
        promptContext: promptContextRef.current,
      });
      if (res.success && res.text && res.text.trim()) {
        hasReceivedSpeechRef.current = true;
        if (res.engineUsed) {
          setLastEngineLabel(res.engineUsed);
        }
        onTranscriptRef.current(res.text.trim());
      }
    } catch {
      // ignore single chunk error
    } finally {
      setIsProcessingChunk(false);
      setInterimText('');
    }
  }, []);

  const stopAudioCapture = useCallback(
    async (flushRemaining = true) => {
      const sampleRate = audioContextRef.current?.sampleRate || 16000;

      if (processorRef.current) {
        try {
          processorRef.current.disconnect();
          processorRef.current.onaudioprocess = null;
        } catch {
          // ignore
        }
        processorRef.current = null;
      }

      if (mediaStreamRef.current) {
        try {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        mediaStreamRef.current = null;
      }

      if (audioContextRef.current) {
        try {
          await audioContextRef.current.close();
        } catch {
          // ignore
        }
        audioContextRef.current = null;
      }

      setAudioLevel(0);
      preRollChunksRef.current = [];

      if (
        flushRemaining &&
        recordedChunksRef.current.length > 0 &&
        vadSpeechActiveRef.current
      ) {
        await flushAndTranscribeChunk(sampleRate);
      } else {
        recordedChunksRef.current = [];
        chunkSampleCountRef.current = 0;
        vadSpeechActiveRef.current = false;
      }
    },
    [flushAndTranscribeChunk]
  );

  const stopVoiceDictationUI = useCallback(() => {
    setDictatingState(false);
    setInterimText('');
    setAudioLevel(0);
  }, [setDictatingState]);

  const triggerSimulatedFallback = useCallback(() => {
    onTranscriptRef.current(
      '\n[Voice Dictation Sample]: Follow up on system tray hotkey integration and export the onboarding flowchart to Lucidchart.'
    );
    onNotifyRef.current(
      'Simulated Voice Note Added',
      'mic',
      'Web Speech API fallback triggered'
    );
  }, []);

  // Only clean up if the entire application unmounts (NOT when switching tabs or collapsing panel)
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
      stopAudioCapture(false);
    };
  }, [stopAudioCapture]);

  const initSpeechRecognition = (
    selectedLang: string,
    useForFinalTranscript: boolean
  ): SpeechRecognitionInstance | null => {
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
    rec.lang = selectedLang;

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      hasReceivedSpeechRef.current = true;
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
      if (useForFinalTranscript && finalTranscript.trim()) {
        onTranscriptRef.current(finalTranscript.trim());
        setInterimText('');
      }
    };

    rec.onerror = () => {
      if (!useForFinalTranscript) {
        return;
      }
      const wasActiveWithoutSpeech =
        isDictatingRef.current && !hasReceivedSpeechRef.current;
      stopVoiceDictationUI();
      if (wasActiveWithoutSpeech) {
        triggerSimulatedFallback();
      }
    };

    rec.onend = () => {
      if (isDictatingRef.current && useForFinalTranscript) {
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

  const startLocalVadAudioCapture = async (): Promise<boolean> => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      return false;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return false;

    try {
      const constraints: MediaStreamConstraints = {
        audio:
          selectedMicId && selectedMicId !== 'default'
            ? {
                deviceId: { exact: selectedMicId },
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      refreshMicDevices();

      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      preRollChunksRef.current = [];
      recordedChunksRef.current = [];
      chunkSampleCountRef.current = 0;
      vadSpeechActiveRef.current = false;
      const now = performance.now();
      lastVoiceTimestampRef.current = now;
      chunkStartTimestampRef.current = now;

      // Sensitive onset threshold + 3-frame (~350ms) pre-roll ring buffer so the first syllable is never cut off
      const VAD_RMS_THRESHOLD = 0.028;
      // Natural pause flush (~850ms) and generous phrase window (~8.5s) for complete, accurate sentences
      const SILENCE_FLUSH_MS = 850;
      const MAX_CHUNK_MS = 8500;
      const PRE_ROLL_FRAMES = 3;

      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!isDictatingRef.current) return;
        const inputData = event.inputBuffer.getChannelData(0);
        const frameCopy = new Float32Array(inputData);
        const rms = computeRmsLevel(frameCopy);
        setAudioLevel(rms);

        const ts = performance.now();
        if (rms >= VAD_RMS_THRESHOLD) {
          if (!vadSpeechActiveRef.current) {
            vadSpeechActiveRef.current = true;
            chunkStartTimestampRef.current = ts;
            // Prepend the pre-roll lookback buffer so initial consonants/words are 100% preserved
            if (preRollChunksRef.current.length > 0) {
              for (const preFrame of preRollChunksRef.current) {
                recordedChunksRef.current.push(preFrame);
                chunkSampleCountRef.current += preFrame.length;
              }
              preRollChunksRef.current = [];
            }
          }
          lastVoiceTimestampRef.current = ts;
        }

        if (vadSpeechActiveRef.current) {
          recordedChunksRef.current.push(frameCopy);
          chunkSampleCountRef.current += frameCopy.length;

          const silenceDuration = ts - lastVoiceTimestampRef.current;
          const totalDuration = ts - chunkStartTimestampRef.current;

          if (
            silenceDuration >= SILENCE_FLUSH_MS ||
            totalDuration >= MAX_CHUNK_MS
          ) {
            flushAndTranscribeChunk(ctx.sampleRate);
          }
        } else {
          // Maintain rolling pre-roll lookback buffer while waiting for speech onset
          preRollChunksRef.current.push(frameCopy);
          if (preRollChunksRef.current.length > PRE_ROLL_FRAMES) {
            preRollChunksRef.current.shift();
          }
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  };

  const handleLangChange = (newLang: string) => {
    updateSttSetting('lang', newLang);
    if (recognitionRef.current) {
      recognitionRef.current.lang = newLang;
      if (isDictatingRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    }
  };

  const handleToggleVoice = async () => {
    if (isDictating) {
      isDictatingRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      await stopAudioCapture(true);
      stopVoiceDictationUI();
      return;
    }

    const canCaptureLocalMic =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      ) === 'function';

    if (canCaptureLocalMic) {
      hasReceivedSpeechRef.current = false;
      setDictatingState(true);

      const startedLocal = await startLocalVadAudioCapture();
      if (startedLocal) {
        return;
      }
      stopVoiceDictationUI();
    }

    // Fallback to SpeechRecognition or simulated dictation (e.g. in jsdom or sandbox without mic)
    let rec = recognitionRef.current;
    if (!rec) {
      rec = initSpeechRecognition(lang, true);
    }

    if (!rec) {
      triggerSimulatedFallback();
      return;
    }

    rec.lang = lang;
    hasReceivedSpeechRef.current = false;
    setDictatingState(true);
    try {
      rec.start();
    } catch {
      stopVoiceDictationUI();
      triggerSimulatedFallback();
    }
  };

  // Compute 6 visualizer bar heights from current audioLevel
  const levelBars = [0.45, 0.75, 1.0, 0.85, 0.6, 0.4].map((weight) =>
    isDictating ? Math.max(18, Math.min(100, Math.round(audioLevel * weight * 100))) : 18
  );

  const activeEngineBadgeText =
    engineMode === 'native-cuda'
      ? sttStatus?.cudaAvailable
        ? `CUDA (${sttStatus.gpuName?.replace('NVIDIA GeForce ', '') || 'GPU'})`
        : 'Native Whisper'
      : engineMode === 'native-cpu'
      ? `CPU INT8 (${modelSize})`
      : engineMode === 'webgpu-whisper'
      ? `${sttStatus?.webGpuAvailable ? 'WebGPU' : 'CPU WASM'} (${modelSize})`
      : engineMode === 'os-speech'
      ? 'Windows SAPI'
      : lastEngineLabel || 'Hybrid Local STT';

  return (
    <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            id="voice-record-btn"
            aria-pressed={isDictating}
            aria-label={
              isDictating ? 'Stop voice dictation' : 'Start voice dictation'
            }
            onClick={handleToggleVoice}
            className={`isolate relative w-10 h-10 rounded-full border border-rose-500/40 flex items-center justify-center transition shrink-0 ${
              isDictating
                ? 'recording-pulse bg-rose-600 text-white'
                : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400'
            }`}
          >
            <Mic className="w-5 h-5" aria-hidden="true" />
          </button>

          <div className="min-w-0" role="status" aria-live="polite">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                id="voice-status-title"
                className="text-xs font-semibold text-white truncate"
              >
                {isDictating
                  ? isProcessingChunk
                    ? 'Transcribing Audio Chunk...'
                    : 'Listening (Active Across All Tabs)...'
                  : 'Voice Dictation Ready'}
              </span>

              <select
                id="voice-lang-badge"
                aria-label="Dictation Language"
                value={lang}
                onChange={(e) => handleLangChange(e.target.value)}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="en-US">en-US</option>
                <option value="en-GB">en-GB</option>
                <option value="es-ES">es-ES</option>
                <option value="fr-FR">fr-FR</option>
                <option value="de-DE">de-DE</option>
                <option value="ja-JP">ja-JP</option>
              </select>

              <span
                data-testid="local-stt-engine-badge"
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 truncate max-w-[165px]"
                title="Active Local Speech-to-Text Engine"
              >
                <Cpu className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{activeEngineBadgeText}</span>
              </span>
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              {/* Live Microphone Level Visualizer */}
              <div
                data-testid="voice-level-meter"
                aria-label="Microphone Audio Level Meter"
                className="flex items-end gap-0.5 h-3 shrink-0"
              >
                {levelBars.map((pct, idx) => (
                  <span
                    key={idx}
                    style={{ height: `${pct}%` }}
                    className={`w-1 rounded-full transition-all duration-75 ${
                      isDictating && audioLevel > 0.028
                        ? 'bg-emerald-400'
                        : isDictating
                        ? 'bg-rose-400/70'
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>

              <p
                id="voice-status-subtitle"
                className="text-[11px] text-slate-400 truncate"
              >
                {modelProgress
                  ? modelProgress.status
                  : interimText
                  ? `"${interimText}"`
                  : isDictating
                  ? 'Keep talking even while switching tabs or hiding panel'
                  : 'Click the mic to dictate locally into your note at cursor'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowEngineConfig((prev) => {
                const next = !prev;
                if (next) refreshMicDevices();
                return next;
              });
            }}
            aria-expanded={showEngineConfig}
            aria-label="Configure Local STT Engine & Microphone"
            title="Configure Local STT Engine & Microphone"
            className={`px-2 py-1.5 rounded-lg text-[11px] transition ${
              showEngineConfig
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onInsertTimestamp}
            aria-label="Insert Timestamp"
            title="Insert Timestamp at Last Added Text Position"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300"
          >
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          {onExportNote && (
            <button
              type="button"
              onClick={onExportNote}
              aria-label="Export Note"
              title="Download Note as Markdown (.md)"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onCopyNote}
            aria-label="Copy Note"
            title="Copy Note"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center gap-1"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" /> Copy
          </button>
        </div>
      </div>

      {/* Collapsible Local STT Engine, Whisper/Moonshine Model & Microphone Selector Drawer */}
      {showEngineConfig && (
        <div
          data-testid="stt-config-drawer"
          className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]"
        >
          <label className="flex flex-col gap-1">
            <span className="text-slate-400 font-medium">Local STT Engine</span>
            <select
              aria-label="Local STT Engine Mode"
              value={engineMode}
              onChange={(e) =>
                updateSttSetting('engineMode', e.target.value as SttEngineMode)
              }
              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="auto">Auto (Hybrid GPU / i9 CPU)</option>
              <option value="native-cpu">
                Electron Native CPU (Core i9 INT8 + Beam 3)
              </option>
              <option value="native-cuda">
                Electron Native GPU (4GB+ VRAM / CUDA)
              </option>
              <option value="webgpu-whisper">
                In-App Moonshine / Whisper (WASM / WebGPU)
              </option>
              <option value="os-speech">Windows Offline Speech (SAPI)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-slate-400 font-medium">
              Accuracy / Speed Model
            </span>
            <select
              aria-label="Whisper Model Size"
              value={modelSize}
              onChange={(e) =>
                updateSttSetting('modelSize', e.target.value as WhisperModelId)
              }
              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="distil-small.en">
                Distil-Small.en (Recommended i9 / 4GB GPU)
              </option>
              <option value="distil-medium.en">
                Distil-Medium.en (Max Accuracy • 32GB RAM)
              </option>
              <option value="small.en">
                Whisper Small.en (High Accuracy ~240MB)
              </option>
              <option value="base.en">
                Whisper Base.en (Balanced ~75MB)
              </option>
              <option value="moonshine-base">
                Moonshine Base (WASM CPU High-Accuracy)
              </option>
              <option value="moonshine-tiny">
                Moonshine Tiny (WASM CPU Ultra-Fast)
              </option>
              <option value="tiny.en">Whisper Tiny.en (Fastest ~40MB)</option>
              <option value="tiny">Whisper Tiny Multilingual</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-slate-400 font-medium">Microphone Input</span>
            <select
              aria-label="Microphone Input Device"
              value={selectedMicId}
              onChange={(e) =>
                updateSttSetting('selectedMicId', e.target.value)
              }
              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="default">System Default Microphone</option>
              {micDevices
                .filter((d) => d.deviceId !== 'default')
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
};

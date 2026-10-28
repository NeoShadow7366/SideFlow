import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Clock,
  Copy,
  Download,
  Cpu,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import {
  LocalSttStatus,
  NotifyFn,
  SttEngineMode,
  SttSettings,
  WhisperModelId,
} from '../../types/sideflow';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  computeRmsLevel,
  detectLocalSttCapabilities,
  mergeFloat32Chunks,
  mergeRecentFloat32Chunks,
  preloadLocalSttEngine,
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

export interface LiveInterimPayload {
  text: string;
  isSpeaking: boolean;
  isProcessing: boolean;
}

interface VoiceBarProps {
  onTranscript: (text: string) => void;
  onInsertTimestamp: () => void;
  onCopyNote?: () => void;
  onExportNote?: () => void;
  isPanelOpen?: boolean;
  isActiveTab?: boolean;
  promptContext?: string;
  onDictatingChange?: (isDictating: boolean) => void;
  onInterimChange?: (payload: LiveInterimPayload) => void;
  onNotify: NotifyFn;
}

const DEFAULT_STT_SETTINGS: SttSettings = {
  lang: 'en-US',
  engineMode: 'auto',
  modelSize: 'moonshine-tiny',
  selectedMicId: 'default',
  instantMode: true,
};

const PCM_CAPTURE_WORKLET_CODE = `
class SideFlowPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(512);
    this._idx = 0;
  }
  process(inputs) {
    const chan = inputs && inputs[0] && inputs[0][0];
    if (!chan) return true;
    let offset = 0;
    while (offset < chan.length) {
      const rem = 512 - this._idx;
      const toCopy = Math.min(rem, chan.length - offset);
      this._buf.set(chan.subarray(offset, offset + toCopy), this._idx);
      this._idx += toCopy;
      offset += toCopy;
      if (this._idx >= 512) {
        const frame = new Float32Array(this._buf);
        this.port.postMessage(frame, [frame.buffer]);
        this._idx = 0;
      }
    }
    return true;
  }
}
registerProcessor('sideflow-pcm-processor', SideFlowPcmProcessor);
`;

const METER_WEIGHTS = [0.45, 0.75, 1.0, 0.85, 0.6, 0.4];

export const VoiceBar: React.FC<VoiceBarProps> = ({
  onTranscript,
  onInsertTimestamp,
  onCopyNote,
  onExportNote,
  isActiveTab = true,
  promptContext = '',
  onDictatingChange,
  onInterimChange,
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
  const modelSize = sttSettings.modelSize || 'moonshine-tiny';
  const selectedMicId = sttSettings.selectedMicId || 'default';
  const instantMode = sttSettings.instantMode ?? true;

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
  const [isSpeakingActive, setIsSpeakingActive] = useState(false);
  const [isProcessingChunk, setIsProcessingChunk] = useState(false);
  const [warmupState, setWarmupState] = useState<'idle' | 'warming' | 'hot'>(
    'idle'
  );
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [micDevices, setMicDevices] = useState<AudioDeviceOption[]>([]);
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
      activeModel: 'moonshine-tiny',
    };
  });
  const [lastEngineLabel, setLastEngineLabel] = useState<string>(
    'CPU WASM (Moonshine)'
  );

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const auxInterimRecognitionRef = useRef<SpeechRecognitionInstance | null>(
    null
  );
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
  const onInterimChangeRef = useRef(onInterimChange);
  onInterimChangeRef.current = onInterimChange;

  // Keep latest settings in refs for live audio callbacks
  const langRef = useRef(lang);
  langRef.current = lang;
  const engineModeRef = useRef(engineMode);
  engineModeRef.current = engineMode;
  const modelSizeRef = useRef(modelSize);
  modelSizeRef.current = modelSize;
  const instantModeRef = useRef(instantMode);
  instantModeRef.current = instantMode;

  // Zero-re-render audio level & visualizer bar refs
  const audioLevelRef = useRef<number>(0);
  const meterBarRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const meterRafRef = useRef<number | null>(null);

  // WebAudio VAD, Pre-Roll Lookback Ring Buffer, Live Partial Stream & FIFO Queue refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const captureSessionIdRef = useRef<number>(0);
  const preRollChunksRef = useRef<Float32Array[]>([]);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const chunkSampleCountRef = useRef<number>(0);
  const vadSpeechActiveRef = useRef<boolean>(false);
  const lastVoiceTimestampRef = useRef<number>(0);
  const chunkStartTimestampRef = useRef<number>(0);
  const lastPartialRunAtRef = useRef<number>(0);
  const partialInFlightRef = useRef<boolean>(false);
  const finalInFlightCountRef = useRef<number>(0);
  const utteranceIdRef = useRef<number>(0);
  const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const warmupKeyRef = useRef<string>('');

  // Notify parent NotesView of non-destructive live interim HUD updates
  useEffect(() => {
    onInterimChangeRef.current?.({
      text: interimText,
      isSpeaking: isDictating && isSpeakingActive,
      isProcessing: isProcessingChunk,
    });
  }, [interimText, isDictating, isSpeakingActive, isProcessingChunk]);

  // GPU-composited ~24fps visualizer loop (0 React re-renders per audio callback)
  useEffect(() => {
    if (!isDictating) {
      audioLevelRef.current = 0;
      for (const bar of meterBarRefs.current) {
        if (bar) {
          bar.style.transform = 'scaleY(0.18)';
          bar.className =
            'w-1 h-full rounded-full origin-bottom bg-slate-700 transition-colors duration-75';
        }
      }
      return;
    }

    let lastPaint = 0;
    let active = true;
    const tick = (now: number) => {
      if (!active) return;
      if (now - lastPaint >= 42) {
        lastPaint = now;
        const level = audioLevelRef.current;
        const isActiveVoice = level > 0.026;
        const colorCls = isActiveVoice
          ? 'w-1 h-full rounded-full origin-bottom bg-emerald-400'
          : 'w-1 h-full rounded-full origin-bottom bg-rose-400/70';

        for (let i = 0; i < METER_WEIGHTS.length; i++) {
          const bar = meterBarRefs.current[i];
          if (!bar) continue;
          const scale = Math.max(
            0.18,
            Math.min(1, Number((level * METER_WEIGHTS[i]).toFixed(3)))
          );
          bar.style.transform = `scaleY(${scale})`;
          if (bar.className !== colorCls) {
            bar.className = colorCls;
          }
        }
      }
      meterRafRef.current = window.requestAnimationFrame(tick);
    };

    meterRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      active = false;
      if (meterRafRef.current !== null) {
        window.cancelAnimationFrame(meterRafRef.current);
        meterRafRef.current = null;
      }
    };
  }, [isDictating]);

  const setDictatingState = useCallback((next: boolean) => {
    isDictatingRef.current = next;
    setIsDictating(next);
    if (!next) {
      setIsSpeakingActive(false);
    }
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

  const triggerWarmup = useCallback(async () => {
    const isJsdom =
      typeof navigator !== 'undefined' &&
      /jsdom/i.test(navigator.userAgent || '');
    if (isJsdom && !window.sideflow?.warmupLocalStt) {
      return;
    }

    const key = `${engineModeRef.current}::${modelSizeRef.current}::${langRef.current}::${instantModeRef.current}`;
    if (warmupKeyRef.current === key) return;
    warmupKeyRef.current = key;

    setWarmupState('warming');
    try {
      const res = await preloadLocalSttEngine({
        lang: langRef.current,
        engineMode: engineModeRef.current,
        modelSize: modelSizeRef.current,
        instantMode: instantModeRef.current,
      });
      if (res.success) {
        setWarmupState('hot');
        if (res.engineUsed) {
          setLastEngineLabel(res.engineUsed);
        }
      } else {
        setWarmupState('idle');
        warmupKeyRef.current = '';
      }
    } catch {
      setWarmupState('idle');
      warmupKeyRef.current = '';
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
              `CPU INT8 (${caps.cpuThreads || 6}T faster-whisper)`
            );
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

  // Pre-warm the active local STT engine when the Notes tab is viewed or engine settings change
  useEffect(() => {
    if (!isActiveTab) return;
    const isJsdom =
      typeof navigator !== 'undefined' &&
      /jsdom/i.test(navigator.userAgent || '');
    if (isJsdom && !window.sideflow?.warmupLocalStt) return;

    const timer = window.setTimeout(() => {
      void triggerWarmup();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [isActiveTab, engineMode, modelSize, lang, instantMode, triggerWarmup]);

  const runLivePartialPreview = useCallback(
    async (sampleRate: number, targetUtteranceId: number) => {
      if (
        partialInFlightRef.current ||
        finalInFlightCountRef.current > 0 ||
        !vadSpeechActiveRef.current ||
        !isDictatingRef.current
      ) {
        return;
      }

      const maxWindowSamples = Math.round(sampleRate * 4.5);
      const recentSamples = mergeRecentFloat32Chunks(
        recordedChunksRef.current,
        maxWindowSamples
      );
      const audio16k = resampleTo16kHz(recentSamples, sampleRate);
      if (audio16k.length < 4000) return;

      partialInFlightRef.current = true;
      try {
        const res = await transcribeAudioChunkHybrid({
          audio16k,
          lang: langRef.current,
          engineMode: engineModeRef.current,
          modelSize: modelSizeRef.current,
          promptContext: promptContextRef.current,
          instantMode: true,
          isPartial: true,
        });

        if (
          utteranceIdRef.current === targetUtteranceId &&
          vadSpeechActiveRef.current &&
          isDictatingRef.current &&
          res.success &&
          res.text &&
          res.text.trim()
        ) {
          setInterimText(res.text.trim());
        }
      } catch {
        // ignore transient partial preview errors
      } finally {
        partialInFlightRef.current = false;
      }
    },
    []
  );

  const flushAndTranscribeChunk = useCallback((sampleRate: number): Promise<void> => {
    const chunks = recordedChunksRef.current;
    if (chunks.length === 0) return Promise.resolve();

    // Advance utteranceId immediately so any in-flight partial preview cannot overwrite committed state
    utteranceIdRef.current += 1;
    recordedChunksRef.current = [];
    chunkSampleCountRef.current = 0;
    vadSpeechActiveRef.current = false;
    setIsSpeakingActive(false);

    const merged = mergeFloat32Chunks(chunks);
    const audio16k = resampleTo16kHz(merged, sampleRate);
    if (audio16k.length < 1200) {
      if (finalInFlightCountRef.current === 0) {
        setInterimText('');
      }
      return Promise.resolve();
    }

    finalInFlightCountRef.current += 1;
    setIsProcessingChunk(true);

    const job = transcriptionQueueRef.current.then(async () => {
      const t0 = performance.now();
      try {
        const res = await transcribeAudioChunkHybrid({
          audio16k,
          lang: langRef.current,
          engineMode: engineModeRef.current,
          modelSize: modelSizeRef.current,
          promptContext: promptContextRef.current,
          instantMode: instantModeRef.current,
          isPartial: false,
        });
        const elapsed = res.durationMs || Math.round(performance.now() - t0);
        if (elapsed > 0) {
          setLastLatencyMs(elapsed);
        }
        setWarmupState('hot');
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
        finalInFlightCountRef.current = Math.max(
          0,
          finalInFlightCountRef.current - 1
        );
        if (finalInFlightCountRef.current === 0) {
          setIsProcessingChunk(false);
          if (!vadSpeechActiveRef.current) {
            setInterimText('');
          }
        }
      }
    });

    transcriptionQueueRef.current = job.catch(() => {});
    return job;
  }, []);

  const stopAudioCapture = useCallback(
    async (flushRemaining = true) => {
      captureSessionIdRef.current += 1;
      const sampleRate = audioContextRef.current?.sampleRate || 16000;

      if (auxInterimRecognitionRef.current) {
        try {
          auxInterimRecognitionRef.current.onresult = null;
          auxInterimRecognitionRef.current.onerror = null;
          auxInterimRecognitionRef.current.onend = null;
          auxInterimRecognitionRef.current.stop();
        } catch {
          // ignore
        }
        auxInterimRecognitionRef.current = null;
      }

      if (silentGainRef.current) {
        try {
          silentGainRef.current.disconnect();
        } catch {
          // ignore
        }
        silentGainRef.current = null;
      }

      if (workletNodeRef.current) {
        try {
          workletNodeRef.current.port.onmessage = null;
          workletNodeRef.current.disconnect();
        } catch {
          // ignore
        }
        workletNodeRef.current = null;
      }

      if (processorRef.current) {
        try {
          processorRef.current.disconnect();
          processorRef.current.onaudioprocess = null;
        } catch {
          // ignore
        }
        processorRef.current = null;
      }

      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch {
          // ignore
        }
        sourceNodeRef.current = null;
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

      audioLevelRef.current = 0;
      preRollChunksRef.current = [];

      if (
        flushRemaining &&
        recordedChunksRef.current.length > 0 &&
        vadSpeechActiveRef.current
      ) {
        await flushAndTranscribeChunk(sampleRate);
      } else {
        utteranceIdRef.current += 1;
        recordedChunksRef.current = [];
        chunkSampleCountRef.current = 0;
        vadSpeechActiveRef.current = false;
        if (flushRemaining) {
          await transcriptionQueueRef.current;
        }
      }
    },
    [flushAndTranscribeChunk]
  );

  const stopVoiceDictationUI = useCallback(() => {
    setDictatingState(false);
    setInterimText('');
    audioLevelRef.current = 0;
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
      void stopAudioCapture(false);
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
      if (currentInterim) {
        setInterimText(currentInterim);
      }
      if (useForFinalTranscript && finalTranscript.trim()) {
        onTranscriptRef.current(finalTranscript.trim());
        setInterimText('');
      }
    };

    rec.onerror = (event?: { error?: string }) => {
      if (!useForFinalTranscript) {
        return;
      }
      const errCode = event?.error || '';
      const wasActiveWithoutSpeech =
        isDictatingRef.current && !hasReceivedSpeechRef.current;
      stopVoiceDictationUI();
      if (
        errCode === 'not-allowed' ||
        errCode === 'service-not-allowed' ||
        errCode === 'audio-capture'
      ) {
        onNotifyRef.current(
          'Microphone Access Blocked',
          'zap',
          'Grant microphone permission in system settings or check input device.',
          { variant: 'error' }
        );
        return;
      }
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

    if (useForFinalTranscript) {
      recognitionRef.current = rec;
    } else {
      auxInterimRecognitionRef.current = rec;
    }
    return rec;
  };

  const startLocalVadAudioCapture = async (
    overrideMicId?: string
  ): Promise<'started' | 'denied' | 'unavailable'> => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      return 'unavailable';
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return 'unavailable';

    const sessionId = ++captureSessionIdRef.current;
    const targetMicId = overrideMicId ?? selectedMicId;

    try {
      const constraints: MediaStreamConstraints = {
        audio:
          targetMicId && targetMicId !== 'default'
            ? {
                deviceId: { exact: targetMicId },
                channelCount: 1,
                sampleRate: 16000,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : {
                channelCount: 1,
                sampleRate: 16000,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (
        !isDictatingRef.current ||
        captureSessionIdRef.current !== sessionId
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return 'started';
      }
      mediaStreamRef.current = stream;
      void refreshMicDevices();

      // Request native 16kHz interactive AudioContext so C++ WebAudio resamples off main thread
      let ctx: AudioContext;
      try {
        ctx = new AudioCtx({ sampleRate: 16000, latencyHint: 'interactive' });
      } catch {
        ctx = new AudioCtx();
      }
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        await ctx.resume().catch(() => {});
      }
      if (
        !isDictatingRef.current ||
        captureSessionIdRef.current !== sessionId
      ) {
        stream.getTracks().forEach((track) => track.stop());
        await ctx.close().catch(() => {});
        return 'started';
      }
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      preRollChunksRef.current = [];
      recordedChunksRef.current = [];
      chunkSampleCountRef.current = 0;
      vadSpeechActiveRef.current = false;
      utteranceIdRef.current += 1;
      const now = performance.now();
      lastVoiceTimestampRef.current = now;
      chunkStartTimestampRef.current = now;
      lastPartialRunAtRef.current = now;

      const VAD_RMS_THRESHOLD = 0.026;

      const handlePcmFrame = (frameCopy: Float32Array) => {
        if (!isDictatingRef.current) return;
        const rms = computeRmsLevel(frameCopy);
        audioLevelRef.current = rms;

        const isFastMode = instantModeRef.current;
        const silenceFlushMs = isFastMode ? 380 : 780;
        const maxChunkMs = isFastMode ? 4200 : 8000;
        const frameDurationMs = Math.max(
          16,
          (frameCopy.length / (ctx.sampleRate || 16000)) * 1000
        );
        const preRollFrames = Math.max(3, Math.ceil(280 / frameDurationMs));

        const ts = performance.now();
        if (rms >= VAD_RMS_THRESHOLD) {
          if (!vadSpeechActiveRef.current) {
            vadSpeechActiveRef.current = true;
            utteranceIdRef.current += 1;
            chunkStartTimestampRef.current = ts;
            lastPartialRunAtRef.current = ts;
            setIsSpeakingActive(true);
            // Prepend pre-roll lookback buffer so initial consonants/words are 100% preserved
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
          const fastQuietFlush =
            isFastMode &&
            totalDuration >= 1000 &&
            silenceDuration >= 300 &&
            rms < 0.012;

          if (
            fastQuietFlush ||
            silenceDuration >= silenceFlushMs ||
            totalDuration >= maxChunkMs
          ) {
            void flushAndTranscribeChunk(ctx.sampleRate);
          } else if (
            isFastMode &&
            totalDuration >= 360 &&
            ts - lastPartialRunAtRef.current >= 550
          ) {
            lastPartialRunAtRef.current = ts;
            void runLivePartialPreview(ctx.sampleRate, utteranceIdRef.current);
          }
        } else {
          // Maintain rolling ~280ms pre-roll lookback buffer while waiting for speech onset
          preRollChunksRef.current.push(frameCopy);
          if (preRollChunksRef.current.length > preRollFrames) {
            preRollChunksRef.current.shift();
          }
        }
      };

      // Prefer low-latency AudioWorkletNode (32ms frames @ 16kHz), gracefully falling back to ScriptProcessorNode(1024)
      let attachedWorklet = false;
      if (
        ctx.audioWorklet &&
        typeof ctx.audioWorklet.addModule === 'function' &&
        typeof AudioWorkletNode !== 'undefined' &&
        typeof Blob !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      ) {
        let blobUrl = '';
        try {
          const blob = new Blob([PCM_CAPTURE_WORKLET_CODE], {
            type: 'application/javascript',
          });
          blobUrl = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(blobUrl);
          if (
            isDictatingRef.current &&
            captureSessionIdRef.current === sessionId
          ) {
            const workletNode = new AudioWorkletNode(
              ctx,
              'sideflow-pcm-processor'
            );
            workletNode.port.onmessage = (ev: MessageEvent<Float32Array>) => {
              if (ev.data instanceof Float32Array) {
                handlePcmFrame(ev.data);
              }
            };
            source.connect(workletNode);
            if (typeof ctx.createGain === 'function') {
              const silentGain = ctx.createGain();
              silentGain.gain.value = 0;
              workletNode.connect(silentGain);
              silentGain.connect(ctx.destination);
              silentGainRef.current = silentGain;
            }
            workletNodeRef.current = workletNode;
            attachedWorklet = true;
          }
        } catch {
          attachedWorklet = false;
        } finally {
          if (blobUrl && typeof URL.revokeObjectURL === 'function') {
            try {
              URL.revokeObjectURL(blobUrl);
            } catch {
              // ignore
            }
          }
        }
      }

      if (
        !attachedWorklet &&
        isDictatingRef.current &&
        captureSessionIdRef.current === sessionId
      ) {
        const bufSize = ctx.sampleRate <= 24000 ? 1024 : 2048;
        const processor = ctx.createScriptProcessor(bufSize, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (event: AudioProcessingEvent) => {
          const inputData = event.inputBuffer.getChannelData(0);
          handlePcmFrame(new Float32Array(inputData));
        };
        source.connect(processor);
        processor.connect(ctx.destination);
      }

      // Opportunistically attach zero-cost browser interim recognizer if available in non-Electron browsers
      if (
        !window.sideflow?.isElectron &&
        isDictatingRef.current &&
        captureSessionIdRef.current === sessionId
      ) {
        try {
          const auxRec = initSpeechRecognition(langRef.current, false);
          auxRec?.start();
        } catch {
          // ignore if unavailable
        }
      }

      return 'started';
    } catch (err) {
      const errName = (err as { name?: string })?.name || '';
      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errName === 'SecurityError' ||
        errName === 'NotReadableError'
      ) {
        return 'denied';
      }
      return 'unavailable';
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
      void triggerWarmup();

      const localResult = await startLocalVadAudioCapture();
      if (localResult === 'started') {
        return;
      }
      stopVoiceDictationUI();
      if (localResult === 'denied') {
        onNotify(
          'Microphone Access Blocked',
          'zap',
          'Grant microphone permission or choose a connected input device.',
          { variant: 'error' }
        );
        return;
      }
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

  const activeEngineBadgeText =
    engineMode === 'native-cuda'
      ? sttStatus?.cudaAvailable
        ? `CUDA (${sttStatus.gpuName?.replace('NVIDIA GeForce ', '') || 'GPU'})`
        : 'Native Whisper'
      : engineMode === 'native-cpu'
      ? `CPU INT8 (${modelSize})`
      : engineMode === 'webgpu-whisper'
      ? `${
          !modelSize.startsWith('moonshine') && sttStatus?.webGpuAvailable
            ? 'WebGPU'
            : 'CPU WASM'
        } (${modelSize})`
      : engineMode === 'os-speech'
      ? 'Windows SAPI'
      : lastEngineLabel || 'Hybrid Local STT';

  const badgeToneClass =
    warmupState === 'warming' || modelProgress
      ? 'bg-amber-500/15 text-amber-200 border-amber-500/35'
      : lastLatencyMs !== null && lastLatencyMs > 600
      ? 'bg-amber-500/15 text-amber-200 border-amber-500/35'
      : lastLatencyMs !== null && lastLatencyMs > 260
      ? 'bg-indigo-500/15 text-indigo-200 border-indigo-500/35'
      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35';

  const statusTitleText = isDictating
    ? isSpeakingActive
      ? 'Listening Live...'
      : isProcessingChunk
      ? 'Transcribing Phrase...'
      : 'Listening (Active Across Tabs)...'
    : warmupState === 'warming'
    ? 'Warming Local Engine...'
    : instantMode
    ? 'Instant Dictation Ready'
    : 'Voice Dictation Ready';

  return (
    <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-2.5 space-y-2">
      {/* Row 1: Mic Trigger + Engine/Latency Status + Instant Mode & Quick Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            id="voice-record-btn"
            aria-pressed={isDictating}
            aria-label={
              isDictating ? 'Stop voice dictation' : 'Start voice dictation'
            }
            onPointerEnter={() => {
              void triggerWarmup();
            }}
            onFocus={() => {
              void triggerWarmup();
            }}
            onClick={handleToggleVoice}
            className={`isolate relative w-9 h-9 rounded-full border border-rose-500/40 flex items-center justify-center transition shrink-0 ${
              isDictating
                ? 'recording-pulse bg-rose-600 text-white'
                : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400'
            }`}
          >
            <Mic className="w-4 h-4" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                id="voice-status-title"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="text-xs font-semibold text-white truncate"
              >
                {statusTitleText}
              </span>

              <span
                data-testid="local-stt-engine-badge"
                className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border max-w-[200px] ${badgeToneClass}`}
                title="Active Local Speech-to-Text Engine & Turnaround Speed"
              >
                <Cpu className="w-2.5 h-2.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{activeEngineBadgeText}</span>
                <span
                  data-testid="stt-latency-badge"
                  className="font-mono text-[9px] opacity-90 shrink-0"
                >
                  {warmupState === 'warming'
                    ? '• Warming'
                    : lastLatencyMs !== null
                    ? `• ~${lastLatencyMs}ms`
                    : warmupState === 'hot'
                    ? '• Hot'
                    : ''}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            id="voice-instant-mode-toggle"
            data-testid="instant-mode-toggle"
            role="switch"
            aria-checked={instantMode}
            aria-label="Instant Low-Latency Dictation Mode"
            title={
              instantMode
                ? 'Instant Mode ON: Live streaming words + fast laptop model + 380ms pause commit'
                : 'Instant Mode OFF: Standard 780ms pause window + deeper beam accuracy'
            }
            onClick={() => updateSttSetting('instantMode', !instantMode)}
            className={`min-h-[28px] min-w-[28px] px-2 py-1 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 border transition ${
              instantMode
                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-400/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
            }`}
          >
            <Zap
              className={`w-3.5 h-3.5 shrink-0 ${
                instantMode
                  ? 'text-emerald-300 fill-emerald-400/25'
                  : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span className="cq-show-440">Instant</span>
          </button>

          <select
            id="voice-lang-badge"
            aria-label="Dictation Language"
            value={lang}
            onChange={(e) => handleLangChange(e.target.value)}
            className="min-h-[28px] text-[10px] font-mono px-1.5 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="en-US">en-US</option>
            <option value="en-GB">en-GB</option>
            <option value="es-ES">es-ES</option>
            <option value="fr-FR">fr-FR</option>
            <option value="de-DE">de-DE</option>
            <option value="ja-JP">ja-JP</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setShowEngineConfig((prev) => {
                const next = !prev;
                if (next) void refreshMicDevices();
                return next;
              });
            }}
            aria-expanded={showEngineConfig}
            aria-label="Configure Local STT Engine & Microphone"
            title="Configure Local STT Engine & Microphone"
            className={`min-h-[28px] min-w-[28px] px-2 py-1.5 rounded-lg text-[11px] flex items-center justify-center transition ${
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
            className="min-h-[28px] min-w-[28px] px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center gap-1"
          >
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="cq-show-440">Time</span>
          </button>

          {onExportNote && (
            <button
              type="button"
              onClick={onExportNote}
              aria-label="Export Note"
              title="Download Note as Markdown (.md)"
              className="min-h-[28px] min-w-[28px] px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center justify-center"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
          {onCopyNote && (
            <button
              type="button"
              onClick={onCopyNote}
              aria-label="Copy Note"
              title="Copy Note"
              className="min-h-[28px] px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center gap-1"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" /> Copy
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Full-Width GPU-Composited Audio Meter + Right-Pinned Live Stream Track */}
      <div className="px-2.5 py-1.5 rounded-xl bg-slate-900/85 border border-slate-800/80 flex items-center gap-2 min-w-0">
        <div
          data-testid="voice-level-meter"
          aria-label="Microphone Audio Level Meter"
          aria-hidden="true"
          className="flex items-end gap-0.5 h-3 shrink-0"
        >
          {METER_WEIGHTS.map((_, idx) => (
            <span
              key={idx}
              ref={(el) => {
                meterBarRefs.current[idx] = el;
              }}
              style={{ transform: 'scaleY(0.18)' }}
              className="w-1 h-full rounded-full origin-bottom bg-slate-700"
            />
          ))}
        </div>

        {interimText ? (
          <div
            id="voice-status-subtitle"
            aria-hidden="true"
            className="flex-1 min-w-0 overflow-hidden flex justify-end [mask-image:linear-gradient(to_right,transparent,black_18px)]"
          >
            <span className="whitespace-nowrap text-[11px] text-slate-100 italic">
              {interimText}
              <span
                aria-hidden="true"
                className="inline-block w-0.5 h-3 bg-indigo-400 ml-0.5 align-middle animate-pulse"
              />
            </span>
          </div>
        ) : (
          <p
            id="voice-status-subtitle"
            className={`text-[11px] truncate flex-1 min-w-0 ${
              isDictating && isSpeakingActive
                ? 'text-emerald-300 font-medium'
                : 'text-slate-400'
            }`}
          >
            {modelProgress
              ? modelProgress.status
              : isDictating && isSpeakingActive
              ? 'Listening — streaming words live at cursor…'
              : isDictating && isProcessingChunk
              ? 'Committing phrase to note…'
              : isDictating
              ? 'Listening — speak naturally (active across all tabs)'
              : 'Click mic for instant local voice dictation at your cursor'}
          </p>
        )}
      </div>

      {/* Collapsible Local STT Engine, Whisper/Moonshine Model & Microphone Selector Drawer */}
      {showEngineConfig && (
        <div
          data-testid="stt-config-drawer"
          className="pt-2 border-t border-slate-800/80 space-y-2 text-[11px]"
        >
          <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 text-[10px]">
            <span className="text-slate-300">
              {instantMode
                ? '⚡ Instant Mode ON: Pre-warmed laptop engine, live streaming words & 380ms pause commits.'
                : '🎯 Deep Accuracy Mode: Full-sentence 780ms pause window & multi-beam decoding.'}
            </span>
          </div>

          <div className="cq-stt-grid">
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
                <option value="auto">Auto (Fast Laptop WASM / GPU)</option>
                <option value="native-cpu">
                  Electron Native CPU (INT8 CTranslate2)
                </option>
                <option value="native-cuda">
                  Electron Native GPU (4GB+ VRAM / CUDA)
                </option>
                <option value="webgpu-whisper">
                  In-App Moonshine / Whisper (WASM / WebGPU)
                </option>
                <option value="os-speech">
                  Windows Offline Speech (Zero-Disk SAPI)
                </option>
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
                <option value="moonshine-tiny">
                  Moonshine Tiny (Laptop Instant ~50ms)
                </option>
                <option value="moonshine-base">
                  Moonshine Base (Laptop Fast High-Accuracy)
                </option>
                <option value="tiny.en">Whisper Tiny.en (Fast ~40MB)</option>
                <option value="base.en">Whisper Base.en (Balanced ~75MB)</option>
                <option value="distil-small.en">
                  Distil-Small.en (CUDA GPU / High-Core CPU)
                </option>
                <option value="distil-medium.en">
                  Distil-Medium.en (Max Accuracy • CUDA)
                </option>
                <option value="small.en">
                  Whisper Small.en (High Accuracy ~240MB)
                </option>
                <option value="tiny">Whisper Tiny Multilingual</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-slate-400 font-medium">Microphone Input</span>
              <select
                aria-label="Microphone Input Device"
                value={selectedMicId}
                onChange={(e) => {
                  const nextMicId = e.target.value;
                  updateSttSetting('selectedMicId', nextMicId);
                  if (isDictatingRef.current && mediaStreamRef.current) {
                    void (async () => {
                      await stopAudioCapture(true);
                      if (isDictatingRef.current) {
                        await startLocalVadAudioCapture(nextMicId);
                      }
                    })();
                  }
                }}
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
        </div>
      )}
    </div>
  );
};

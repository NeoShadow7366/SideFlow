import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Mic,
  Clock,
  Copy,
  Download,
  Cpu,
  SlidersHorizontal,
  Zap,
  Users,
  Volume2,
} from 'lucide-react';
import {
  DialogueSpeakerRole,
  LocalSttStatus,
  NotifyFn,
  SttEngineMode,
  SttSettings,
  TranscriptCommitMeta,
  WhisperModelId,
} from '../../types/sideflow';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  computeRmsLevel,
  detectLocalSttCapabilities,
  ExternalBleedState,
  getEffectiveExternalRms,
  mergeFloat32Chunks,
  mergeRecentFloat32Chunks,
  preloadLocalSttEngine,
  resampleTo16kHz,
  setWhisperProgressListener,
  shouldSuppressPrimaryMicBleed,
  transcribeAudioChunkHybrid,
  updateExternalBleedState,
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
  speakerRole?: DialogueSpeakerRole;
  speakerLabel?: string;
  isDialogue?: boolean;
}

interface VoiceBarProps {
  onTranscript: (text: string, meta?: TranscriptCommitMeta) => void;
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

interface ChannelCaptureState {
  role: DialogueSpeakerRole;
  mediaStream: MediaStream | null;
  audioContext: AudioContext | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  silentGain: GainNode | null;
  workletNode: AudioWorkletNode | null;
  processorNode: ScriptProcessorNode | null;
  preRollChunks: Float32Array[];
  recordedChunks: Float32Array[];
  chunkSampleCount: number;
  vadSpeechActive: boolean;
  lastVoiceTimestamp: number;
  chunkStartTimestamp: number;
  lastPartialRunAt: number;
  utteranceId: number;
  audioLevel: number;
}

function createEmptyChannelState(role: DialogueSpeakerRole): ChannelCaptureState {
  return {
    role,
    mediaStream: null,
    audioContext: null,
    sourceNode: null,
    silentGain: null,
    workletNode: null,
    processorNode: null,
    preRollChunks: [],
    recordedChunks: [],
    chunkSampleCount: 0,
    vadSpeechActive: false,
    lastVoiceTimestamp: 0,
    chunkStartTimestamp: 0,
    lastPartialRunAt: 0,
    utteranceId: 0,
    audioLevel: 0,
  };
}

const DEFAULT_STT_SETTINGS: SttSettings = {
  lang: 'en-US',
  engineMode: 'auto',
  modelSize: 'moonshine-tiny',
  selectedMicId: 'default',
  instantMode: true,
  dialogueMode: false,
  secondarySourceId: 'system-loopback',
  primarySpeakerLabel: 'You',
  secondarySpeakerLabel: 'External',
  dialogueTimestamps: false,
  bleedSuppression: true,
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
  isPanelOpen = true,
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
  const dialogueMode = sttSettings.dialogueMode ?? false;
  const secondarySourceId = sttSettings.secondarySourceId || 'system-loopback';
  const rawPrimaryLabel = sttSettings.primarySpeakerLabel ?? 'You';
  const rawSecondaryLabel = sttSettings.secondarySpeakerLabel ?? 'External';
  const primarySpeakerLabel = rawPrimaryLabel.trim() || 'You';
  const secondarySpeakerLabel = rawSecondaryLabel.trim() || 'External';
  const dialogueTimestamps = sttSettings.dialogueTimestamps ?? false;
  const bleedSuppression = sttSettings.bleedSuppression ?? true;

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
  const [activeSpeakerRole, setActiveSpeakerRole] =
    useState<DialogueSpeakerRole>('primary');
  const [externalStreamConnected, setExternalStreamConnected] = useState(false);
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
  const [isInstallingPythonStt, setIsInstallingPythonStt] = useState(false);

  const handleInstallPythonStt = async () => {
    if (isInstallingPythonStt) return;
    if (!window.sideflow?.installLocalPythonStt) {
      try {
        await navigator.clipboard?.writeText('pip install faster-whisper');
      } catch {
        // ignore
      }
      onNotify(
        'Copied Python Setup Command',
        'check',
        'Run "pip install faster-whisper" in your terminal (or click 1-Click Install in the Desktop App)'
      );
      return;
    }

    setIsInstallingPythonStt(true);
    onNotify(
      'Provisioning Python Voice Engine...',
      'sparkles',
      'Creating isolated SideFlow venv and installing faster-whisper'
    );
    try {
      const res = await window.sideflow.installLocalPythonStt();
      if (res.success && res.status) {
        setSttStatus((prev) => ({
          ...prev,
          ...res.status!,
        }));
        onNotify(
          'Native Faster-Whisper Ready',
          'check',
          res.message || 'CTranslate2 local voice engine activated'
        );
      } else {
        onNotify(
          'Python Engine Setup Incomplete',
          'zap',
          res.error || 'Could not provision faster-whisper automatically',
          { variant: 'warning' }
        );
      }
    } catch (err) {
      onNotify(
        'Python Engine Setup Error',
        'zap',
        err instanceof Error ? err.message : 'Installation failed',
        { variant: 'error' }
      );
    } finally {
      setIsInstallingPythonStt(false);
    }
  };

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
  const selectedMicIdRef = useRef(selectedMicId);
  selectedMicIdRef.current = selectedMicId;
  const dialogueModeRef = useRef(dialogueMode);
  dialogueModeRef.current = dialogueMode;
  const secondarySourceIdRef = useRef(secondarySourceId);
  secondarySourceIdRef.current = secondarySourceId;
  const primarySpeakerLabelRef = useRef(primarySpeakerLabel);
  primarySpeakerLabelRef.current = primarySpeakerLabel;
  const secondarySpeakerLabelRef = useRef(secondarySpeakerLabel);
  secondarySpeakerLabelRef.current = secondarySpeakerLabel;
  const dialogueTimestampsRef = useRef(dialogueTimestamps);
  dialogueTimestampsRef.current = dialogueTimestamps;
  const bleedSuppressionRef = useRef(bleedSuppression);
  bleedSuppressionRef.current = bleedSuppression;

  // Zero-re-render audio level visualizer bar refs (Primary Mic + External Source)
  const meterBarRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const extMeterBarRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const meterRafRef = useRef<number | null>(null);

  // Dual-Channel WebAudio VAD, Pre-Roll Lookback, Cross-Channel Bleed Gate & Shared FIFO Queue refs
  const channelsRef = useRef<{
    primary: ChannelCaptureState;
    external: ChannelCaptureState;
  }>({
    primary: createEmptyChannelState('primary'),
    external: createEmptyChannelState('external'),
  });
  const bleedStateRef = useRef<ExternalBleedState>({
    peakRms: 0,
    lastActiveMs: 0,
  });
  const captureSessionIdRef = useRef<number>(0);
  const captureLifecycleRef = useRef<Promise<void>>(Promise.resolve());
  const partialInFlightRef = useRef<boolean>(false);
  const finalInFlightCountRef = useRef<number>(0);
  const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());
  const warmupKeyRef = useRef<string>('');

  const syncCombinedSpeakingState = useCallback(() => {
    const primActive = channelsRef.current.primary.vadSpeechActive;
    const extActive = channelsRef.current.external.vadSpeechActive;
    setIsSpeakingActive(primActive || extActive);
  }, []);

  // Notify parent NotesView of non-destructive live interim HUD updates (with speaker attribution in Dialogue Mode)
  useEffect(() => {
    const activeLabel =
      activeSpeakerRole === 'external'
        ? secondarySpeakerLabel
        : primarySpeakerLabel;
    onInterimChangeRef.current?.({
      text: interimText,
      isSpeaking: isDictating && isSpeakingActive,
      isProcessing: isProcessingChunk,
      ...(dialogueMode
        ? {
            isDialogue: true,
            speakerRole: activeSpeakerRole,
            speakerLabel: activeLabel,
          }
        : {}),
    });
  }, [
    interimText,
    isDictating,
    isSpeakingActive,
    isProcessingChunk,
    dialogueMode,
    activeSpeakerRole,
    primarySpeakerLabel,
    secondarySpeakerLabel,
  ]);

  // GPU-composited ~24fps visualizer loop (suspended when panel is closed or Notes tab is hidden)
  useEffect(() => {
    if (!isDictating || !isPanelOpen || !isActiveTab) {
      if (!isDictating) {
        channelsRef.current.primary.audioLevel = 0;
        channelsRef.current.external.audioLevel = 0;
      }
      const idleCls =
        'w-1 h-full rounded-full origin-bottom bg-slate-700 transition-colors duration-75';
      for (const bar of meterBarRefs.current) {
        if (bar) {
          bar.style.transform = 'scaleY(0.18)';
          bar.className = idleCls;
        }
      }
      for (const bar of extMeterBarRefs.current) {
        if (bar) {
          bar.style.transform = 'scaleY(0.18)';
          bar.className = idleCls;
        }
      }
      return;
    }

    let lastPaint = 0;
    let active = true;
    const prevPrimScales = new Float32Array(METER_WEIGHTS.length);
    const prevExtScales = new Float32Array(METER_WEIGHTS.length);
    const tick = (now: number) => {
      if (!active) return;
      if (now - lastPaint >= 42) {
        lastPaint = now;
        const primLevel = channelsRef.current.primary.audioLevel;
        const primActive = dialogueModeRef.current
          ? channelsRef.current.primary.vadSpeechActive
          : primLevel > 0.026;
        const primCls = primActive
          ? dialogueModeRef.current
            ? 'w-1 h-full rounded-full origin-bottom bg-indigo-400'
            : 'w-1 h-full rounded-full origin-bottom bg-emerald-400'
          : 'w-1 h-full rounded-full origin-bottom bg-rose-400/70';

        for (let i = 0; i < METER_WEIGHTS.length; i++) {
          const bar = meterBarRefs.current[i];
          if (!bar) continue;
          const scale = Math.max(
            0.18,
            Math.min(1, Number((primLevel * METER_WEIGHTS[i]).toFixed(3)))
          );
          if (Math.abs(scale - prevPrimScales[i]) >= 0.012) {
            prevPrimScales[i] = scale;
            bar.style.transform = `scaleY(${scale})`;
          }
          if (bar.className !== primCls) {
            bar.className = primCls;
          }
        }

        if (dialogueModeRef.current) {
          const extLevel = channelsRef.current.external.audioLevel;
          const extActive = extLevel > 0.022;
          const extCls = extActive
            ? 'w-1 h-full rounded-full origin-bottom bg-cyan-300'
            : 'w-1 h-full rounded-full origin-bottom bg-cyan-500/45';

          for (let i = 0; i < METER_WEIGHTS.length; i++) {
            const bar = extMeterBarRefs.current[i];
            if (!bar) continue;
            const scale = Math.max(
              0.18,
              Math.min(1, Number((extLevel * METER_WEIGHTS[i]).toFixed(3)))
            );
            if (Math.abs(scale - prevExtScales[i]) >= 0.012) {
              prevExtScales[i] = scale;
              bar.style.transform = `scaleY(${scale})`;
            }
            if (bar.className !== extCls) {
              bar.className = extCls;
            }
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
  }, [isDictating, dialogueMode, isPanelOpen, isActiveTab]);

  const setDictatingState = useCallback((next: boolean) => {
    isDictatingRef.current = next;
    setIsDictating(next);
    if (!next) {
      setIsSpeakingActive(false);
      setExternalStreamConnected(false);
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
    if (!isActiveTab) return;
    let mounted = true;
    void refreshMicDevices();
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
  }, [isActiveTab, refreshMicDevices]);

  // Reset warmup state when engine/model settings change; defer model allocation until mic hover/focus/record
  useEffect(() => {
    warmupKeyRef.current = '';
    setWarmupState('idle');
    if (!isDictatingRef.current) return;

    const timer = window.setTimeout(() => {
      void triggerWarmup();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [engineMode, modelSize, lang, instantMode, triggerWarmup]);

  const runLivePartialPreview = useCallback(
    async (
      role: DialogueSpeakerRole,
      sampleRate: number,
      targetUtteranceId: number
    ) => {
      const chan = channelsRef.current[role];
      if (
        partialInFlightRef.current ||
        finalInFlightCountRef.current > 0 ||
        !chan.vadSpeechActive ||
        !isDictatingRef.current
      ) {
        return;
      }

      const maxWindowSamples = Math.round(sampleRate * 4.5);
      const recentSamples = mergeRecentFloat32Chunks(
        chan.recordedChunks,
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
          chan.utteranceId === targetUtteranceId &&
          chan.vadSpeechActive &&
          isDictatingRef.current &&
          res.success &&
          res.text &&
          res.text.trim()
        ) {
          setActiveSpeakerRole(role);
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

  const flushChannelChunk = useCallback(
    (
      role: DialogueSpeakerRole,
      sampleRate: number,
      dialogueOverride?: boolean
    ): Promise<void> => {
      const chan = channelsRef.current[role];
      const chunks = chan.recordedChunks;
      if (chunks.length === 0) return Promise.resolve();

      // Advance channel utteranceId immediately so any in-flight partial preview cannot overwrite committed state
      chan.utteranceId += 1;
      chan.recordedChunks = [];
      chan.chunkSampleCount = 0;
      chan.vadSpeechActive = false;
      syncCombinedSpeakingState();

      const merged = mergeFloat32Chunks(chunks);
      const audio16k = resampleTo16kHz(merged, sampleRate);
      if (audio16k.length < 1200) {
        if (
          finalInFlightCountRef.current === 0 &&
          !channelsRef.current.primary.vadSpeechActive &&
          !channelsRef.current.external.vadSpeechActive
        ) {
          setInterimText('');
        }
        return Promise.resolve();
      }

      // Snapshot speaker metadata & pause timestamp at capture time so turn ordering stays strictly chronological
      const capturedAt = Date.now();
      const isDialogue = dialogueOverride ?? dialogueModeRef.current;
      const speakerLabel =
        role === 'external'
          ? secondarySpeakerLabelRef.current
          : primarySpeakerLabelRef.current;
      const timestampText = new Date(capturedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const commitMeta: TranscriptCommitMeta | undefined = isDialogue
        ? {
            isDialogue: true,
            speakerRole: role,
            speakerLabel,
            includeTimestamp: dialogueTimestampsRef.current,
            timestampText,
            capturedAt,
          }
        : undefined;

      finalInFlightCountRef.current += 1;
      setActiveSpeakerRole(role);
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
            if (commitMeta) {
              onTranscriptRef.current(res.text.trim(), commitMeta);
            } else {
              onTranscriptRef.current(res.text.trim());
            }
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
            if (
              !channelsRef.current.primary.vadSpeechActive &&
              !channelsRef.current.external.vadSpeechActive
            ) {
              setInterimText('');
            }
          }
        }
      });

      transcriptionQueueRef.current = job.catch(() => {});
      return job;
    },
    [syncCombinedSpeakingState]
  );

  const teardownChannelNodes = async (
    chan: ChannelCaptureState
  ): Promise<void> => {
    if (chan.silentGain) {
      try {
        chan.silentGain.disconnect();
      } catch {
        // ignore
      }
      chan.silentGain = null;
    }

    if (chan.workletNode) {
      try {
        chan.workletNode.port.onmessage = null;
        chan.workletNode.disconnect();
      } catch {
        // ignore
      }
      chan.workletNode = null;
    }

    if (chan.processorNode) {
      try {
        chan.processorNode.disconnect();
        chan.processorNode.onaudioprocess = null;
      } catch {
        // ignore
      }
      chan.processorNode = null;
    }

    if (chan.sourceNode) {
      try {
        chan.sourceNode.disconnect();
      } catch {
        // ignore
      }
      chan.sourceNode = null;
    }

    if (chan.mediaStream) {
      try {
        chan.mediaStream.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      chan.mediaStream = null;
    }

    if (chan.audioContext) {
      const ctxToClose = chan.audioContext;
      chan.audioContext = null;
      try {
        await ctxToClose.close();
      } catch {
        // ignore
      }
    }

    chan.audioLevel = 0;
    chan.preRollChunks = [];
  };

  const stopAudioCapture = useCallback(
    async (flushRemaining = true, dialogueOverride?: boolean) => {
      captureSessionIdRef.current += 1;
      const wasDialogue = dialogueOverride ?? dialogueModeRef.current;
      const primaryChan = channelsRef.current.primary;
      const externalChan = channelsRef.current.external;
      const primaryRate = primaryChan.audioContext?.sampleRate || 16000;
      const externalRate = externalChan.audioContext?.sampleRate || 16000;
      const primaryShouldFlush =
        flushRemaining &&
        primaryChan.recordedChunks.length > 0 &&
        primaryChan.vadSpeechActive;
      const externalShouldFlush =
        flushRemaining &&
        externalChan.recordedChunks.length > 0 &&
        externalChan.vadSpeechActive;

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

      await Promise.all([
        teardownChannelNodes(primaryChan),
        teardownChannelNodes(externalChan),
      ]);
      setExternalStreamConnected(false);
      bleedStateRef.current = { peakRms: 0, lastActiveMs: 0 };

      const pendingFlushes: Array<{
        role: DialogueSpeakerRole;
        rate: number;
        startedAt: number;
      }> = [];
      if (primaryShouldFlush) {
        pendingFlushes.push({
          role: 'primary',
          rate: primaryRate,
          startedAt: primaryChan.chunkStartTimestamp,
        });
      } else {
        primaryChan.utteranceId += 1;
        primaryChan.recordedChunks = [];
        primaryChan.chunkSampleCount = 0;
        primaryChan.vadSpeechActive = false;
      }

      if (externalShouldFlush) {
        pendingFlushes.push({
          role: 'external',
          rate: externalRate,
          startedAt: externalChan.chunkStartTimestamp,
        });
      } else {
        externalChan.utteranceId += 1;
        externalChan.recordedChunks = [];
        externalChan.chunkSampleCount = 0;
        externalChan.vadSpeechActive = false;
      }

      syncCombinedSpeakingState();

      if (pendingFlushes.length > 0) {
        pendingFlushes.sort((a, b) => a.startedAt - b.startedAt);
        const jobs = pendingFlushes.map((item) =>
          flushChannelChunk(item.role, item.rate, wasDialogue)
        );
        await Promise.all(jobs);
      } else if (flushRemaining) {
        await transcriptionQueueRef.current;
      }
    },
    [flushChannelChunk, syncCombinedSpeakingState]
  );

  const stopVoiceDictationUI = useCallback(() => {
    setDictatingState(false);
    setInterimText('');
    channelsRef.current.primary.audioLevel = 0;
    channelsRef.current.external.audioLevel = 0;
  }, [setDictatingState]);

  const triggerSimulatedFallback = useCallback(() => {
    if (dialogueModeRef.current) {
      const stamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const includeTs = dialogueTimestampsRef.current;
      onTranscriptRef.current(
        'Can we confirm the rollout checklist before Friday?',
        {
          isDialogue: true,
          speakerRole: 'primary',
          speakerLabel: primarySpeakerLabelRef.current,
          includeTimestamp: includeTs,
          timestampText: stamp,
          capturedAt: Date.now(),
        }
      );
      onTranscriptRef.current(
        'Yes, staging sign-off passed and rollback alerts are verified.',
        {
          isDialogue: true,
          speakerRole: 'external',
          speakerLabel: secondarySpeakerLabelRef.current,
          includeTimestamp: includeTs,
          timestampText: stamp,
          capturedAt: Date.now() + 1,
        }
      );
      onNotifyRef.current(
        'Simulated Dialogue Added',
        'mic',
        `${primarySpeakerLabelRef.current} & ${secondarySpeakerLabelRef.current} sample turns inserted`
      );
      return;
    }

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
        setActiveSpeakerRole('primary');
        setInterimText(currentInterim);
      }
      if (useForFinalTranscript && finalTranscript.trim()) {
        if (dialogueModeRef.current) {
          const stamp = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          onTranscriptRef.current(finalTranscript.trim(), {
            isDialogue: true,
            speakerRole: 'primary',
            speakerLabel: primarySpeakerLabelRef.current,
            includeTimestamp: dialogueTimestampsRef.current,
            timestampText: stamp,
            capturedAt: Date.now(),
          });
        } else {
          onTranscriptRef.current(finalTranscript.trim());
        }
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

  const acquireExternalMediaStream = async (
    targetExtId: string
  ): Promise<{
    stream: MediaStream | null;
    reason: 'ok' | 'no-audio-track' | 'denied' | 'unavailable';
  }> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return { stream: null, reason: 'unavailable' };
    }

    if (targetExtId === 'system-loopback') {
      if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
        return { stream: null, reason: 'unavailable' };
      }
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1, height: 1, frameRate: 1 },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        // Immediately stop and detach any temporary screen/video tracks so zero screen capture persists
        const videoTracks =
          typeof displayStream.getVideoTracks === 'function'
            ? displayStream.getVideoTracks()
            : displayStream
                .getTracks()
                .filter((track) => track.kind === 'video');
        for (const vt of videoTracks) {
          try {
            vt.stop();
            if (typeof displayStream.removeTrack === 'function') {
              displayStream.removeTrack(vt);
            }
          } catch {
            // ignore
          }
        }

        const audioTracks =
          typeof displayStream.getAudioTracks === 'function'
            ? displayStream.getAudioTracks()
            : displayStream
                .getTracks()
                .filter((track) => track.kind === 'audio');
        if (audioTracks.length === 0) {
          displayStream.getTracks().forEach((t) => t.stop());
          return { stream: null, reason: 'no-audio-track' };
        }
        return { stream: displayStream, reason: 'ok' };
      } catch (err) {
        const errName = (err as { name?: string })?.name || '';
        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errName === 'AbortError'
        ) {
          return { stream: null, reason: 'denied' };
        }
        return { stream: null, reason: 'unavailable' };
      }
    }

    try {
      const extStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: { exact: targetExtId },
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      return { stream: extStream, reason: 'ok' };
    } catch (err) {
      const errName = (err as { name?: string })?.name || '';
      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errName === 'NotReadableError'
      ) {
        return { stream: null, reason: 'denied' };
      }
      return { stream: null, reason: 'unavailable' };
    }
  };

  const attachChannelWebAudio = async (
    role: DialogueSpeakerRole,
    stream: MediaStream,
    sessionId: number,
    AudioCtx: typeof AudioContext
  ): Promise<boolean> => {
    const chan = channelsRef.current[role];
    if (chan.mediaStream || chan.audioContext) {
      await teardownChannelNodes(chan);
    }

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
      return false;
    }

    chan.mediaStream = stream;
    chan.audioContext = ctx;
    const source = ctx.createMediaStreamSource(stream);
    chan.sourceNode = source;

    chan.preRollChunks = [];
    chan.recordedChunks = [];
    chan.chunkSampleCount = 0;
    chan.vadSpeechActive = false;
    chan.utteranceId += 1;
    const now = performance.now();
    chan.lastVoiceTimestamp = now;
    chan.chunkStartTimestamp = now;
    chan.lastPartialRunAt = now;
    chan.audioLevel = 0;

    // Cleanly flush, close AudioContext, and reset bleed state if an external loopback/device track ends mid-session
    if (role === 'external') {
      const audioTracks =
        typeof stream.getAudioTracks === 'function'
          ? stream.getAudioTracks()
          : stream.getTracks();
      for (const track of audioTracks) {
        track.onended = () => {
          if (captureSessionIdRef.current !== sessionId) return;
          const rate = ctx.sampleRate || 16000;
          const shouldFlush =
            chan.recordedChunks.length > 0 && chan.vadSpeechActive;
          bleedStateRef.current = { peakRms: 0, lastActiveMs: 0 };
          setExternalStreamConnected(false);
          void teardownChannelNodes(chan);
          if (shouldFlush) {
            void flushChannelChunk('external', rate);
          }
        };
      }
    }

    const baseThreshold = role === 'external' ? 0.022 : 0.026;

    const handlePcmFrame = (frameCopy: Float32Array) => {
      if (
        !isDictatingRef.current ||
        captureSessionIdRef.current !== sessionId
      ) {
        return;
      }

      const rms = computeRmsLevel(frameCopy);
      chan.audioLevel = rms;
      const ts = performance.now();

      if (role === 'external') {
        bleedStateRef.current = updateExternalBleedState(
          bleedStateRef.current,
          rms,
          ts
        );
      }

      let effectiveThreshold = baseThreshold;
      if (
        role === 'primary' &&
        dialogueModeRef.current &&
        bleedSuppressionRef.current
      ) {
        const effectiveExternalRms = getEffectiveExternalRms(
          bleedStateRef.current,
          channelsRef.current.external.audioLevel,
          ts
        );
        const bleedEval = shouldSuppressPrimaryMicBleed({
          primaryRms: rms,
          effectiveExternalRms,
          baseVadThreshold: baseThreshold,
          primaryAlreadySpeaking: chan.vadSpeechActive,
        });
        effectiveThreshold = bleedEval.effectiveThreshold;
      }

      const isFastMode = instantModeRef.current;
      const silenceFlushMs = isFastMode ? 380 : 780;
      const maxChunkMs = isFastMode ? 4200 : 8000;
      const frameDurationMs = Math.max(
        16,
        (frameCopy.length / (ctx.sampleRate || 16000)) * 1000
      );
      const preRollFrames = Math.max(3, Math.ceil(280 / frameDurationMs));

      if (rms >= effectiveThreshold) {
        if (!chan.vadSpeechActive) {
          chan.vadSpeechActive = true;
          chan.utteranceId += 1;
          chan.chunkStartTimestamp = ts;
          chan.lastPartialRunAt = ts;
          setActiveSpeakerRole(role);
          syncCombinedSpeakingState();
          // Prepend ~280ms pre-roll lookback buffer so initial consonants/words are 100% preserved
          if (chan.preRollChunks.length > 0) {
            for (const preFrame of chan.preRollChunks) {
              chan.recordedChunks.push(preFrame);
              chan.chunkSampleCount += preFrame.length;
            }
            chan.preRollChunks = [];
          }
        }
        chan.lastVoiceTimestamp = ts;
      }

      if (chan.vadSpeechActive) {
        chan.recordedChunks.push(frameCopy);
        chan.chunkSampleCount += frameCopy.length;

        const silenceDuration = ts - chan.lastVoiceTimestamp;
        const totalDuration = ts - chan.chunkStartTimestamp;
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
          void flushChannelChunk(role, ctx.sampleRate || 16000);
        } else if (
          isFastMode &&
          totalDuration >= 360 &&
          ts - chan.lastPartialRunAt >= 550
        ) {
          chan.lastPartialRunAt = ts;
          void runLivePartialPreview(
            role,
            ctx.sampleRate || 16000,
            chan.utteranceId
          );
        }
      } else {
        // Maintain rolling ~280ms pre-roll lookback buffer while waiting for speech onset
        chan.preRollChunks.push(frameCopy);
        if (chan.preRollChunks.length > preRollFrames) {
          chan.preRollChunks.shift();
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
            'sideflow-pcm-processor',
            {
              channelCount: 1,
              channelCountMode: 'explicit',
              channelInterpretation: 'speakers',
            }
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
            chan.silentGain = silentGain;
          }
          chan.workletNode = workletNode;
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
      chan.processorNode = processor;
      processor.onaudioprocess = (event: AudioProcessingEvent) => {
        const inputData = event.inputBuffer.getChannelData(0);
        handlePcmFrame(new Float32Array(inputData));
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    }

    if (
      !isDictatingRef.current ||
      captureSessionIdRef.current !== sessionId ||
      (!chan.workletNode && !chan.processorNode)
    ) {
      await teardownChannelNodes(chan);
      return false;
    }

    return true;
  };

  const startLocalVadAudioCapture = async (overrides?: {
    micId?: string;
    dialogue?: boolean;
    extSourceId?: string;
  }): Promise<'started' | 'denied' | 'unavailable'> => {
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
    const targetMicId = overrides?.micId ?? selectedMicIdRef.current;
    const useDialogue = overrides?.dialogue ?? dialogueModeRef.current;
    const targetExtId = overrides?.extSourceId ?? secondarySourceIdRef.current;

    bleedStateRef.current = { peakRms: 0, lastActiveMs: 0 };

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

      const primaryStream = await navigator.mediaDevices.getUserMedia(
        constraints
      );
      if (
        !isDictatingRef.current ||
        captureSessionIdRef.current !== sessionId
      ) {
        primaryStream.getTracks().forEach((track) => track.stop());
        return 'started';
      }

      void refreshMicDevices();
      const attachedPrimary = await attachChannelWebAudio(
        'primary',
        primaryStream,
        sessionId,
        AudioCtx
      );
      if (!attachedPrimary) {
        return 'started';
      }

      // Attach Source 2 (PC System Audio Loopback or Secondary Input Device) when Dialogue Mode is active
      if (
        useDialogue &&
        isDictatingRef.current &&
        captureSessionIdRef.current === sessionId
      ) {
        const extRes = await acquireExternalMediaStream(targetExtId);
        if (
          !isDictatingRef.current ||
          captureSessionIdRef.current !== sessionId
        ) {
          extRes.stream?.getTracks().forEach((t) => t.stop());
          return 'started';
        }

        if (extRes.stream) {
          const attachedExt = await attachChannelWebAudio(
            'external',
            extRes.stream,
            sessionId,
            AudioCtx
          );
          setExternalStreamConnected(attachedExt);
        } else {
          setExternalStreamConnected(false);
          if (extRes.reason === 'no-audio-track') {
            onNotifyRef.current(
              'External Audio Track Not Shared',
              'zap',
              'Check "Share system/tab audio" or pick a secondary audio input device.',
              { variant: 'warning' }
            );
          } else {
            onNotifyRef.current(
              'External Audio Source Unavailable',
              'zap',
              'Continuing on primary mic — verify your secondary source in STT settings.',
              { variant: 'warning' }
            );
          }
        }
      } else {
        setExternalStreamConnected(false);
      }

      // Opportunistically attach zero-cost browser interim recognizer only for single-mic non-Electron sessions
      if (
        !window.sideflow?.isElectron &&
        !useDialogue &&
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

  const restartActiveCaptureIfRecording = (prevDialogueMode?: boolean) => {
    if (!isDictatingRef.current) return;

    const job = captureLifecycleRef.current.then(async () => {
      if (!isDictatingRef.current) return;
      await stopAudioCapture(true, prevDialogueMode);
      if (!isDictatingRef.current) return;

      const res = await startLocalVadAudioCapture();
      if (res !== 'started' && isDictatingRef.current) {
        stopVoiceDictationUI();
        if (res === 'denied') {
          onNotifyRef.current(
            'Microphone Access Blocked',
            'zap',
            'Grant microphone permission or choose a connected input device.',
            { variant: 'error' }
          );
        }
      }
    });
    captureLifecycleRef.current = job.catch(() => {});
  };

  const handleToggleDialogueMode = () => {
    const prevDialogue = dialogueModeRef.current;
    const nextDialogue = !dialogueMode;
    dialogueModeRef.current = nextDialogue;
    updateSttSetting('dialogueMode', nextDialogue);
    if (nextDialogue) {
      void refreshMicDevices();
    }
    restartActiveCaptureIfRecording(prevDialogue);
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
      const stopJob = captureLifecycleRef.current.then(async () => {
        await stopAudioCapture(true);
      });
      captureLifecycleRef.current = stopJob.catch(() => {});
      await stopJob;
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

      const startJob = captureLifecycleRef.current.then(
        async (): Promise<'started' | 'denied' | 'unavailable'> => {
          if (!isDictatingRef.current) {
            return 'started';
          }
          return startLocalVadAudioCapture();
        }
      );
      captureLifecycleRef.current = startJob.then(
        () => {},
        () => {}
      );
      const localResult = await startJob;

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

  const activeSpeakerDisplayName =
    activeSpeakerRole === 'external'
      ? secondarySpeakerLabel
      : primarySpeakerLabel;

  const statusTitleText = isDictating
    ? dialogueMode
      ? isSpeakingActive
        ? `Dialogue Live (${activeSpeakerDisplayName})...`
        : isProcessingChunk
        ? `Transcribing ${activeSpeakerDisplayName}...`
        : externalStreamConnected
        ? `Dialogue Listening (${primarySpeakerLabel} + ${secondarySpeakerLabel})`
        : `Dialogue Listening (${primarySpeakerLabel})`
      : isSpeakingActive
      ? 'Listening Live...'
      : isProcessingChunk
      ? 'Transcribing Phrase...'
      : 'Listening (Active Across Tabs)...'
    : warmupState === 'warming'
    ? 'Warming Local Engine...'
    : dialogueMode
    ? 'Dialogue Ready (2 Sources)'
    : instantMode
    ? 'Instant Dictation Ready'
    : 'Voice Dictation Ready';

  return (
    <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-2.5 space-y-2">
      {/* Row 1: Mic Trigger + Engine/Latency Status + Dialogue / Instant Mode & Quick Controls */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <div className="flex items-center gap-2 min-w-[155px] flex-1">
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
            className={`isolate relative w-9 h-9 rounded-full border border-rose-500/40 flex items-center justify-center transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
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
                className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border min-w-0 max-w-[min(200px,100%)] ${badgeToneClass}`}
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
            id="voice-dialogue-mode-toggle"
            data-testid="dialogue-mode-toggle"
            role="switch"
            aria-checked={dialogueMode}
            aria-label="Dialogue Mode (Dual Audio Source)"
            title={
              dialogueMode
                ? `Dialogue Mode ON: Transcribes ${primarySpeakerLabel} (Mic) + ${secondarySpeakerLabel} (PC Audio / 2nd Input) with speaker labels`
                : 'Enable 2-Source Dialogue Mode (User Mic + PC Call Audio / External Source)'
            }
            onClick={handleToggleDialogueMode}
            className={`min-h-[28px] min-w-[28px] px-2 py-1 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              dialogueMode
                ? 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border-cyan-400/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
            }`}
          >
            <Users
              className={`w-3.5 h-3.5 shrink-0 ${
                dialogueMode ? 'text-cyan-300' : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span className="cq-show-440">Dialogue</span>
          </button>

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
            className={`min-h-[28px] min-w-[28px] px-2 py-1 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
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
            className={`min-h-[28px] min-w-[28px] px-2 py-1.5 rounded-lg text-[11px] flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
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
            className="min-h-[28px] min-w-[28px] px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center gap-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
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
              className="min-h-[28px] min-w-[28px] px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center justify-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
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
              className="min-h-[28px] min-w-[28px] px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 flex items-center gap-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="cq-show-440">Copy</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: GPU-Composited Audio Level Meter(s) + Right-Pinned Live Stream Track */}
      <div className="px-2.5 py-1.5 rounded-xl bg-slate-900/85 border border-slate-800/80 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          {dialogueMode && (
            <span
              className="text-[9px] font-semibold uppercase tracking-wide text-indigo-300 max-w-[44px] truncate"
              title={`Primary Microphone: ${primarySpeakerLabel}`}
            >
              {primarySpeakerLabel}
            </span>
          )}
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

          {dialogueMode && (
            <>
              <span
                className="h-3 w-px bg-slate-800 mx-0.5"
                aria-hidden="true"
              />
              <Volume2
                className={`w-3 h-3 shrink-0 cq-show-440 ${
                  isDictating && !externalStreamConnected
                    ? 'text-amber-400/80'
                    : 'text-cyan-400'
                }`}
                aria-hidden="true"
              />
              <span
                className={`text-[9px] font-semibold uppercase tracking-wide max-w-[44px] truncate ${
                  isDictating && !externalStreamConnected
                    ? 'text-amber-300/80'
                    : 'text-cyan-300'
                }`}
                title={
                  isDictating && !externalStreamConnected
                    ? `External Audio Source Offline: ${secondarySpeakerLabel}`
                    : `External Audio Source: ${secondarySpeakerLabel}`
                }
              >
                {secondarySpeakerLabel}
              </span>
              <div
                data-testid="external-level-meter"
                aria-label="External Source Audio Level Meter"
                aria-hidden="true"
                className="flex items-end gap-0.5 h-3 shrink-0"
              >
                {METER_WEIGHTS.map((_, idx) => (
                  <span
                    key={idx}
                    ref={(el) => {
                      extMeterBarRefs.current[idx] = el;
                    }}
                    style={{ transform: 'scaleY(0.18)' }}
                    className="w-1 h-full rounded-full origin-bottom bg-slate-700"
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {interimText ? (
          <div
            id="voice-status-subtitle"
            aria-hidden="true"
            className="basis-[110px] flex-1 min-w-0 overflow-hidden flex justify-end [mask-image:linear-gradient(to_right,transparent,black_18px)]"
          >
            <span className="whitespace-nowrap text-[11px] text-slate-100 italic">
              {dialogueMode && (
                <strong
                  className={`not-italic font-semibold mr-1 ${
                    activeSpeakerRole === 'external'
                      ? 'text-cyan-300'
                      : 'text-indigo-300'
                  }`}
                >
                  {activeSpeakerDisplayName}:
                </strong>
              )}
              {interimText}
              <span
                aria-hidden="true"
                className={`inline-block w-0.5 h-3 ml-0.5 align-middle animate-pulse ${
                  dialogueMode && activeSpeakerRole === 'external'
                    ? 'bg-cyan-400'
                    : 'bg-indigo-400'
                }`}
              />
            </span>
          </div>
        ) : (
          <p
            id="voice-status-subtitle"
            className={`text-[11px] truncate basis-[110px] flex-1 min-w-0 ${
              isDictating && isSpeakingActive
                ? dialogueMode
                  ? activeSpeakerRole === 'external'
                    ? 'text-cyan-300 font-medium'
                    : 'text-indigo-300 font-medium'
                  : 'text-emerald-300 font-medium'
                : 'text-slate-400'
            }`}
          >
            {modelProgress
              ? modelProgress.status
              : isDictating && isSpeakingActive
              ? dialogueMode
                ? `${activeSpeakerDisplayName} speaking — streaming live…`
                : 'Listening — streaming words live at cursor…'
              : isDictating && isProcessingChunk
              ? dialogueMode
                ? `Committing ${activeSpeakerDisplayName} turn…`
                : 'Committing phrase to note…'
              : isDictating
              ? dialogueMode
                ? externalStreamConnected
                  ? `Listening to ${primarySpeakerLabel} + ${secondarySpeakerLabel}…`
                  : `Listening to ${primarySpeakerLabel} (external source offline)…`
                : 'Listening — speak naturally (active across all tabs)'
              : dialogueMode
              ? `Click mic to transcribe ${primarySpeakerLabel} + ${secondarySpeakerLabel} dialogue`
              : 'Click mic for instant local voice dictation at your cursor'}
          </p>
        )}
      </div>

      {/* Collapsible Local STT Engine, Whisper/Moonshine Model, Microphone & Dual-Source Dialogue Drawer */}
      {showEngineConfig && (
        <div
          data-testid="stt-config-drawer"
          className="pt-2 border-t border-slate-800/80 space-y-2.5 text-[11px]"
        >
          <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 text-[10px]">
            <span className="text-slate-300">
              {instantMode
                ? '⚡ Instant Mode ON: Pre-warmed laptop engine, live streaming words & 380ms pause commits.'
                : '🎯 Deep Accuracy Mode: Full-sentence 780ms pause window & multi-beam decoding.'}
            </span>
          </div>

          {/* 1-Click Local Python Faster-Whisper Provisioner */}
          <div
            data-testid="native-python-stt-card"
            className="px-2.5 py-2 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2 flex-wrap"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-200 flex items-center gap-1.5">
                <span>Native Python Faster-Whisper (CTranslate2)</span>
                <span
                  data-testid="native-python-stt-badge"
                  className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                    sttStatus?.fasterWhisperAvailable
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {sttStatus?.fasterWhisperAvailable
                    ? sttStatus.cudaAvailable
                      ? `CUDA Ready (${sttStatus.gpuName || 'GPU'})`
                      : `CPU INT8 Ready (${sttStatus.cpuThreads || 6}T)`
                    : 'Not Installed'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                {sttStatus?.fasterWhisperAvailable
                  ? 'Native CTranslate2 backend active for ultra-low-latency offline transcription.'
                  : 'Optional: Auto-provision an isolated Python venv with faster-whisper for native CPU/CUDA speed.'}
              </div>
            </div>

            {!sttStatus?.fasterWhisperAvailable && (
              <button
                type="button"
                data-testid="install-python-stt-btn"
                disabled={isInstallingPythonStt}
                onClick={() => {
                  void handleInstallPythonStt();
                }}
                className="min-h-[28px] px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[10px] font-semibold text-white transition shrink-0"
              >
                {isInstallingPythonStt
                  ? 'Installing faster-whisper...'
                  : '1-Click Install Python Engine'}
              </button>
            )}
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
              <span className="text-slate-400 font-medium">
                Primary Microphone (User)
              </span>
              <select
                aria-label="Microphone Input Device"
                value={selectedMicId}
                onChange={(e) => {
                  const nextMicId = e.target.value;
                  selectedMicIdRef.current = nextMicId;
                  updateSttSetting('selectedMicId', nextMicId);
                  restartActiveCaptureIfRecording();
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

          {/* Dual-Source Dialogue Transcription Configuration */}
          <div
            data-testid="dialogue-config-section"
            className={`rounded-xl border p-2.5 space-y-2 transition ${
              dialogueMode
                ? 'bg-cyan-950/20 border-cyan-500/35'
                : 'bg-slate-900/60 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Users
                  className={`w-3.5 h-3.5 ${
                    dialogueMode ? 'text-cyan-300' : 'text-slate-400'
                  }`}
                  aria-hidden="true"
                />
                <span className="font-semibold text-slate-200">
                  Two-Source Dialogue Transcription
                </span>
                <span
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                    dialogueMode
                      ? 'bg-cyan-500/15 text-cyan-200 border-cyan-400/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {dialogueMode ? 'Active (2 Sources)' : 'Off (Single Mic)'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  data-testid="bleed-suppression-toggle"
                  role="switch"
                  aria-checked={bleedSuppression}
                  aria-label={`Bleed Gate: ${
                    bleedSuppression ? 'ON' : 'OFF'
                  } (Suppress Speaker Echo)`}
                  title="Suppresses laptop speaker echo on your primary mic while external audio plays, while allowing louder user barge-in"
                  onClick={() =>
                    updateSttSetting('bleedSuppression', !bleedSuppression)
                  }
                  className={`min-h-[28px] px-2.5 py-1 rounded-lg text-[10px] font-medium border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    bleedSuppression
                      ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-500/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
                  }`}
                >
                  Bleed Gate: {bleedSuppression ? 'ON' : 'OFF'}
                </button>

                <button
                  type="button"
                  data-testid="dialogue-timestamps-toggle"
                  role="switch"
                  aria-checked={dialogueTimestamps}
                  aria-label={`Turn Timestamps: ${
                    dialogueTimestamps ? 'ON' : 'OFF'
                  } (Prefix Speaker Turns)`}
                  title="Prefix each new speaker turn with [HH:MM]"
                  onClick={() =>
                    updateSttSetting('dialogueTimestamps', !dialogueTimestamps)
                  }
                  className={`min-h-[28px] px-2.5 py-1 rounded-lg text-[10px] font-medium border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    dialogueTimestamps
                      ? 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border-indigo-400/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
                  }`}
                >
                  Turn Timestamps: {dialogueTimestamps ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="cq-stt-grid">
              <label className="flex flex-col gap-1">
                <span className="text-slate-400 font-medium">
                  External Audio Source (Source 2)
                </span>
                <select
                  data-testid="secondary-source-select"
                  aria-label="External Audio Source"
                  value={secondarySourceId}
                  onChange={(e) => {
                    const nextExtId = e.target.value;
                    secondarySourceIdRef.current = nextExtId;
                    updateSttSetting('secondarySourceId', nextExtId);
                    if (dialogueModeRef.current) {
                      restartActiveCaptureIfRecording();
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="system-loopback">
                    PC System Audio (Calls / Speakers Loopback)
                  </option>
                  {micDevices
                    .filter((d) => d.deviceId !== 'default')
                    .map((d) => (
                      <option
                        key={d.deviceId}
                        value={d.deviceId}
                        disabled={
                          selectedMicId !== 'default' &&
                          d.deviceId === selectedMicId
                        }
                      >
                        Secondary Input: {d.label}
                      </option>
                    ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400 font-medium">
                  Primary Speaker Label
                </span>
                <input
                  type="text"
                  data-testid="primary-speaker-input"
                  aria-label="Primary Speaker Label"
                  maxLength={28}
                  value={rawPrimaryLabel}
                  placeholder="You"
                  onChange={(e) =>
                    updateSttSetting('primarySpeakerLabel', e.target.value)
                  }
                  className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-slate-400 font-medium">
                  External Speaker Label
                </span>
                <input
                  type="text"
                  data-testid="external-speaker-input"
                  aria-label="External Speaker Label"
                  maxLength={28}
                  value={rawSecondaryLabel}
                  placeholder="External"
                  onChange={(e) =>
                    updateSttSetting('secondarySpeakerLabel', e.target.value)
                  }
                  className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

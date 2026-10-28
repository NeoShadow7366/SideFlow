import {
  LocalSttStatus,
  LocalTranscriptionResult,
  SttEngineMode,
  WhisperModelId,
} from '../types/sideflow';

/**
 * Computes root-mean-square (RMS) normalized audio level in [0, 1]
 */
export function computeRmsLevel(samples: Float32Array): number {
  if (!samples || samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sumSquares += s * s;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  // Boost perceptual sensitivity for voice visualization
  return Math.min(1, Math.max(0, rms * 4.2));
}

/**
 * Removes DC offset and normalizes audio peak amplitude to targetPeak (default 0.85, max 8x gain).
 * Dramatically improves CPU INT8 / WASM transcription accuracy on quiet laptop microphones.
 */
export function normalizeAudioFloat32(
  samples: Float32Array,
  targetPeak = 0.85,
  maxGain = 8.0
): Float32Array {
  if (!samples || samples.length === 0) return new Float32Array(0);

  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i];
  }
  const mean = sum / samples.length;

  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i] - mean);
    if (abs > peak) peak = abs;
  }

  if (peak < 1e-4) {
    return samples;
  }

  const gain = Math.min(maxGain, targetPeak / peak);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const val = (samples[i] - mean) * gain;
    out[i] = Math.max(-1, Math.min(1, val));
  }
  return out;
}

/**
 * Strips leading and trailing silence from a 16kHz Float32 audio buffer,
 * preserving a generous padding margin (default 2400 samples = 150ms) so word
 * onsets/consonants and trailing syllables are never clipped.
 */
export function trimSilenceFloat32(
  samples: Float32Array,
  threshold = 0.01,
  padSamples = 2400
): Float32Array {
  if (!samples || samples.length === 0) return new Float32Array(0);

  let firstActive = -1;
  let lastActive = -1;

  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold) {
      firstActive = i;
      break;
    }
  }

  // Entire buffer is silence below threshold
  if (firstActive === -1) {
    return new Float32Array(0);
  }

  for (let i = samples.length - 1; i >= firstActive; i--) {
    if (Math.abs(samples[i]) >= threshold) {
      lastActive = i;
      break;
    }
  }

  const start = Math.max(0, firstActive - padSamples);
  const end = Math.min(samples.length, lastActive + 1 + padSamples);
  return samples.subarray(start, end);
}

/**
 * Concatenates an array of Float32Array audio buffers into a single contiguous Float32Array
 */
export function mergeFloat32Chunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Slices only the trailing maxSamples from an array of Float32Array chunks without copying earlier audio.
 * Bounds live streaming partial-preview inference to O(1) cost during long utterances.
 */
export function mergeRecentFloat32Chunks(
  chunks: Float32Array[],
  maxSamples: number
): Float32Array {
  if (!chunks || chunks.length === 0 || maxSamples <= 0) {
    return new Float32Array(0);
  }
  let total = 0;
  let startChunkIdx = chunks.length - 1;
  let firstChunkOffset = 0;

  for (let i = chunks.length - 1; i >= 0; i--) {
    const len = chunks[i].length;
    if (total + len >= maxSamples) {
      startChunkIdx = i;
      firstChunkOffset = len - (maxSamples - total);
      total = maxSamples;
      break;
    }
    total += len;
    startChunkIdx = i;
    firstChunkOffset = 0;
  }

  const out = new Float32Array(total);
  let offset = 0;
  for (let i = startChunkIdx; i < chunks.length; i++) {
    const slice =
      i === startChunkIdx && firstChunkOffset > 0
        ? chunks[i].subarray(firstChunkOffset)
        : chunks[i];
    out.set(slice, offset);
    offset += slice.length;
  }
  return out;
}

/**
 * Downsamples or resamples mono Float32 audio to 16000 Hz for Moonshine / Whisper / SAPI
 */
export function resampleTo16kHz(
  samples: Float32Array,
  inputSampleRate: number
): Float32Array {
  const targetRate = 16000;
  if (!samples || samples.length === 0) return new Float32Array(0);
  if (!inputSampleRate || inputSampleRate === targetRate) {
    return samples;
  }

  const ratio = inputSampleRate / targetRate;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const idx0 = Math.floor(srcIndex);
    const idx1 = Math.min(samples.length - 1, idx0 + 1);
    const frac = srcIndex - idx0;
    output[i] = samples[idx0] * (1 - frac) + samples[idx1] * frac;
  }
  return output;
}

/**
 * Encodes a 16kHz Float32Array [-1, 1] into a Base64-encoded 16-bit signed PCM string
 */
export function float32ToPcm16Base64(samples: Float32Array): string {
  const pcm16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const bytes = new Uint8Array(pcm16.buffer);
  const chunkSize = 0x4000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length);
    const codes = new Array<number>(end - i);
    for (let j = i; j < end; j++) {
      codes[j - i] = bytes[j];
    }
    parts.push(String.fromCharCode.apply(null, codes));
  }
  return typeof btoa === 'function' ? btoa(parts.join('')) : '';
}

// Reference-keyed capability cache (auto-invalidates when window.sideflow changes in tests)
let cachedBridgeRef: unknown = undefined;
let cachedCapabilities: (LocalSttStatus & { webGpuAvailable: boolean }) | null =
  null;
let pendingCapabilitiesPromise: Promise<
  LocalSttStatus & { webGpuAvailable: boolean }
> | null = null;

function getCachedCapabilitiesForCurrentBridge():
  | (LocalSttStatus & { webGpuAvailable: boolean })
  | null {
  if (typeof window === 'undefined') return null;
  if (cachedCapabilities && cachedBridgeRef === window.sideflow) {
    return cachedCapabilities;
  }
  return null;
}

// Singleton WebGPU/WASM Whisper & Moonshine Worker instance
let whisperWorkerInstance: Worker | null = null;
const workerCallbacks = new Map<
  string,
  (result: LocalTranscriptionResult) => void
>();
let progressListener:
  | ((info: { progress: number; status: string }) => void)
  | null = null;

export function setWhisperProgressListener(
  cb: ((info: { progress: number; status: string }) => void) | null
): void {
  progressListener = cb;
}

function getOrCreateWhisperWorker(): Worker | null {
  if (whisperWorkerInstance) return whisperWorkerInstance;
  if (typeof Worker === 'undefined') return null;
  // Avoid spawning background module workers inside jsdom test environment
  if (
    typeof navigator !== 'undefined' &&
    /jsdom/i.test(navigator.userAgent || '')
  ) {
    return null;
  }

  try {
    const worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'progress') {
        progressListener?.({
          progress: typeof data.progress === 'number' ? data.progress : 0,
          status: String(data.status || 'Loading local model...'),
        });
        return;
      }

      const id = String(data.id || '');
      const cb = workerCallbacks.get(id);
      if (!cb) return;
      workerCallbacks.delete(id);

      if (data.type === 'result' || data.type === 'preloaded') {
        cb({
          success: true,
          text: String(data.text || ''),
          engineUsed: String(data.engineUsed || 'Local ONNX STT'),
          durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
        });
      } else {
        cb({
          success: false,
          error: String(data.error || 'Local STT worker failed'),
        });
      }
    };

    worker.onerror = () => {
      for (const [, cb] of workerCallbacks) {
        cb({ success: false, error: 'Local STT Web Worker crashed' });
      }
      workerCallbacks.clear();
      whisperWorkerInstance = null;
    };

    whisperWorkerInstance = worker;
    return worker;
  } catch {
    return null;
  }
}

export function resolveEffectiveModelSize(options: {
  engineMode: SttEngineMode;
  modelSize: WhisperModelId;
  lang: string;
  instantMode?: boolean;
  isPartial?: boolean;
  forWorker?: boolean;
  caps?: (LocalSttStatus & { webGpuAvailable?: boolean }) | null;
}): WhisperModelId {
  const {
    engineMode,
    modelSize,
    lang,
    instantMode = true,
    isPartial = false,
    forWorker = false,
    caps,
  } = options;
  const isEnglish = !lang || lang.toLowerCase().startsWith('en');

  // Live intra-utterance previews always use ultra-fast variable-length Moonshine Tiny / Whisper Tiny
  if (isPartial) {
    return isEnglish ? 'moonshine-tiny' : 'tiny';
  }

  // Honor explicit manual engine modes or when user turns Instant Mode OFF
  if (!instantMode || engineMode !== 'auto') {
    return modelSize;
  }

  const hasCuda = Boolean(caps?.cudaAvailable);
  if (hasCuda) {
    return modelSize;
  }

  // On non-CUDA work laptops in 'auto' + Instant Mode, avoid 30s-padded heavy Whisper encoders
  if (forWorker) {
    if (
      modelSize === 'distil-small.en' ||
      modelSize === 'distil-medium.en' ||
      modelSize === 'small.en' ||
      modelSize === 'base.en'
    ) {
      return isEnglish ? 'moonshine-tiny' : 'tiny';
    }
    return modelSize;
  }

  // Native CPU faster-whisper in 'auto' + Instant Mode when confirmed non-CUDA
  if (
    caps &&
    !caps.cudaAvailable &&
    (modelSize === 'distil-small.en' ||
      modelSize === 'distil-medium.en' ||
      modelSize === 'small.en')
  ) {
    return 'base.en';
  }

  return modelSize;
}

export function transcribeViaWebGpuWorker(
  audio16k: Float32Array,
  modelSize: WhisperModelId = 'moonshine-tiny',
  lang = 'en-US',
  timeoutMs = 35000,
  options?: { lowLatency?: boolean; isPartial?: boolean }
): Promise<LocalTranscriptionResult> {
  return new Promise((resolve) => {
    const worker = getOrCreateWhisperWorker();
    if (!worker) {
      resolve({
        success: false,
        error: 'Web Worker unavailable in this environment',
      });
      return;
    }

    const reqId = `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timer = window.setTimeout(() => {
      workerCallbacks.delete(reqId);
      resolve({ success: false, error: 'Local ONNX STT timed out' });
    }, timeoutMs);

    workerCallbacks.set(reqId, (res) => {
      window.clearTimeout(timer);
      resolve(res);
    });

    const copy = new Float32Array(audio16k);
    worker.postMessage(
      {
        type: 'transcribe',
        id: reqId,
        audio: copy,
        modelSize,
        lang,
        lowLatency: options?.lowLatency ?? true,
        isPartial: Boolean(options?.isPartial),
      },
      [copy.buffer]
    );
  });
}

export async function detectLocalSttCapabilities(): Promise<
  LocalSttStatus & { webGpuAvailable: boolean }
> {
  const existing = getCachedCapabilitiesForCurrentBridge();
  if (existing) return existing;
  if (pendingCapabilitiesPromise && cachedBridgeRef === window.sideflow) {
    return pendingCapabilitiesPromise;
  }

  const currentBridge =
    typeof window !== 'undefined' ? window.sideflow : undefined;
  cachedBridgeRef = currentBridge;

  pendingCapabilitiesPromise = (async () => {
    const webGpuAvailable =
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      Boolean((navigator as unknown as { gpu?: unknown }).gpu);

    if (currentBridge?.getLocalSttStatus) {
      try {
        const electronStatus = await currentBridge.getLocalSttStatus();
        const result = {
          ...electronStatus,
          webGpuAvailable,
        };
        if (cachedBridgeRef === currentBridge) {
          cachedCapabilities = result;
        }
        return result;
      } catch {
        // ignore and return browser capabilities
      }
    }

    const fallback: LocalSttStatus & { webGpuAvailable: boolean } = {
      available: true,
      fasterWhisperAvailable: false,
      cudaAvailable: false,
      windowsSapiAvailable: false,
      webGpuAvailable,
      activeModel: 'moonshine-tiny',
    };
    if (cachedBridgeRef === currentBridge) {
      cachedCapabilities = fallback;
    }
    return fallback;
  })().finally(() => {
    pendingCapabilitiesPromise = null;
  });

  return pendingCapabilitiesPromise;
}

/**
 * Eagerly preloads and dummy-warms ONLY the single active STT engine route in the background
 * so the user's very first spoken phrase experiences 0ms cold-start delay.
 */
export async function preloadLocalSttEngine(options: {
  lang: string;
  engineMode: SttEngineMode;
  modelSize: WhisperModelId;
  instantMode?: boolean;
}): Promise<LocalTranscriptionResult> {
  const { lang, engineMode, modelSize, instantMode = true } = options;
  const caps = await detectLocalSttCapabilities();
  const bridge = typeof window !== 'undefined' ? window.sideflow : undefined;

  // 1. Explicit Windows Offline SAPI warmup (spawns persistent PowerShell MemoryStream daemon once)
  if (engineMode === 'os-speech' && bridge?.warmupLocalStt) {
    try {
      const res = await bridge.warmupLocalStt({
        lang,
        modelSize,
        preferEngine: 'os-speech',
      });
      if (res.success) {
        return {
          success: true,
          engineUsed: res.engineUsed || 'Windows Offline Speech (SAPI)',
          durationMs: res.durationMs || 0,
        };
      }
    } catch {
      // fall through
    }
  }

  // 2. Native faster-whisper warmup when installed & selected (or in auto mode when available)
  if (
    (engineMode === 'native-cuda' ||
      engineMode === 'native-cpu' ||
      (engineMode === 'auto' && caps.fasterWhisperAvailable)) &&
    bridge?.warmupLocalStt
  ) {
    try {
      const effectiveNativeModel = resolveEffectiveModelSize({
        engineMode,
        modelSize,
        lang,
        instantMode,
        forWorker: false,
        caps,
      });
      const res = await bridge.warmupLocalStt({
        lang,
        modelSize: effectiveNativeModel,
        preferEngine: engineMode,
      });
      if (res.success) {
        return {
          success: true,
          engineUsed: res.engineUsed || 'faster-whisper Local',
          durationMs: res.durationMs || 0,
        };
      }
    } catch {
      // fall through to worker warmup
    }
  }

  // 3. In-App ONNX Moonshine / Whisper Web Worker preload + dummy pass
  const worker = getOrCreateWhisperWorker();
  if (!worker) {
    return { success: false, error: 'Worker unavailable' };
  }

  const effectiveWorkerModel = resolveEffectiveModelSize({
    engineMode,
    modelSize,
    lang,
    instantMode,
    forWorker: true,
    caps,
  });

  return new Promise((resolve) => {
    const reqId = `pre-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const timer = window.setTimeout(() => {
      workerCallbacks.delete(reqId);
      resolve({ success: false, error: 'Model warmup timed out' });
    }, 45000);

    workerCallbacks.set(reqId, (res) => {
      window.clearTimeout(timer);
      resolve(res);
    });

    worker.postMessage({
      type: 'preload',
      id: reqId,
      modelSize: effectiveWorkerModel,
      lang,
      lowLatency: instantMode,
    });
  });
}

/**
 * Hybrid Multi-Engine Local Speech-to-Text Router
 * Automatically trims silence and normalizes audio gain before inference, then dispatches across:
 * 1. Electron Native CUDA (FP16 / INT8_FLOAT16) or Native Multi-Threaded INT8 CPU (when faster-whisper is installed)
 * 2. In-App Moonshine / Distil-Whisper Worker (SIMD q8/q4 WASM on laptop CPUs/iGPUs, WebGPU on discrete GPUs)
 * 3. Persistent Zero-Disk Windows SAPI MemoryStream Daemon fallback
 */
export async function transcribeAudioChunkHybrid(options: {
  audio16k: Float32Array;
  lang: string;
  engineMode: SttEngineMode;
  modelSize: WhisperModelId;
  promptContext?: string;
  instantMode?: boolean;
  isPartial?: boolean;
}): Promise<LocalTranscriptionResult> {
  const {
    audio16k,
    lang,
    engineMode,
    modelSize,
    promptContext,
    instantMode = true,
    isPartial = false,
  } = options;
  if (!audio16k || audio16k.length < 800) {
    return { success: true, text: '', durationMs: 0 };
  }

  // 1. Strip leading/trailing silence (preserving 150ms onset/offset pad so consonants are never clipped)
  const trimmedAudio = trimSilenceFloat32(
    audio16k,
    0.01,
    isPartial ? 1600 : 2400
  );
  if (trimmedAudio.length < 600) {
    return { success: true, text: '', durationMs: 0 };
  }

  // 2. Normalize audio gain once so quiet laptop microphones achieve crisp consonant recognition
  const normalizedAudio = normalizeAudioFloat32(trimmedAudio, 0.85, 8.0);

  const hasElectronLocalStt = Boolean(window.sideflow?.transcribeAudioLocal);
  const knownCaps = getCachedCapabilitiesForCurrentBridge();
  const lowLatency = instantMode || isPartial;
  let triedOsSpeech = false;
  let triedWorkerResult: LocalTranscriptionResult | null = null;

  // 3. Explicit OS Offline Speech mode (Persistent Windows SAPI MemoryStream via Electron)
  if (engineMode === 'os-speech' && hasElectronLocalStt) {
    triedOsSpeech = true;
    const pcm16Base64 = float32ToPcm16Base64(normalizedAudio);
    const res = await window.sideflow!.transcribeAudioLocal!({
      pcm16Base64,
      sampleRate: 16000,
      lang,
      modelSize,
      preferEngine: 'os-speech',
      promptContext,
      lowLatency,
      isPartial,
      preTrimmed: true,
      preNormalized: true,
    });
    if (res.success) return res;
  }

  // 4. Explicit In-App WebGPU/WASM worker mode
  if (engineMode === 'webgpu-whisper') {
    const workerModel = resolveEffectiveModelSize({
      engineMode,
      modelSize,
      lang,
      instantMode,
      isPartial,
      forWorker: true,
      caps: knownCaps,
    });
    triedWorkerResult = await transcribeViaWebGpuWorker(
      normalizedAudio,
      workerModel,
      lang,
      isPartial ? 6000 : 35000,
      { lowLatency, isPartial }
    );
    if (triedWorkerResult.success) {
      return triedWorkerResult;
    }
  }

  // 5. Native CUDA / Native INT8 CPU / Auto mode when running inside Electron
  // Skip IPC completely in 'auto' mode if capability probe already confirmed faster-whisper is absent!
  const shouldTryElectronNative =
    hasElectronLocalStt &&
    (engineMode === 'native-cuda' ||
      engineMode === 'native-cpu' ||
      (engineMode === 'auto' &&
        (knownCaps === null || knownCaps.fasterWhisperAvailable)));

  if (shouldTryElectronNative) {
    try {
      const nativeModel = resolveEffectiveModelSize({
        engineMode,
        modelSize,
        lang,
        instantMode,
        isPartial,
        forWorker: false,
        caps: knownCaps,
      });
      const pcm16Base64 = float32ToPcm16Base64(normalizedAudio);
      const res = await window.sideflow!.transcribeAudioLocal!({
        pcm16Base64,
        sampleRate: 16000,
        lang,
        modelSize: nativeModel,
        preferEngine: engineMode,
        promptContext,
        lowLatency,
        isPartial,
        preTrimmed: true,
        preNormalized: true,
      });
      if (res.success) {
        return res;
      }
    } catch {
      // Fall through to in-app Moonshine/Whisper worker
    }
  }

  // 6. In-App Moonshine / Whisper Worker (SIMD WASM or Discrete WebGPU)
  let workerResult: LocalTranscriptionResult;
  if (triedWorkerResult) {
    workerResult = triedWorkerResult;
  } else {
    const workerModel = resolveEffectiveModelSize({
      engineMode,
      modelSize,
      lang,
      instantMode,
      isPartial,
      forWorker: true,
      caps: knownCaps,
    });
    workerResult = await transcribeViaWebGpuWorker(
      normalizedAudio,
      workerModel,
      lang,
      isPartial ? 6000 : 35000,
      { lowLatency, isPartial }
    );
    if (workerResult.success) {
      return workerResult;
    }
  }

  // 7. Offline last-resort fallback to Persistent Windows SAPI MemoryStream (skip for transient partials or if already attempted)
  if (hasElectronLocalStt && !isPartial && !triedOsSpeech) {
    try {
      const pcm16Base64 = float32ToPcm16Base64(normalizedAudio);
      return await window.sideflow!.transcribeAudioLocal!({
        pcm16Base64,
        sampleRate: 16000,
        lang,
        modelSize,
        preferEngine: 'os-speech',
        promptContext,
        lowLatency,
        preTrimmed: true,
        preNormalized: true,
      });
    } catch {
      // ignore
    }
  }

  return workerResult;
}

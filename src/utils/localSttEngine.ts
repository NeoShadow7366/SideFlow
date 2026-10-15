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
 * preserving a generous padding margin (default 3200 samples = 200ms) so word
 * onsets/consonants and trailing syllables are never clipped.
 */
export function trimSilenceFloat32(
  samples: Float32Array,
  threshold = 0.01,
  padSamples = 3200
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
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

// Singleton WebGPU/WASM Whisper & Moonshine Worker instance
let whisperWorkerInstance: Worker | null = null;
const workerCallbacks = new Map<
  string,
  (result: LocalTranscriptionResult) => void
>();
let progressListener: ((info: { progress: number; status: string }) => void) | null =
  null;

export function setWhisperProgressListener(
  cb: ((info: { progress: number; status: string }) => void) | null
): void {
  progressListener = cb;
}

function getOrCreateWhisperWorker(): Worker | null {
  if (whisperWorkerInstance) return whisperWorkerInstance;
  if (typeof Worker === 'undefined') return null;

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

export function transcribeViaWebGpuWorker(
  audio16k: Float32Array,
  modelSize: WhisperModelId = 'moonshine-base',
  lang = 'en-US',
  timeoutMs = 45000
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
      },
      [copy.buffer]
    );
  });
}

export async function detectLocalSttCapabilities(): Promise<
  LocalSttStatus & { webGpuAvailable: boolean }
> {
  const webGpuAvailable =
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    Boolean((navigator as unknown as { gpu?: unknown }).gpu);

  if (window.sideflow?.getLocalSttStatus) {
    try {
      const electronStatus = await window.sideflow.getLocalSttStatus();
      return {
        ...electronStatus,
        webGpuAvailable,
      };
    } catch {
      // ignore and return browser capabilities
    }
  }

  return {
    available: true,
    fasterWhisperAvailable: false,
    cudaAvailable: false,
    windowsSapiAvailable: false,
    webGpuAvailable,
    activeModel: webGpuAvailable ? 'distil-small.en' : 'moonshine-base',
  };
}

/**
 * Hybrid Multi-Engine Local Speech-to-Text Router
 * Automatically trims silence and normalizes audio gain before inference, then dispatches across:
 * 1. Electron Native CUDA (FP16 / 4GB VRAM INT8_FLOAT16) or Native Multi-Threaded INT8 CPU (Core i9 AVX-512)
 * 2. In-App Moonshine / Distil-Whisper Worker (@huggingface/transformers WebGPU or Multi-Threaded q8/q4 WASM)
 * 3. Windows Offline SAPI fallback
 */
export async function transcribeAudioChunkHybrid(options: {
  audio16k: Float32Array;
  lang: string;
  engineMode: SttEngineMode;
  modelSize: WhisperModelId;
  promptContext?: string;
}): Promise<LocalTranscriptionResult> {
  const { audio16k, lang, engineMode, modelSize, promptContext } = options;
  if (!audio16k || audio16k.length < 800) {
    return { success: true, text: '', durationMs: 0 };
  }

  // 1. Strip leading/trailing silence (with 200ms onset/offset pad so first/last syllables are never clipped)
  const trimmedAudio = trimSilenceFloat32(audio16k, 0.01, 3200);
  if (trimmedAudio.length < 600) {
    return { success: true, text: '', durationMs: 0 };
  }

  // 2. Normalize audio gain so quiet laptop microphones achieve crisp consonant recognition
  const normalizedAudio = normalizeAudioFloat32(trimmedAudio, 0.85, 8.0);

  const hasElectronLocalStt = Boolean(window.sideflow?.transcribeAudioLocal);

  // 3. Explicit OS Offline Speech mode (Windows SAPI via Electron)
  if (engineMode === 'os-speech' && hasElectronLocalStt) {
    const pcm16Base64 = float32ToPcm16Base64(normalizedAudio);
    const res = await window.sideflow!.transcribeAudioLocal!({
      pcm16Base64,
      sampleRate: 16000,
      lang,
      modelSize,
      preferEngine: 'os-speech',
      promptContext,
    });
    if (res.success) return res;
  }

  // 4. If user explicitly picked In-App WebGPU/WASM worker, run worker first
  if (engineMode === 'webgpu-whisper') {
    const workerResult = await transcribeViaWebGpuWorker(
      normalizedAudio,
      modelSize,
      lang
    );
    if (workerResult.success) {
      return workerResult;
    }
  }

  // 5. Native CUDA / Native INT8 CPU / Auto mode when running inside Electron
  if (
    (engineMode === 'native-cuda' ||
      engineMode === 'native-cpu' ||
      engineMode === 'auto') &&
    hasElectronLocalStt
  ) {
    try {
      const pcm16Base64 = float32ToPcm16Base64(normalizedAudio);
      const res = await window.sideflow!.transcribeAudioLocal!({
        pcm16Base64,
        sampleRate: 16000,
        lang,
        modelSize,
        preferEngine: engineMode,
        promptContext,
      });
      if (res.success) {
        return res;
      }
    } catch {
      // Fall through to in-app Moonshine/Whisper worker
    }
  }

  // 6. In-App Moonshine / Whisper Worker (@huggingface/transformers WebGPU or Multi-Threaded WASM)
  const workerResult = await transcribeViaWebGpuWorker(
    normalizedAudio,
    modelSize,
    lang
  );
  if (workerResult.success) {
    return workerResult;
  }

  // 7. Last-resort fallback to Electron Native/SAPI if webgpu-whisper was selected and failed
  if (hasElectronLocalStt && engineMode === 'webgpu-whisper') {
    try {
      const pcm16Base64 = float32ToPcm16Base64(normalizedAudio);
      return await window.sideflow!.transcribeAudioLocal!({
        pcm16Base64,
        sampleRate: 16000,
        lang,
        modelSize,
        preferEngine: 'auto',
        promptContext,
      });
    } catch {
      // ignore
    }
  }

  return workerResult;
}

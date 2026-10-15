/// <reference lib="webworker" />
import { pipeline, env } from '@huggingface/transformers';

// Configure Transformers.js v3 for browser/Electron caching & multi-threaded CPU WASM SIMD
env.allowLocalModels = false;
env.useBrowserCache = true;

const hardwareThreads =
  typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? Math.max(2, Math.min(8, Math.floor(navigator.hardwareConcurrency / 2)))
    : 4;

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = hardwareThreads;
  env.backends.onnx.wasm.simd = true;
}

interface TranscribeMessage {
  type: 'transcribe' | 'preload';
  id: string;
  audio?: Float32Array;
  modelSize?: string;
  lang?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPipeline: any = null;
let cachedModelId = '';
let cachedDeviceLabel = 'WebGPU';

export function resolveHuggingFaceModelId(
  modelSize = 'moonshine-tiny',
  lang = 'en-US'
): string {
  const isEnglishLang = !lang || lang.toLowerCase().startsWith('en');

  // Moonshine models are English-optimized variable-length transformers; fallback to multilingual whisper-tiny if non-English is chosen
  if (modelSize.startsWith('moonshine') && !isEnglishLang) {
    return 'onnx-community/whisper-tiny';
  }

  const normalized =
    modelSize.endsWith('.en') && !isEnglishLang
      ? modelSize.replace(/\.en$/, '')
      : modelSize;

  switch (normalized) {
    case 'moonshine-tiny':
      return 'onnx-community/moonshine-tiny-ONNX';
    case 'moonshine-base':
      return 'onnx-community/moonshine-base-ONNX';
    case 'distil-small.en':
    case 'distil-small':
      return 'onnx-community/distil-small.en';
    case 'distil-medium.en':
    case 'distil-medium':
      return 'distil-whisper/distil-medium.en';
    case 'tiny.en':
      return 'onnx-community/whisper-tiny.en';
    case 'tiny':
      return 'onnx-community/whisper-tiny';
    case 'base.en':
      return 'onnx-community/whisper-base.en';
    case 'base':
      return 'onnx-community/whisper-base';
    case 'small.en':
      return 'onnx-community/whisper-small.en';
    default:
      return 'onnx-community/moonshine-base-ONNX';
  }
}

async function getWhisperPipeline(modelSize = 'moonshine-tiny', lang = 'en-US') {
  const modelId = resolveHuggingFaceModelId(modelSize, lang);
  if (cachedPipeline && cachedModelId === modelId) {
    return { transcriber: cachedPipeline, label: cachedDeviceLabel };
  }

  const hasWebGpu =
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    Boolean((navigator as unknown as { gpu?: unknown }).gpu);

  const shortName = modelId
    .replace('onnx-community/', '')
    .replace('-ONNX', '');

  const progressCallback = (info: {
    status?: string;
    progress?: number;
    file?: string;
  }) => {
    if (info.status === 'progress' && typeof info.progress === 'number') {
      self.postMessage({
        type: 'progress',
        progress: Math.round(info.progress),
        status: `Caching ${shortName} (${Math.round(info.progress)}%)...`,
      });
    } else if (info.status === 'ready') {
      self.postMessage({
        type: 'progress',
        progress: 100,
        status: 'Model ready',
      });
    }
  };

  if (hasWebGpu) {
    try {
      cachedPipeline = await pipeline('automatic-speech-recognition', modelId, {
        device: 'webgpu',
        dtype: {
          encoder_model: 'fp32',
          decoder_model_merged: 'q4',
        },
        progress_callback: progressCallback,
      });
      cachedModelId = modelId;
      cachedDeviceLabel = `WebGPU (${shortName})`;
      return { transcriber: cachedPipeline, label: cachedDeviceLabel };
    } catch {
      // Fallback to multi-threaded CPU WASM if WebGPU adapter is unavailable or fails
    }
  }

  // CPU-Optimized WASM Execution: try hybrid q8 encoder + q4 decoder first, then fallback to q8
  try {
    cachedPipeline = await pipeline('automatic-speech-recognition', modelId, {
      device: 'wasm',
      dtype: {
        encoder_model: 'q8',
        decoder_model_merged: 'q4',
      },
      progress_callback: progressCallback,
    });
  } catch {
    cachedPipeline = await pipeline('automatic-speech-recognition', modelId, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: progressCallback,
    });
  }

  cachedModelId = modelId;
  cachedDeviceLabel = `CPU WASM ${hardwareThreads}T (${shortName})`;
  return { transcriber: cachedPipeline, label: cachedDeviceLabel };
}

self.addEventListener('message', async (event: MessageEvent<TranscribeMessage>) => {
  const { type, id, audio, modelSize = 'moonshine-tiny', lang = 'en-US' } =
    event.data || {};

  if (type === 'preload') {
    try {
      const { label } = await getWhisperPipeline(modelSize, lang);
      self.postMessage({
        type: 'preloaded',
        id,
        engineUsed: label,
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        id,
        error: err instanceof Error ? err.message : 'Failed to preload local STT model',
      });
    }
    return;
  }

  if (type === 'transcribe') {
    if (!audio || audio.length < 800) {
      self.postMessage({
        type: 'result',
        id,
        text: '',
        durationMs: 0,
        engineUsed: cachedDeviceLabel,
      });
      return;
    }

    const t0 = performance.now();
    try {
      const { transcriber, label } = await getWhisperPipeline(modelSize, lang);
      const isMoonshine = cachedModelId.includes('moonshine');
      const isMultilingual =
        !isMoonshine && !cachedModelId.endsWith('.en');
      const langCode = (lang || 'en-US').split('-')[0].toLowerCase();

      // Moonshine uses dynamic RoPE attention without 30-second padding, making short clips 5x-15x faster on CPU
      const output = isMoonshine
        ? await transcriber(audio)
        : await transcriber(audio, {
            chunk_length_s: 20,
            stride_length_s: 3,
            ...(isMultilingual ? { language: langCode, task: 'transcribe' } : {}),
          });

      const rawText = Array.isArray(output)
        ? output.map((o) => o.text || '').join(' ')
        : (output?.text as string) || '';

      // Filter out common silence hallucinations like [BLANK_AUDIO] or (music)
      const cleaned = rawText
        .replace(/\[BLANK_AUDIO\]/gi, '')
        .replace(/^\s*\([^)]+\)\s*$/g, '')
        .trim();

      self.postMessage({
        type: 'result',
        id,
        text: cleaned,
        durationMs: Math.round(performance.now() - t0),
        engineUsed: label,
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        id,
        error: err instanceof Error ? err.message : 'Local worker transcription failed',
      });
    }
  }
});

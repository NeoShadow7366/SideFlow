/// <reference lib="webworker" />
/// <reference types="vite/client" />
import { pipeline, env } from '@huggingface/transformers';
import ortWasmMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmBinaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';

// Configure Transformers.js for local/Electron caching & offline bundled multi-threaded CPU WASM SIMD
env.allowLocalModels = false;
env.useBrowserCache = typeof caches !== 'undefined';

let strictOfflineActive = false;
const defaultFetch = env.fetch ? env.fetch.bind(env) : fetch.bind(globalThis);

env.fetch = (async (input: string | URL, init?: RequestInit) => {
  const urlStr = typeof input === 'string' ? input : String(input);
  if (
    strictOfflineActive &&
    /^https?:\/\//i.test(urlStr) &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(urlStr)
  ) {
    throw new Error(
      'Strict Offline Mode is active: outbound model download blocked. Disable Strict Offline Mode once to cache the model locally.'
    );
  }
  return defaultFetch(input, init);
}) as typeof env.fetch;

const canUseMultiThreadWasm =
  typeof SharedArrayBuffer !== 'undefined' &&
  (typeof self !== 'undefined' && 'crossOriginIsolated' in self
    ? Boolean(self.crossOriginIsolated)
    : true);

const hardwareThreads =
  canUseMultiThreadWasm &&
  typeof navigator !== 'undefined' &&
  navigator.hardwareConcurrency
    ? Math.max(2, Math.min(6, Math.floor(navigator.hardwareConcurrency / 2)))
    : 1;

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = hardwareThreads;
  env.backends.onnx.wasm.simd = true;
  env.backends.onnx.wasm.wasmPaths = {
    mjs: ortWasmMjsUrl,
    wasm: ortWasmBinaryUrl,
  };
}

interface CacheBridgeHit {
  bytes: Uint8Array;
  headers: Record<string, string>;
}

const pendingCacheGets = new Map<
  string,
  (hit: CacheBridgeHit | null) => void
>();
const pendingCachePuts = new Map<string, () => void>();

function enableElectronCustomCache(): void {
  if (env.useCustomCache && env.customCache) return;
  env.useCustomCache = true;
  env.customCache = {
    async match(request: string): Promise<Response | undefined> {
      const cacheReqId = `cg-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const hit = await new Promise<CacheBridgeHit | null>((resolve) => {
        const timer = setTimeout(() => {
          pendingCacheGets.delete(cacheReqId);
          resolve(null);
        }, 10000);
        pendingCacheGets.set(cacheReqId, (res) => {
          clearTimeout(timer);
          resolve(res);
        });
        self.postMessage({
          type: 'cache-get',
          cacheReqId,
          url: String(request),
        });
      });
      if (!hit || !hit.bytes) return undefined;
      return new Response(new Uint8Array(hit.bytes), {
        status: 200,
        headers: hit.headers || { 'content-type': 'application/octet-stream' },
      });
    },
    async put(request: string, response: Response): Promise<void> {
      try {
        const cloned = response.clone();
        const ab = await cloned.arrayBuffer();
        const headers: Record<string, string> = {};
        cloned.headers.forEach((val, key) => {
          headers[key] = val;
        });
        const cacheReqId = `cp-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const bytes = new Uint8Array(ab);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            pendingCachePuts.delete(cacheReqId);
            resolve();
          }, 15000);
          pendingCachePuts.set(cacheReqId, () => {
            clearTimeout(timer);
            resolve();
          });
          self.postMessage(
            {
              type: 'cache-put',
              cacheReqId,
              url: String(request),
              bytes,
              headers,
            },
            [bytes.buffer]
          );
        });
      } catch {
        // Ignore non-fatal cache persistence errors
      }
    },
  };
}

interface TranscribeMessage {
  type:
    | 'transcribe'
    | 'preload'
    | 'dispose'
    | 'configure'
    | 'cache-get-res'
    | 'cache-put-res';
  id?: string;
  audio?: Float32Array;
  modelSize?: string;
  lang?: string;
  lowLatency?: boolean;
  isPartial?: boolean;
  strictOffline?: boolean;
  useElectronCache?: boolean;
  cacheReqId?: string;
  hit?: CacheBridgeHit | null;
}

export interface CachedPipelineEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transcriber: any;
  label: string;
  modelId: string;
}

export const MAX_CACHED_PIPELINES = 2;
export const pipelineCache = new Map<string, CachedPipelineEntry>();
let lastDeviceLabel = 'CPU WASM';
const pendingPipelineLoads = new Map<string, Promise<CachedPipelineEntry>>();
const warmedModelIds = new Set<string>();
let discreteWebGpuPromise: Promise<boolean> | null = null;
let workerQueue: Promise<void> = Promise.resolve();
let latestTranscribeGen = 0;

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
      return 'onnx-community/moonshine-tiny-ONNX';
  }
}

/**
 * Probes whether a genuine discrete WebGPU adapter is available.
 * Integrated laptop iGPUs (Intel UHD / Iris Xe / Basic Render) suffer 2-4.5s WGSL->D3D12 shader
 * compile stalls and shared-DDR bandwidth limits, where quantized SIMD WASM is dramatically faster.
 */
async function hasDiscreteWebGpuAdapter(): Promise<boolean> {
  if (discreteWebGpuPromise) return discreteWebGpuPromise;

  discreteWebGpuPromise = (async () => {
    try {
      const gpu = (
        navigator as unknown as {
          gpu?: {
            requestAdapter?: (opts?: {
              powerPreference?: string;
            }) => Promise<{
              isFallbackAdapter?: boolean;
              info?: {
                vendor?: string;
                architecture?: string;
                description?: string;
              };
              requestAdapterInfo?: () => Promise<{
                vendor?: string;
                architecture?: string;
                description?: string;
              }>;
            } | null>;
          };
        }
      )?.gpu;
      if (!gpu || typeof gpu.requestAdapter !== 'function') return false;

      const adapter = await gpu.requestAdapter({
        powerPreference: 'high-performance',
      });
      if (!adapter || adapter.isFallbackAdapter) return false;

      const info =
        adapter.info ||
        (typeof adapter.requestAdapterInfo === 'function'
          ? await adapter.requestAdapterInfo().catch(() => undefined)
          : undefined);

      if (info) {
        const combined = `${info.vendor || ''} ${info.architecture || ''} ${
          info.description || ''
        }`.toLowerCase();
        const isIntelIntegrated =
          combined.includes('intel') && !combined.includes('arc');
        const isAmdIntegrated =
          combined.includes('radeon(tm) graphics') ||
          combined.includes('amd radeon graphics');
        if (
          isIntelIntegrated ||
          isAmdIntegrated ||
          combined.includes('uhd') ||
          combined.includes('iris') ||
          combined.includes('microsoft') ||
          combined.includes('warp') ||
          combined.includes('swiftshader') ||
          combined.includes('integrated')
        ) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  })();

  return discreteWebGpuPromise;
}

export async function storePipelineInCache(entry: CachedPipelineEntry): Promise<void> {
  if (pipelineCache.has(entry.modelId)) {
    pipelineCache.delete(entry.modelId);
  }
  pipelineCache.set(entry.modelId, entry);
  lastDeviceLabel = entry.label;

  while (pipelineCache.size > MAX_CACHED_PIPELINES) {
    const oldestKey = pipelineCache.keys().next().value;
    if (!oldestKey) break;
    const evicted = pipelineCache.get(oldestKey);
    pipelineCache.delete(oldestKey);
    warmedModelIds.delete(oldestKey);
    try {
      await evicted?.transcriber?.dispose?.();
    } catch {
      // ignore disposal errors on older pipeline wrappers
    }
  }
}

export async function disposeAllCachedPipelines(): Promise<void> {
  const entries = Array.from(pipelineCache.values());
  pipelineCache.clear();
  warmedModelIds.clear();
  for (const entry of entries) {
    try {
      await entry.transcriber?.dispose?.();
    } catch {
      // ignore disposal errors
    }
  }
}

async function loadPipelineInternal(
  modelId: string,
  localFilesOnly = false
): Promise<CachedPipelineEntry> {
  const shortName = modelId
    .replace('onnx-community/', '')
    .replace('distil-whisper/', '')
    .replace('-ONNX', '');

  const isMoonshine = modelId.includes('moonshine');

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

  // Moonshine variable-length models run in ~50-120ms on SIMD WASM with 0ms shader compile overhead.
  // Only use WebGPU for Whisper models when a discrete high-performance GPU adapter is confirmed.
  const useWebGpu = !isMoonshine && (await hasDiscreteWebGpuAdapter());

  if (useWebGpu) {
    for (const encoderDtype of ['fp16', 'fp32'] as const) {
      try {
        const loaded = await pipeline(
          'automatic-speech-recognition',
          modelId,
          {
            device: 'webgpu',
            local_files_only: localFilesOnly,
            dtype: {
              encoder_model: encoderDtype,
              decoder_model_merged: 'q4',
            },
            progress_callback: progressCallback,
          }
        );
        const entry: CachedPipelineEntry = {
          transcriber: loaded,
          label: `WebGPU (${shortName})`,
          modelId,
        };
        await storePipelineInCache(entry);
        return entry;
      } catch {
        // Try next dtype or fall back to SIMD WASM
      }
    }
  }

  // CPU-Optimized SIMD WASM Execution: hybrid q8 encoder + q4 decoder first, fallback q8
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let loaded: any;
  try {
    loaded = await pipeline('automatic-speech-recognition', modelId, {
      device: 'wasm',
      local_files_only: localFilesOnly,
      dtype: {
        encoder_model: 'q8',
        decoder_model_merged: 'q4',
      },
      progress_callback: progressCallback,
    });
  } catch (err) {
    if (localFilesOnly) {
      throw err;
    }
    loaded = await pipeline('automatic-speech-recognition', modelId, {
      device: 'wasm',
      local_files_only: localFilesOnly,
      dtype: 'q8',
      progress_callback: progressCallback,
    });
  }

  const threadTag = hardwareThreads > 1 ? ` ${hardwareThreads}T` : ' SIMD';
  const entry: CachedPipelineEntry = {
    transcriber: loaded,
    label: `CPU WASM${threadTag} (${shortName})`,
    modelId,
  };
  await storePipelineInCache(entry);
  return entry;
}

async function getWhisperPipeline(
  modelSize = 'moonshine-tiny',
  lang = 'en-US',
  localFilesOnly = false
): Promise<CachedPipelineEntry> {
  const modelId = resolveHuggingFaceModelId(modelSize, lang);
  const existing = pipelineCache.get(modelId);
  if (existing) {
    // Refresh LRU order
    pipelineCache.delete(modelId);
    pipelineCache.set(modelId, existing);
    lastDeviceLabel = existing.label;
    return existing;
  }
  const inFlight = pendingPipelineLoads.get(modelId);
  if (inFlight) {
    return inFlight;
  }

  const loadPromise = loadPipelineInternal(modelId, localFilesOnly).finally(
    () => {
      pendingPipelineLoads.delete(modelId);
    }
  );
  pendingPipelineLoads.set(modelId, loadPromise);
  return loadPromise;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureModelWarmupPass(transcriber: any, modelId: string) {
  if (warmedModelIds.has(modelId)) return;
  warmedModelIds.add(modelId);
  try {
    // 0.5s micro-signal compiles ONNX WASM arenas / WebGPU shaders ahead of first user speech
    const dummy = new Float32Array(8000);
    for (let i = 0; i < dummy.length; i += 64) {
      dummy[i] = 1e-4;
    }
    const isMoonshine = modelId.includes('moonshine');
    if (isMoonshine) {
      await transcriber(dummy, { max_new_tokens: 1 });
    } else {
      await transcriber(dummy, {
        max_new_tokens: 1,
        num_beams: 1,
        do_sample: false,
      });
    }
  } catch {
    // Ignore dummy pass warnings on older model configs
  }
}

async function handleWorkerMessage(
  data: TranscribeMessage,
  enqueuedGen: number
): Promise<void> {
  const {
    type,
    id,
    audio,
    modelSize = 'moonshine-tiny',
    lang = 'en-US',
    lowLatency = true,
    isPartial = false,
    strictOffline,
    useElectronCache,
  } = data || {};

  if (typeof strictOffline === 'boolean') {
    strictOfflineActive = strictOffline;
  }
  if (useElectronCache) {
    enableElectronCustomCache();
  }

  if (type === 'configure') {
    return;
  }

  if (type === 'dispose') {
    await disposeAllCachedPipelines();
    self.postMessage({ type: 'disposed', id });
    return;
  }

  if (type === 'preload') {
    const t0 = performance.now();
    try {
      const { transcriber, label, modelId } = await getWhisperPipeline(
        modelSize,
        lang,
        strictOfflineActive
      );
      await ensureModelWarmupPass(transcriber, modelId);
      self.postMessage({
        type: 'preloaded',
        id,
        engineUsed: label,
        durationMs: Math.round(performance.now() - t0),
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        id,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to preload local STT model',
      });
    }
    return;
  }

  if (type === 'transcribe') {
    // Fast-skip stale queued partial previews when a newer partial or final utterance commit is already queued
    if (isPartial && enqueuedGen !== latestTranscribeGen) {
      self.postMessage({
        type: 'result',
        id,
        text: '',
        durationMs: 0,
        engineUsed: lastDeviceLabel,
      });
      return;
    }

    if (!audio || audio.length < 800) {
      self.postMessage({
        type: 'result',
        id,
        text: '',
        durationMs: 0,
        engineUsed: lastDeviceLabel,
      });
      return;
    }

    const t0 = performance.now();
    try {
      const { transcriber, label, modelId } = await getWhisperPipeline(
        modelSize,
        lang,
        strictOfflineActive
      );
      warmedModelIds.add(modelId);

      const isMoonshine = modelId.includes('moonshine');
      const isMultilingual = !isMoonshine && !modelId.endsWith('.en');
      const langCode = (lang || 'en-US').split('-')[0].toLowerCase();
      const audioSeconds = audio.length / 16000;
      const maxNewTokens = Math.max(
        16,
        Math.min(128, Math.ceil(audioSeconds * 6) + 12)
      );

      // Moonshine uses dynamic RoPE attention without 30-second padding, making short clips 5x-15x faster on laptop CPUs
      const output = isMoonshine
        ? await transcriber(audio, {
            max_new_tokens: maxNewTokens,
            ...(lowLatency ? { num_beams: 1, do_sample: false } : {}),
          })
        : await transcriber(audio, {
            max_new_tokens: maxNewTokens,
            ...(lowLatency ? { num_beams: 1, do_sample: false } : {}),
            ...(audio.length > 30 * 16000
              ? { chunk_length_s: 20, stride_length_s: 3 }
              : {}),
            ...(isMultilingual
              ? { language: langCode, task: 'transcribe' }
              : {}),
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
        error:
          err instanceof Error
            ? err.message
            : 'Local worker transcription failed',
      });
    }
  }
}

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('message', (event: MessageEvent<TranscribeMessage>) => {
    const data = event.data;
    if (data?.type === 'cache-get-res' && data.cacheReqId) {
      const resolver = pendingCacheGets.get(data.cacheReqId);
      pendingCacheGets.delete(data.cacheReqId);
      resolver?.(data.hit ?? null);
      return;
    }
    if (data?.type === 'cache-put-res' && data.cacheReqId) {
      const resolver = pendingCachePuts.get(data.cacheReqId);
      pendingCachePuts.delete(data.cacheReqId);
      resolver?.();
      return;
    }
    const gen =
      data?.type === 'transcribe' ? ++latestTranscribeGen : latestTranscribeGen;
    workerQueue = workerQueue
      .then(() => handleWorkerMessage(data, gen))
      .catch(() => {});
  });
}

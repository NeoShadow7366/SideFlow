import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeSharedStorage } from '../hooks/useLocalStorage';
import {
  disposeWhisperWorkerNow,
  isWhisperWorkerActive,
  preloadLocalSttEngine,
  setWhisperWorkerFactoryForTests,
  setWhisperWorkerIdleTimeoutForTests,
  transcribeViaWebGpuWorker,
  WHISPER_WORKER_IDLE_MS,
} from '../utils/localSttEngine';
import {
  disposeAllCachedPipelines,
  pipelineCache,
  storePipelineInCache,
} from '../utils/whisperWorker';

class MockWhisperWorker {
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  public onerror: ((ev: ErrorEvent) => void) | null = null;
  public postedMessages: Array<Record<string, unknown>> = [];
  public terminated = false;

  public postMessage(data: Record<string, unknown>): void {
    this.postedMessages.push(data);
    if (data.type === 'transcribe') {
      if (data.strictOffline) {
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              type: 'error',
              id: data.id,
              error:
                'Strict Offline Mode is active: outbound model download blocked.',
            },
          } as MessageEvent);
        });
        return;
      }
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'result',
            id: data.id,
            text: 'offline bundled wasm phrase',
            engineUsed: 'CPU WASM 4T (moonshine-tiny)',
            durationMs: 42,
          },
        } as MessageEvent);
      });
    } else if (data.type === 'dispose') {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'disposed',
            id: data.id,
          },
        } as MessageEvent);
      });
    }
  }

  public terminate(): void {
    this.terminated = true;
  }
}

describe('Phase 4 Offline STT Gate, ONNX Cache Proxy & 5-Min Idle Worker Reaper Suite', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    delete window.sideflow;
    await disposeWhisperWorkerNow();
    setWhisperWorkerFactoryForTests(null);
    setWhisperWorkerIdleTimeoutForTests(WHISPER_WORKER_IDLE_MS);
  });

  afterEach(async () => {
    await disposeWhisperWorkerNow();
    setWhisperWorkerFactoryForTests(null);
    setWhisperWorkerIdleTimeoutForTests(WHISPER_WORKER_IDLE_MS);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('blocks uncached remote STT model downloads when Strict Offline Mode is enabled', async () => {
    writeSharedStorage('sideflow_strict_offline', true);

    // 1. Without a spawned worker (fallback path), preload & transcribe reject cleanly with Strict Offline message
    const fallbackPreload = await preloadLocalSttEngine({
      lang: 'en-US',
      engineMode: 'webgpu-whisper',
      modelSize: 'moonshine-tiny',
    });
    expect(fallbackPreload.success).toBe(false);
    expect(fallbackPreload.error).toMatch(/Strict Offline Mode is active/i);

    // 2. With an active worker, strictOffline: true is propagated in configure + transcribe payloads
    let createdWorker: MockWhisperWorker | null = null;
    setWhisperWorkerFactoryForTests(() => {
      createdWorker = new MockWhisperWorker();
      return createdWorker as unknown as Worker;
    });

    const audio = new Float32Array(1600);
    audio.fill(0.1);
    const res = await transcribeViaWebGpuWorker(audio, 'moonshine-tiny', 'en-US');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Strict Offline Mode is active/i);
    expect(createdWorker!.postedMessages[0]).toMatchObject({
      type: 'configure',
      strictOffline: true,
    });
    expect(createdWorker!.postedMessages[1]).toMatchObject({
      type: 'transcribe',
      strictOffline: true,
    });
  });

  it('reaps idle whisperWorker after 5 minutes of inactivity and disposes cached ONNX pipelines', async () => {
    vi.useFakeTimers();
    writeSharedStorage('sideflow_strict_offline', false);

    let createdWorker: MockWhisperWorker | null = null;
    setWhisperWorkerFactoryForTests(() => {
      createdWorker = new MockWhisperWorker();
      return createdWorker as unknown as Worker;
    });

    const audio = new Float32Array(1600);
    audio.fill(0.2);

    const transcribePromise = transcribeViaWebGpuWorker(
      audio,
      'moonshine-tiny',
      'en-US'
    );
    await vi.advanceTimersByTimeAsync(10);
    const res = await transcribePromise;

    expect(res.success).toBe(true);
    expect(res.text).toBe('offline bundled wasm phrase');
    expect(isWhisperWorkerActive()).toBe(true);
    expect(createdWorker!.terminated).toBe(false);

    // Still alive before 5 minutes (299s)
    await vi.advanceTimersByTimeAsync(WHISPER_WORKER_IDLE_MS - 1000);
    expect(isWhisperWorkerActive()).toBe(true);
    expect(createdWorker!.terminated).toBe(false);

    // Crosses 5-minute idle threshold -> posts { type: 'dispose' } and terminates worker
    await vi.advanceTimersByTimeAsync(1500);
    expect(
      createdWorker!.postedMessages.some((m) => m.type === 'dispose')
    ).toBe(true);
    expect(createdWorker!.terminated).toBe(true);
    expect(isWhisperWorkerActive()).toBe(false);

    // Verify whisperWorker's disposeAllCachedPipelines releases ONNX sessions cleanly
    const disposeSpy = vi.fn().mockResolvedValue(undefined);
    await storePipelineInCache({
      modelId: 'onnx-community/moonshine-tiny-ONNX',
      label: 'CPU WASM 4T',
      transcriber: { dispose: disposeSpy },
    });
    expect(pipelineCache.size).toBe(1);
    await disposeAllCachedPipelines();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(pipelineCache.size).toBe(0);
  });

  it('proxies cache-get and cache-put requests between whisperWorker and Electron onnxModelCache IPC', async () => {
    const cachedBytes = new Uint8Array([1, 2, 3, 4]);
    const onnxModelCacheGet = vi.fn().mockResolvedValue({
      bytes: cachedBytes,
      headers: { 'content-type': 'application/octet-stream' },
    });
    const onnxModelCachePut = vi.fn().mockResolvedValue(true);

    window.sideflow = {
      isElectron: true,
      onnxModelCacheGet,
      onnxModelCachePut,
    } as unknown as typeof window.sideflow;

    let createdWorker: MockWhisperWorker | null = null;
    setWhisperWorkerFactoryForTests(() => {
      createdWorker = new MockWhisperWorker();
      return createdWorker as unknown as Worker;
    });

    const audio = new Float32Array(1600);
    audio.fill(0.15);
    await transcribeViaWebGpuWorker(audio, 'moonshine-tiny', 'en-US');

    // Simulate worker requesting a cached ONNX tensor file from Electron main process
    createdWorker!.onmessage?.({
      data: {
        type: 'cache-get',
        cacheReqId: 'req-1',
        url: 'https://huggingface.co/onnx-community/moonshine-tiny-ONNX/resolve/main/onnx/encoder_model_quantized.onnx',
      },
    } as MessageEvent);

    await vi.waitFor(() => {
      expect(onnxModelCacheGet).toHaveBeenCalledTimes(1);
      expect(
        createdWorker!.postedMessages.some(
          (m) => m.type === 'cache-get-res' && m.cacheReqId === 'req-1'
        )
      ).toBe(true);
    });

    // Simulate worker storing a downloaded ONNX tensor file to Electron disk cache
    createdWorker!.onmessage?.({
      data: {
        type: 'cache-put',
        cacheReqId: 'put-1',
        url: 'https://huggingface.co/onnx-community/moonshine-tiny-ONNX/resolve/main/config.json',
        bytes: new Uint8Array([123, 125]),
        headers: { 'content-type': 'application/json' },
      },
    } as MessageEvent);

    await vi.waitFor(() => {
      expect(onnxModelCachePut).toHaveBeenCalledTimes(1);
      expect(
        createdWorker!.postedMessages.some(
          (m) => m.type === 'cache-put-res' && m.cacheReqId === 'put-1'
        )
      ).toBe(true);
    });
  });
});

#!/usr/bin/env python3
"""
SideFlow Persistent Local Speech-to-Text Worker
Optimized for:
- Instant low-latency laptop dictation (greedy INT8 decoding + pre-warmed GEMM buffers)
- High-end Desktop CUDA GPUs (FP16) & 4GB VRAM Laptop GPUs (INT8_FLOAT16)
- Multi-Core Laptop CPUs (P-core bounded INT8 execution without PyTorch cold-import stalls)
"""
import os
import sys
import json
import time
import base64
import subprocess
from collections import OrderedDict
import numpy as np

MAX_CACHED_MODELS = 2
ALLOWED_CT2_MODELS = {
    "tiny",
    "tiny.en",
    "base",
    "base.en",
    "small",
    "small.en",
    "distil-small.en",
    "distil-medium.en",
}

models_cache = OrderedDict()
warmed_models = set()
cuda_available = False
gpu_name = None
gpu_vram_mb = 0
faster_whisper_available = False

try:
    import ctranslate2
    if ctranslate2.get_cuda_device_count() > 0:
        cuda_available = True
except Exception:
    pass

# Bound CPU threads to fast physical P-cores on hybrid Windows laptops (avoids E-core OpenMP stalls)
CPU_THREADS = (
    max(4, min(8, (os.cpu_count() or 8) // 2))
    if cuda_available
    else max(2, min(6, (os.cpu_count() or 8) // 2))
)

if cuda_available:
    try:
        out = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            timeout=2,
            creationflags=0x08000000 if sys.platform == "win32" else 0,
        ).strip()
        if out:
            first_line = out.splitlines()[0].strip()
            parts = [p.strip() for p in first_line.split(",")]
            if parts:
                gpu_name = parts[0]
            if len(parts) > 1 and parts[1].isdigit():
                gpu_vram_mb = int(parts[1])
    except Exception:
        if not gpu_name:
            gpu_name = "NVIDIA CUDA GPU"

try:
    from faster_whisper import WhisperModel
    faster_whisper_available = True
except Exception:
    WhisperModel = None


def normalize_ct2_model_name(
    model_size: str,
    lang_code: str,
    prefer_engine: str = "auto",
    low_latency: bool = True,
    is_partial: bool = False,
    use_cuda: bool = False,
) -> str:
    m = (model_size or "base.en").strip()
    if m == "moonshine-tiny":
        m = "tiny.en"
    elif m == "moonshine-base":
        m = "base.en"

    # For live partial previews on non-CUDA laptops, use tiny model for <120ms turnaround
    if is_partial and not use_cuda:
        m = "tiny.en" if lang_code == "en" else "tiny"
    # In auto + low-latency mode on non-CUDA laptop CPUs, step down heavy Whisper models to base.en
    elif (
        low_latency
        and not use_cuda
        and prefer_engine == "auto"
        and m in ("distil-small.en", "distil-medium.en", "small.en")
    ):
        m = "base.en"

    if m.endswith(".en") and lang_code != "en":
        if m.startswith("distil-"):
            m = "base" if (low_latency and not use_cuda) else "small"
        else:
            m = m[:-3]

    if m not in ALLOWED_CT2_MODELS:
        m = "base.en" if lang_code == "en" else "base"
    return m


def normalize_audio_gain(audio_f32: np.ndarray) -> np.ndarray:
    """
    Removes DC offset and normalizes peak amplitude to 0.85 (max 8x boost)
    so quiet laptop microphones achieve crisp consonant recognition.
    """
    if audio_f32.size == 0:
        return audio_f32
    centered = audio_f32 - np.mean(audio_f32)
    peak = float(np.max(np.abs(centered)))
    if peak < 1e-4:
        return centered
    gain = min(8.0, 0.85 / peak)
    if gain > 1.05:
        return np.clip(centered * gain, -1.0, 1.0).astype(np.float32)
    return centered.astype(np.float32)


def get_or_load_model(model_size: str, force_cpu: bool = False):
    if not faster_whisper_available or WhisperModel is None:
        raise RuntimeError("faster-whisper is not installed")

    normalized = model_size or ("distil-small.en" if cuda_available else "base.en")
    use_cuda = cuda_available and not force_cpu
    cache_key = f"{normalized}::{'cuda' if use_cuda else 'cpu'}"
    if cache_key in models_cache:
        models_cache.move_to_end(cache_key)
        return cache_key, models_cache[cache_key][0], models_cache[cache_key][1]

    def store_loaded_model(loaded_model, loaded_label: str):
        models_cache[cache_key] = (loaded_model, loaded_label)
        models_cache.move_to_end(cache_key)
        while len(models_cache) > MAX_CACHED_MODELS:
            evicted_key, _ = models_cache.popitem(last=False)
            warmed_models.discard(evicted_key)

    if use_cuda:
        # On 4GB-6GB VRAM laptop GPUs, int8_float16 cuts VRAM usage in half while keeping GPU tensor speedup
        cuda_compute = (
            "int8_float16" if (0 < gpu_vram_mb <= 6144) else "float16"
        )
        for compute_candidate in (cuda_compute, "int8_float16", "int8"):
            try:
                model = WhisperModel(
                    normalized, device="cuda", compute_type=compute_candidate
                )
                label = f"faster-whisper CUDA {compute_candidate.upper()} ({gpu_name or 'GPU'})"
                store_loaded_model(model, label)
                return cache_key, model, label
            except Exception:
                continue

    # Multi-threaded INT8 CPU execution bounded to physical cores
    model = WhisperModel(
        normalized,
        device="cpu",
        compute_type="int8",
        cpu_threads=CPU_THREADS,
        num_workers=1,
    )
    label = f"faster-whisper CPU INT8 ({CPU_THREADS}T - {normalized})"
    store_loaded_model(model, label)
    return cache_key, model, label


def warmup_model(model_size: str, lang_code: str, force_cpu: bool = False):
    cache_key, model, label = get_or_load_model(model_size, force_cpu=force_cpu)
    if cache_key not in warmed_models:
        dummy_audio = np.zeros(8000, dtype=np.float32)
        segments, _ = model.transcribe(
            dummy_audio,
            language=lang_code if not model_size.endswith(".en") else "en",
            beam_size=1,
            best_of=1,
            temperature=0.0,
            condition_on_previous_text=False,
            without_timestamps=True,
            vad_filter=False,
        )
        for _ in segments:
            pass
        warmed_models.add(cache_key)
    return label


def handle_request(req: dict) -> dict:
    cmd = req.get("cmd")
    req_id = req.get("id")

    if cmd == "status":
        return {
            "id": req_id,
            "available": faster_whisper_available,
            "fasterWhisperAvailable": faster_whisper_available,
            "cudaAvailable": cuda_available,
            "gpuName": gpu_name,
            "gpuVramMb": gpu_vram_mb,
            "cpuThreads": CPU_THREADS,
            "activeModel": "distil-small.en" if cuda_available else "base.en",
        }

    if cmd == "warmup":
        t0 = time.time()
        raw_model_size = req.get("modelSize", "distil-small.en" if cuda_available else "base.en")
        prefer_engine = req.get("preferEngine", "auto")
        force_cpu = prefer_engine == "native-cpu"
        use_cuda = cuda_available and not force_cpu
        lang = req.get("lang", "en-US")
        lang_code = lang.split("-")[0].lower() if lang else "en"
        model_size = normalize_ct2_model_name(
            raw_model_size,
            lang_code,
            prefer_engine=prefer_engine,
            low_latency=True,
            is_partial=False,
            use_cuda=use_cuda,
        )
        label = warmup_model(model_size, lang_code, force_cpu=force_cpu)
        return {
            "id": req_id,
            "success": True,
            "engineUsed": label,
            "durationMs": int((time.time() - t0) * 1000),
        }

    if cmd == "transcribe":
        t0 = time.time()
        pcm16_b64 = req.get("pcm16Base64", "")
        raw_model_size = req.get("modelSize", "distil-small.en" if cuda_available else "base.en")
        prefer_engine = req.get("preferEngine", "auto")
        prompt_context = (req.get("promptContext") or "").strip()
        force_cpu = prefer_engine == "native-cpu"
        use_cuda = cuda_available and not force_cpu
        low_latency = bool(req.get("lowLatency", not use_cuda))
        is_partial = bool(req.get("isPartial", False))
        pre_trimmed = bool(req.get("preTrimmed", False))
        pre_normalized = bool(req.get("preNormalized", False))
        lang = req.get("lang", "en-US")
        lang_code = lang.split("-")[0].lower() if lang else "en"

        if not pcm16_b64:
            return {"id": req_id, "success": False, "error": "Empty audio buffer"}

        raw_bytes = base64.b64decode(pcm16_b64)
        pcm_int16 = np.frombuffer(raw_bytes, dtype=np.int16)
        if pcm_int16.size < 800:
            return {"id": req_id, "success": True, "text": "", "durationMs": 0}

        raw_f32 = pcm_int16.astype(np.float32) / 32768.0
        audio_float32 = raw_f32 if pre_normalized else normalize_audio_gain(raw_f32)
        model_size = normalize_ct2_model_name(
            raw_model_size,
            lang_code,
            prefer_engine=prefer_engine,
            low_latency=low_latency,
            is_partial=is_partial,
            use_cuda=use_cuda,
        )

        cache_key, model, engine_label = get_or_load_model(model_size, force_cpu=force_cpu)
        warmed_models.add(cache_key)

        initial_prompt = (
            prompt_context[-160:]
            if prompt_context
            else "Clear, accurately punctuated technical and professional notes."
        )

        use_greedy = low_latency or is_partial
        beam_size = 1 if use_greedy else (3 if use_cuda else 2)
        use_vad = not (is_partial or (pre_trimmed and audio_float32.size <= 96000))

        transcribe_kwargs = dict(
            language=lang_code if not model_size.endswith(".en") else "en",
            beam_size=beam_size,
            best_of=1 if use_greedy else 2,
            temperature=0.0,
            repetition_penalty=1.05,
            initial_prompt=initial_prompt,
            condition_on_previous_text=not use_greedy,
            without_timestamps=True,
            vad_filter=use_vad,
        )
        if use_vad:
            transcribe_kwargs["vad_parameters"] = dict(
                threshold=0.35,
                min_speech_duration_ms=140,
                min_silence_duration_ms=280,
                speech_pad_ms=200,
            )

        segments, _info = model.transcribe(audio_float32, **transcribe_kwargs)
        text = " ".join(seg.text.strip() for seg in segments if seg.text.strip()).strip()
        duration_ms = int((time.time() - t0) * 1000)
        return {
            "id": req_id,
            "success": True,
            "text": text,
            "engineUsed": engine_label,
            "durationMs": duration_ms,
        }

    return {"id": req_id, "success": False, "error": f"Unknown command: {cmd}"}


def main():
    sys.stdout.write(
        json.dumps(
            {
                "id": "init",
                "available": faster_whisper_available,
                "fasterWhisperAvailable": faster_whisper_available,
                "cudaAvailable": cuda_available,
                "gpuName": gpu_name,
                "gpuVramMb": gpu_vram_mb,
                "cpuThreads": CPU_THREADS,
            }
        )
        + "\n"
    )
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = None
        try:
            req = json.loads(line)
            resp = handle_request(req)
        except Exception as exc:
            resp = {
                "id": req.get("id") if isinstance(req, dict) else None,
                "success": False,
                "error": str(exc),
            }
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()

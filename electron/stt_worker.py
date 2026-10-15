#!/usr/bin/env python3
"""
SideFlow Persistent Local Speech-to-Text Worker
Optimized for:
- High-end Desktop CUDA GPUs (FP16)
- 4GB VRAM Discrete Laptop GPUs (INT8_FLOAT16 hybrid quantization)
- Multi-Core Laptop CPUs like Intel Core i9-11950H 8C/16T + 32GB RAM (AVX-512 VNNI INT8 + Beam Search)
"""
import os
import sys
import json
import time
import base64
import subprocess
import numpy as np

models_cache = {}
cuda_available = False
gpu_name = None
gpu_vram_mb = 0
faster_whisper_available = False
# For an 8C/16T CPU like Core i9-11950H, 8 physical threads is optimal for CTranslate2 GEMM
CPU_THREADS = max(4, min(12, (os.cpu_count() or 8) // 2))

try:
    import ctranslate2
    if ctranslate2.get_cuda_device_count() > 0:
        cuda_available = True
except Exception:
    pass

if not cuda_available:
    try:
        import torch
        if torch.cuda.is_available():
            cuda_available = True
            gpu_name = torch.cuda.get_device_name(0)
    except Exception:
        pass

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


def normalize_ct2_model_name(model_size: str, lang_code: str) -> str:
    m = (model_size or "distil-small.en").strip()
    if m == "moonshine-tiny":
        m = "base.en"
    elif m == "moonshine-base":
        m = "distil-small.en"

    if m.endswith(".en") and lang_code != "en":
        if m.startswith("distil-"):
            return "small"
        return m[:-3]
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

    normalized = model_size or "distil-small.en"
    use_cuda = cuda_available and not force_cpu
    cache_key = f"{normalized}::{'cuda' if use_cuda else 'cpu'}"
    if cache_key in models_cache:
        return models_cache[cache_key]

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
                models_cache[cache_key] = (
                    model,
                    f"faster-whisper CUDA {compute_candidate.upper()} ({gpu_name or 'GPU'})",
                )
                return models_cache[cache_key]
            except Exception:
                continue

    # Multi-threaded INT8 CPU execution (optimized for Core i9-11950H 8C/16T AVX-512 VNNI)
    model = WhisperModel(
        normalized,
        device="cpu",
        compute_type="int8",
        cpu_threads=CPU_THREADS,
        num_workers=2,
    )
    models_cache[cache_key] = (
        model,
        f"faster-whisper CPU INT8 ({CPU_THREADS}T - {normalized})",
    )
    return models_cache[cache_key]


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
            "activeModel": "distil-small.en",
        }

    if cmd == "transcribe":
        t0 = time.time()
        pcm16_b64 = req.get("pcm16Base64", "")
        raw_model_size = req.get("modelSize", "distil-small.en")
        prefer_engine = req.get("preferEngine", "auto")
        prompt_context = (req.get("promptContext") or "").strip()
        force_cpu = prefer_engine == "native-cpu"
        lang = req.get("lang", "en-US")
        lang_code = lang.split("-")[0].lower() if lang else "en"

        if not pcm16_b64:
            return {"id": req_id, "success": False, "error": "Empty audio buffer"}

        raw_bytes = base64.b64decode(pcm16_b64)
        pcm_int16 = np.frombuffer(raw_bytes, dtype=np.int16)
        if pcm_int16.size < 800:
            return {"id": req_id, "success": True, "text": "", "durationMs": 0}

        audio_float32 = normalize_audio_gain(
            pcm_int16.astype(np.float32) / 32768.0
        )
        model_size = normalize_ct2_model_name(raw_model_size, lang_code)

        model, engine_label = get_or_load_model(model_size, force_cpu=force_cpu)

        # Build context prompt from recent note text so homophones & technical terms resolve accurately
        initial_prompt = (
            prompt_context[-220:]
            if prompt_context
            else "Clear, accurately punctuated technical and professional notes."
        )

        # Beam size 3 significantly improves word accuracy over greedy (beam=1) on both CPU & GPU
        segments, _info = model.transcribe(
            audio_float32,
            language=lang_code if not model_size.endswith(".en") else "en",
            beam_size=3,
            best_of=3,
            temperature=[0.0, 0.2],
            repetition_penalty=1.08,
            initial_prompt=initial_prompt,
            condition_on_previous_text=True,
            without_timestamps=True,
            vad_filter=True,
            vad_parameters=dict(
                threshold=0.35,
                min_speech_duration_ms=150,
                min_silence_duration_ms=350,
                speech_pad_ms=250,
            ),
        )
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

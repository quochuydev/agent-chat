"""Stage runners — the worker's actual work (doc 03: 'worker runs scripts').

Each runner shells out to the existing video/*.py script (so the heavy ML deps live
only in the venv, never imported by the API process), parses its stdout for progress,
and writes checkpoints into the job store. `build` is pure-python and imported directly.

No LLM here. These are deterministic file producers (doc 04: 'LLM never runs models').
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from collections import deque
from pathlib import Path

from .build_project import build_project
from .control import Cancelled, cancellation
from .jobs import JobStore
from .models import BuildRequest, ImagesRequest, RegenerateRequest, TranscriptRequest, VoiceoverRequest

VIDEO_DIR = Path(__file__).resolve().parent.parent
RUNS_DIR = VIDEO_DIR / "api" / "runs"

# Seconds the image generator idles between images so the GPU cools (prevents the
# thermal shutdowns seen on laptops during long renders). Tune via VIDEO_IMAGE_COOLDOWN.
IMAGE_COOLDOWN_S = float(os.environ.get("VIDEO_IMAGE_COOLDOWN", "5"))

# image filename produced by generate_images.py: NNN_MM-SS.png
IMG_NAME_RE = re.compile(r"^(\d{3})_(\d{2})-(\d{2})\.png$")


def run_dir(job_id: str) -> Path:
    return RUNS_DIR / job_id


def _python() -> str:
    """The venv interpreter that has kokoro/mflux installed, else the current one."""
    venv = VIDEO_DIR / ".venv" / "bin" / "python"
    return str(venv) if venv.exists() else sys.executable


def _image_backend(provider: str | None) -> tuple[str, str, float]:
    """(script, interpreter, cooldown) for an image provider — same CLI, same stdout.

    'flux'   → local FLUX.1-schnell in the model venv; GPU cooldown between images.
    'imagen' → Google Imagen 3 Fast, a stdlib-only cloud call, so it runs under the API
               interpreter (no model venv needed) and skips the GPU cooldown.
    """
    if provider == "imagen":
        return "generate_imagen.py", sys.executable, 0.0
    return "generate_images.py", _python(), IMAGE_COOLDOWN_S


def _run_dir(job_id: str) -> Path:
    d = run_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _lang_for_voice(voice: str) -> str:
    # Kokoro: 'b' = UK English (bm_/bf_), 'a' = US English.
    return "b" if voice.startswith(("bm_", "bf_")) else "a"


def _stream(job_id: str, cmd: list[str], on_line) -> None:
    """Run `cmd`, feeding each stdout line to `on_line`. Raise on non-zero exit.

    The live process is registered with the cancellation registry so a /cancel call
    can terminate it; on cancellation we raise Cancelled instead of RuntimeError.
    """
    proc = subprocess.Popen(
        cmd,
        cwd=str(VIDEO_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    cancellation.register(job_id, proc)
    tail: deque[str] = deque(maxlen=20)
    try:
        assert proc.stdout is not None
        for raw in proc.stdout:
            line = raw.rstrip("\n")
            tail.append(line)
            on_line(line)
        code = proc.wait()
    finally:
        cancellation.unregister(job_id)

    if cancellation.is_cancelled(job_id):
        raise Cancelled()
    if code != 0:
        detail = "\n".join(tail) or f"exit code {code}"
        raise RuntimeError(f"{Path(cmd[1]).name} failed (exit {code}):\n{detail}")


# --- runners ----------------------------------------------------------------
def run_voiceover(store: JobStore, job_id: str, req: VoiceoverRequest) -> dict:
    d = _run_dir(job_id)
    script_path = d / "script.txt"
    script_path.write_text(req.script.strip() + "\n", encoding="utf-8")
    out = d / "voiceover.wav"
    store.set_progress(job_id, "voiceover", 0, 0)

    seg = re.compile(r"segment (\d+):")

    def on_line(line: str):
        m = seg.search(line)
        if m:
            store.set_progress(job_id, "voiceover", int(m.group(1)), 0)

    _stream(
        job_id,
        [
            _python(), "generate_voiceover.py", str(script_path),
            "--voice", req.voice, "--speed", str(req.speed),
            "--lang", _lang_for_voice(req.voice), "--out", str(out),
        ],
        on_line,
    )
    return {"audio_file": str(out), "voice": req.voice, "kind": "voiceover"}


def run_transcript(store: JobStore, job_id: str, req: TranscriptRequest) -> dict:
    d = _run_dir(job_id)
    script_path = d / "script.txt"
    script_path.write_text(req.script.strip() + "\n", encoding="utf-8")
    store.set_progress(job_id, "transcript", 0, 0)

    line_re = re.compile(r"line (\d+)/(\d+)")

    def on_line(line: str):
        m = line_re.search(line)
        if m:
            store.set_progress(job_id, "transcript", int(m.group(1)), int(m.group(2)))

    _stream(
        job_id,
        [
            _python(), "generate_transcript.py", str(script_path),
            "--voice", req.voice, "--speed", str(req.speed),
            "--lang", _lang_for_voice(req.voice),
        ],
        on_line,
    )
    stem = f"script_{req.voice}"
    return {
        "transcript_file": str(d / f"{stem}.transcript.txt"),
        "audio_file": str(d / f"{stem}.aligned.wav"),
        "kind": "transcript",
    }


def run_images(store: JobStore, job_id: str, req: ImagesRequest) -> dict:
    d = _run_dir(job_id)
    images_dir = d / "images"
    images_dir.mkdir(exist_ok=True)
    # generate_images.py expects '[MM:SS] prompt' lines — synthesize evenly-spaced
    # timestamps so each image gets a distinct, increasing on-screen start time.
    prompts_path = d / "prompts.txt"
    spacing = 4
    lines = []
    for i, p in enumerate(req.prompts):
        total_s = i * spacing
        lines.append(f"[{total_s // 60:02d}:{total_s % 60:02d}] {p.strip()}")
    prompts_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    total = len(req.prompts)
    store.set_progress(job_id, "images", 0, total)

    prog = re.compile(r"\[(\d+)/(\d+)\]")
    last = {"current": 0}

    def on_line(line: str):
        m = prog.search(line)
        if m:
            last["current"] = int(m.group(1))
            store.set_progress(job_id, "images", last["current"], int(m.group(2)))
        elif "cooling down" in line:
            # GPU is idling between images — reflect the pause in the chat card.
            store.set_progress(job_id, "cooling", last["current"], total)

    script, python, cooldown = _image_backend(req.provider)
    _stream(
        job_id,
        [
            python, script, str(prompts_path),
            "--width", str(req.width), "--height", str(req.height),
            "--steps", str(req.steps), "--outdir", str(images_dir),
            "--cooldown", str(cooldown),
        ],
        on_line,
    )
    count = len([n for n in images_dir.iterdir() if IMG_NAME_RE.match(n.name)])
    return {"images_dir": str(images_dir), "count": count, "kind": "images"}


def _present_indices(images_dir: Path) -> set[int]:
    if not images_dir.is_dir():
        return set()
    return {int(m.group(1)) for n in os.listdir(images_dir) if (m := IMG_NAME_RE.match(n))}


def _contiguous(nums: list[int]) -> list[tuple[int, int]]:
    """[8,9,10,13] -> [(8,10),(13,13)] so each gap is one generate_images invocation."""
    ranges: list[tuple[int, int]] = []
    for n in sorted(nums):
        if ranges and n == ranges[-1][1] + 1:
            ranges[-1] = (ranges[-1][0], n)
        else:
            ranges.append((n, n))
    return ranges


def run_resume(store: JobStore, job_id: str, req=None) -> dict:
    """Finish a partially-rendered images job: generate only the missing indices into the
    same images dir (doc 06 resume — already-rendered PNGs are skipped). Runs under the
    original job_id so its progress, Stop button and gallery keep working.
    """
    d = _run_dir(job_id)
    prompts_path = d / "prompts.txt"
    images_dir = d / "images"
    if not prompts_path.exists():
        raise RuntimeError("nothing to resume: this job has no prompts on disk")
    images_dir.mkdir(exist_ok=True)

    prompts = [ln for ln in prompts_path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    total = len(prompts)
    missing = [i for i in range(1, total + 1) if i not in _present_indices(images_dir)]
    if not missing:
        return {"images_dir": str(images_dir), "count": total, "kind": "images"}

    p = store.get_params(job_id) or {}
    script, python, cooldown = _image_backend(p.get("provider"))
    store.set_progress(job_id, "images", total - len(missing), total)

    def on_line(line: str):
        if re.search(r"\[(\d+)/(\d+)\]", line):
            store.set_progress(job_id, "images", len(_present_indices(images_dir)), total)
        elif "cooling down" in line:
            store.set_progress(job_id, "cooling", len(_present_indices(images_dir)), total)

    for start, end in _contiguous(missing):
        _stream(
            job_id,
            [
                python, script, str(prompts_path),
                "--start", str(start), "--end", str(end),
                "--width", str(p.get("width", 1024)), "--height", str(p.get("height", 576)),
                "--steps", str(p.get("steps", 2)), "--outdir", str(images_dir),
                "--cooldown", str(cooldown),
            ],
            on_line,
        )

    count = len(_present_indices(images_dir))
    return {"images_dir": str(images_dir), "count": count, "kind": "images"}


def run_regenerate(store: JobStore, job_id: str, req: RegenerateRequest, parent_id: str) -> dict:
    """Re-render one image of `parent_id`'s images job with a fresh seed.

    The current PNG is archived to <name>.vN.png (never deleted) and a new canonical
    NNN_MM-SS.png is written, so the build keeps using the latest while history remains.
    """
    parent = _run_dir(parent_id)
    prompts_path = parent / "prompts.txt"
    images_dir = parent / "images"
    if not prompts_path.exists() or not images_dir.is_dir():
        raise RuntimeError(f"images job {parent_id} has no prompts/images to regenerate")

    prompts = [ln for ln in prompts_path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    if req.index < 1 or req.index > len(prompts):
        raise RuntimeError(f"index {req.index} out of range 1..{len(prompts)}")

    # filename for this index: generate_images.py names it NNN_MM-SS.png from the prompt ts
    ts_match = re.match(r"^\[(\d{2}):(\d{2})\]", prompts[req.index - 1])
    ts = f"{ts_match.group(1)}-{ts_match.group(2)}" if ts_match else "00-00"
    name = f"{req.index:03d}_{ts}.png"
    current = images_dir / name

    p = store.get_params(parent_id) or {}
    # new seed → a different image; generate_images uses seed = base + index
    existing_versions = len(list(images_dir.glob(f"{req.index:03d}_{ts}.v*.png")))
    base_seed = 42 + (existing_versions + 1) * 1000 + req.index
    store.set_progress(job_id, "regenerate", 0, 1)

    def on_line(line: str):
        if re.search(r"\[(\d+)/(\d+)\]", line):
            store.set_progress(job_id, "regenerate", 1, 1)

    # Render into a scratch dir first; only swap on success so a failed/cancelled
    # regenerate never destroys the existing image.
    tmp = run_dir(job_id) / "out"
    tmp.mkdir(parents=True, exist_ok=True)
    script, python, _cooldown = _image_backend(p.get("provider"))
    _stream(
        job_id,
        [
            python, script, str(prompts_path),
            "--start", str(req.index), "--end", str(req.index),
            "--width", str(p.get("width", 1024)), "--height", str(p.get("height", 576)),
            "--steps", str(p.get("steps", 2)), "--seed", str(base_seed),
            "--outdir", str(tmp),
        ],
        on_line,
    )
    fresh = tmp / name
    if not fresh.exists():
        raise RuntimeError("regenerate produced no image")
    if current.exists():  # archive the old render (never deleted)
        current.rename(images_dir / f"{req.index:03d}_{ts}.v{existing_versions + 1}.png")
    fresh.rename(current)

    versions = len(list(images_dir.glob(f"{req.index:03d}_{ts}.v*.png")))
    return {"images_dir": str(images_dir), "regenerated": name, "versions": versions, "kind": "regenerate"}


def _source_job_id(path: str | None) -> str | None:
    """The job that produced `path` = the run-dir folder name it lives under."""
    if not path:
        return None
    try:
        return Path(path).resolve().relative_to(RUNS_DIR.resolve()).parts[0]
    except (ValueError, OSError):
        return None


_VOICE_RE = re.compile(r"script_([a-z]{2}_[a-z]+)")


def _voice_from_audio(path: str | None) -> str | None:
    """Voiceover/transcript audio is named script_<voice>.*; recover the voice id."""
    if not path:
        return None
    m = _VOICE_RE.search(Path(path).name)
    return m.group(1) if m else None


def run_build(store: JobStore, job_id: str, req: BuildRequest) -> dict:
    store.set_progress(job_id, "build", 0, 1)
    if not req.audio_file or not req.images_dir:
        raise RuntimeError(
            "build needs audio_file and images_dir (pass the paths from the "
            "voiceover/transcript and images jobs)."
        )
    if not os.path.exists(req.audio_file):
        raise RuntimeError(f"audio_file not found: {req.audio_file}")
    if not os.path.isdir(req.images_dir):
        raise RuntimeError(f"images_dir not found: {req.images_dir}")

    out = _run_dir(job_id) / "project.opencut.json"
    summary = build_project(
        audio_file=req.audio_file,
        images_dir=req.images_dir,
        out_path=str(out),
        transcript_file=req.transcript_file,
        name=req.name,
        include_captions=req.include_captions,
    )
    store.set_progress(job_id, "build", 1, 1)
    return {
        **summary,
        "kind": "build",
        "source_images_job": _source_job_id(req.images_dir),
        "source_audio_job": _source_job_id(req.audio_file),
        "voice": _voice_from_audio(req.audio_file),
    }

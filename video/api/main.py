"""FastAPI connector (video/ :3333) — doc 07 endpoints.

POST /script      sync   → {text}              (templated outline; the agent's LLM
                                                 refines it — server stays LLM-free)
POST /voiceover   async  → {job_id}            generate_voiceover.py  → Kokoro-82M
POST /transcript  async  → {job_id}            generate_transcript.py → Kokoro-82M
POST /images      async  → {job_id}            generate_images.py     → FLUX.1-schnell
                                                 (provider="imagen" → generate_imagen.py
                                                  → Google Imagen Fast, needs GEMINI_API_KEY)
POST /build       async  → {job_id}            build_project (OpenCut)
GET  /jobs/{id}          → {status, progress, result, error}

Run:  ./run_api.sh   (or: uvicorn api.main:app --port 3333 --app-dir video)
"""
from __future__ import annotations

import io
import mimetypes
import os
import re
import subprocess
import zipfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from . import tasks
from .build_project import delete_captions
from .control import cancellation
from .jobs import JobStore
from .models import (
    BuildRequest,
    ImagesRequest,
    JobCreated,
    JobView,
    RegenerateRequest,
    ScriptRequest,
    ScriptResponse,
    SubtitleDeleteRequest,
    TranscriptRequest,
    VoiceoverRequest,
)
from .worker import Worker

# canonical generated image vs. any servable image (canonical or archived version)
IMG_CANON_RE = re.compile(r"^(\d{3})_(\d{2})-(\d{2})\.png$")
IMG_FILE_RE = re.compile(r"^\d{3}_\d{2}-\d{2}(\.v\d+)?\.png$")

store = JobStore()
worker = Worker(store)


def _count_images(images_dir: Path) -> int:
    if not images_dir.is_dir():
        return 0
    return len([n for n in os.listdir(images_dir) if IMG_CANON_RE.match(n)])


def _reconcile_image_orphans() -> int:
    """An images job that finished its renders before a restart still has its PNGs on
    disk (doc 06 checkpointing). Promote such orphans back to 'done' so the rendered
    images show instead of a scary error. Partially-rendered ones stay failed, but the
    gallery still surfaces whatever was produced.
    """
    fixed = 0
    for job in store.list_jobs(tool="generate_images"):
        if job["status"] != "failed" or "restarted" not in (job["error"] or ""):
            continue
        images_dir = tasks.run_dir(job["id"]) / "images"
        count = _count_images(images_dir)
        total = len(job["params"].get("prompts", [])) or count
        if count and count >= total:
            store.finish(job["id"], {"images_dir": str(images_dir), "count": count, "kind": "images"})
            fixed += 1
    return fixed


@asynccontextmanager
async def lifespan(app: FastAPI):
    orphaned = store.reset_orphans()  # doc 06: don't leave pre-crash jobs spinning
    recovered = _reconcile_image_orphans()  # …but recover image jobs whose PNGs survived
    if orphaned or recovered:
        print(f"[api] startup: {orphaned} orphaned job(s) failed, {recovered} image job(s) recovered")
    worker.start()
    yield


app = FastAPI(title="AI Video Agent — connector", version="1.0.0", lifespan=lifespan)

# The browser calls this connector directly: the heavy models make it impractical to
# deploy, so users run it locally and point a hosted frontend at it with ?apiUrl=. Allow
# any localhost port (dev) and the hosted app; extend with WEB_ORIGINS (comma-separated).
_extra_origins = [o.strip() for o in os.environ.get("WEB_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_extra_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://([a-z0-9-]+\.)*cappuai\.com",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True}


# Kokoro voice ids look like af_sky / am_michael / bm_george (a|b + f|m + _name).
_VOICE_RE = re.compile(r"^[ab][fm]_[a-z]+$")
_SAMPLE_TEXT = (
    "Hey! This is a quick preview of how I sound. I'll be narrating your video."
)


@app.get("/voice/sample")
def voice_sample(voice: str, speed: float = 1.0):
    """Short, cached TTS preview of a voice so users can hear it before generating.

    Synthesizes a fixed phrase with Kokoro (needs video/.venv) and caches the wav per
    voice+speed, so repeat plays are instant. Apple-Silicon only, like the real job.
    """
    if not _VOICE_RE.match(voice):
        raise HTTPException(status_code=400, detail="bad voice id")
    if not 0.5 <= speed <= 2.0:
        raise HTTPException(status_code=400, detail="speed out of range")

    samples_dir = tasks.RUNS_DIR / "_voice_samples"
    samples_dir.mkdir(parents=True, exist_ok=True)
    out = samples_dir / f"{voice}_{speed:g}.wav"

    if not out.exists():
        script_path = samples_dir / f"{voice}.txt"
        script_path.write_text(_SAMPLE_TEXT + "\n", encoding="utf-8")
        proc = subprocess.run(
            [
                tasks._python(), "generate_voiceover.py", str(script_path),
                "--voice", voice, "--speed", str(speed),
                "--lang", tasks._lang_for_voice(voice), "--out", str(out),
            ],
            cwd=str(tasks.VIDEO_DIR),
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0 or not out.exists():
            detail = (proc.stderr or proc.stdout or "voice sample failed").strip()[-500:]
            raise HTTPException(status_code=500, detail=detail)

    return FileResponse(str(out), media_type="audio/wav", filename=out.name)


@app.post("/script", response_model=ScriptResponse)
def script(req: ScriptRequest) -> ScriptResponse:
    """Fast, sync outline. The agent's LLM owns the real wording (doc 07: 'LLM only')."""
    words = max(20, int(req.duration * 2.5))  # ~150 wpm narration
    text = (
        f"# {req.topic}\n\n"
        f"(Target ~{req.duration}s narration, about {words} words.)\n\n"
        f"Hook: open with a surprising fact about {req.topic}.\n"
        f"Body: 3-4 short, punchy beats.\n"
        f"Close: one memorable takeaway."
    )
    return ScriptResponse(text=text)


def _enqueue(tool: str, runner, req) -> JobCreated:
    job_id = store.create(tool, req.model_dump())
    worker.submit(job_id, runner, req)
    return JobCreated(job_id=job_id)


@app.post("/voiceover", response_model=JobCreated)
def voiceover(req: VoiceoverRequest) -> JobCreated:
    return _enqueue("generate_voiceover", tasks.run_voiceover, req)


@app.post("/transcript", response_model=JobCreated)
def transcript(req: TranscriptRequest) -> JobCreated:
    return _enqueue("generate_transcript", tasks.run_transcript, req)


@app.post("/images", response_model=JobCreated)
def images(req: ImagesRequest) -> JobCreated:
    return _enqueue("generate_images", tasks.run_images, req)


@app.post("/build", response_model=JobCreated)
def build(req: BuildRequest) -> JobCreated:
    return _enqueue("build_video", tasks.run_build, req)


@app.get("/jobs/{job_id}", response_model=JobView)
def get_job(job_id: str) -> JobView:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"job {job_id} not found")
    return JobView(**job)


# --- stop (cancel) ----------------------------------------------------------
@app.post("/jobs/{job_id}/cancel", response_model=JobView)
def cancel_job(job_id: str) -> JobView:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"job {job_id} not found")
    if job["status"] in ("done", "failed", "canceled"):
        return JobView(**job)  # already terminal — nothing to stop
    cancellation.cancel(job_id)  # kills the subprocess if running
    store.set_canceled(job_id)
    return JobView(**store.get(job_id))


# --- resume a partially-rendered images job ---------------------------------
@app.post("/jobs/{job_id}/resume", response_model=JobView)
def resume_images(job_id: str) -> JobView:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"job {job_id} not found")
    if job["tool"] != "generate_images":
        raise HTTPException(status_code=400, detail="job is not an images job")
    cancellation.clear(job_id)  # drop any prior cancel flag so it can run again
    # re-run under the SAME id: worker flips it back to running and finishes it (doc 06)
    worker.submit(job_id, tasks.run_resume, None)
    store.set_status(job_id, "running")
    return JobView(**store.get(job_id))


# --- regenerate one image (keeps the old version) ---------------------------
@app.post("/jobs/{job_id}/regenerate", response_model=JobCreated)
def regenerate_image(job_id: str, req: RegenerateRequest) -> JobCreated:
    parent = store.get(job_id)
    if parent is None:
        raise HTTPException(status_code=404, detail=f"job {job_id} not found")
    if parent["tool"] != "generate_images":
        raise HTTPException(status_code=400, detail="job is not an images job")
    new_id = store.create("regenerate_image", {"parent": job_id, "index": req.index})
    worker.submit(new_id, lambda s, jid, r: tasks.run_regenerate(s, jid, r, job_id), req)
    return JobCreated(job_id=new_id)


# --- edit a finished build's subtitles in place (no re-render) ---------------
@app.post("/jobs/{job_id}/subtitles/delete")
def delete_subtitles(job_id: str, req: SubtitleDeleteRequest) -> dict:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"job {job_id} not found")
    if job["tool"] != "build_video" or not job.get("result"):
        raise HTTPException(status_code=400, detail="subtitles can only be edited on a finished build job")
    result = dict(job["result"])
    project_file = result.get("project_file")
    if not project_file or not os.path.exists(project_file):
        raise HTTPException(status_code=404, detail="this build has no project file on disk")
    try:
        summary = delete_captions(project_file, result.get("srt_file"), req.indices)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # keep the stored caption count in sync so the build card stays accurate
    result["captions"] = summary["remaining"]
    store.finish(job_id, result)
    return summary


# --- artifact serving (click to hear / view script / view images) -----------
@app.get("/jobs/{job_id}/script")
def get_script(job_id: str) -> dict:
    path = tasks.run_dir(job_id) / "script.txt"
    if not path.exists():
        raise HTTPException(status_code=404, detail="no script for this job")
    return {"script": path.read_text(encoding="utf-8")}


@app.get("/jobs/{job_id}/transcript")
def get_transcript(job_id: str) -> dict:
    path = _resolve(job_id, "transcript_file", "*.transcript.txt")
    if path is None:
        raise HTTPException(status_code=404, detail="no transcript for this job")
    return {"transcript": path.read_text(encoding="utf-8")}


@app.get("/jobs/{job_id}/audio")
def get_audio(job_id: str):
    path = _resolve(job_id, "audio_file", "*.wav")
    if path is None:
        raise HTTPException(status_code=404, detail="no audio for this job")
    return FileResponse(str(path), media_type="audio/wav", filename=path.name)


@app.get("/jobs/{job_id}/images")
def list_images(job_id: str) -> dict:
    """Current images + archived versions + the per-index prompts (live during a run)."""
    base = tasks.run_dir(job_id)
    images_dir = base / "images"
    prompts: list[str] = []
    prompts_path = base / "prompts.txt"
    if prompts_path.exists():
        for ln in prompts_path.read_text(encoding="utf-8").splitlines():
            ln = ln.strip()
            if ln:
                prompts.append(re.sub(r"^\[\d{2}:\d{2}\]\s*", "", ln))

    items = []
    if images_dir.is_dir():
        names = sorted(n for n in os.listdir(images_dir) if IMG_CANON_RE.match(n))
        for name in names:
            m = IMG_CANON_RE.match(name)
            idx, ts = int(m.group(1)), f"{m.group(2)}-{m.group(3)}"
            versions = sorted(
                v for v in os.listdir(images_dir)
                if re.match(rf"^{idx:03d}_{ts}\.v\d+\.png$", v)
            )
            items.append({
                "index": idx,
                "name": name,
                "ts": ts,
                "prompt": prompts[idx - 1] if idx - 1 < len(prompts) else None,
                "versions": versions,
            })

    total = len(prompts) if prompts else len(items)
    return {"total": total, "ready": len(items), "images": items}


@app.get("/jobs/{job_id}/images/{name}")
def get_image(job_id: str, name: str):
    if not IMG_FILE_RE.match(name):  # reject path traversal / unexpected names
        raise HTTPException(status_code=400, detail="bad image name")
    path = tasks.run_dir(job_id) / "images" / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="image not found")
    return FileResponse(str(path), media_type="image/png")


@app.get("/jobs/{job_id}/project")
def get_project(job_id: str):
    """The build job's OpenCut project file (import into the OpenCut editor)."""
    path = _resolve(job_id, "project_file", "*.opencut.json")
    if path is None:
        raise HTTPException(status_code=404, detail="no project for this job")
    return FileResponse(str(path), media_type="application/json", filename=path.name)


@app.get("/jobs/{job_id}/srt")
def get_srt(job_id: str):
    """The build job's captions as SubRip (.srt)."""
    path = _resolve(job_id, "srt_file", "*.srt")
    if path is None:
        raise HTTPException(status_code=404, detail="no captions for this job")
    return FileResponse(str(path), media_type="application/x-subrip", filename=path.name)


_KIND_BY_EXT = {
    ".wav": "audio", ".mp3": "audio",
    ".png": "image", ".jpg": "image", ".jpeg": "image",
    ".txt": "text", ".srt": "text",
    ".json": "json",
}


def _file_kind(name: str) -> str:
    return _KIND_BY_EXT.get(Path(name).suffix.lower(), "file")


@app.get("/artifacts")
def list_artifacts() -> dict:
    """Every job that produced files, with its run-dir contents (powers the Files drawer).

    Jobs are ordered newest-activity-first by their files' latest mtime; jobs with no
    run dir or no files are omitted.
    """
    jobs = []
    for j in store.list_jobs():
        d = tasks.run_dir(j["id"])
        if not d.is_dir():
            continue
        files = []
        latest = 0.0
        for p in sorted(d.rglob("*")):
            if not p.is_file():
                continue
            st = p.stat()
            latest = max(latest, st.st_mtime)
            files.append({
                "name": p.relative_to(d).as_posix(),
                "size": st.st_size,
                "kind": _file_kind(p.name),
                "mtime": st.st_mtime,
            })
        if not files:
            continue
        jobs.append({
            "id": j["id"], "tool": j["tool"], "status": j["status"],
            "mtime": latest, "files": files,
        })
    jobs.sort(key=lambda x: x["mtime"], reverse=True)
    return {"jobs": jobs}


@app.get("/jobs/{job_id}/archive")
def get_archive(job_id: str):
    """Zip every file in a job's run dir for a one-click 'download all' (Files drawer)."""
    d = tasks.run_dir(job_id)
    files = [p for p in sorted(d.rglob("*")) if p.is_file()] if d.is_dir() else []
    if not files:
        raise HTTPException(status_code=404, detail="no files for this job")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for p in files:
            z.write(p, p.relative_to(d).as_posix())
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{job_id}.zip"'},
    )


@app.get("/jobs/{job_id}/file/{rel:path}")
def get_file(job_id: str, rel: str):
    """Serve any file inside a job's run dir (download/preview for the Files drawer)."""
    base = tasks.run_dir(job_id).resolve()
    target = (base / rel).resolve()
    if base != target and not str(target).startswith(str(base) + os.sep):
        raise HTTPException(status_code=400, detail="bad path")  # path traversal
    if not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    media, _ = mimetypes.guess_type(target.name)
    return FileResponse(str(target), media_type=media or "application/octet-stream", filename=target.name)


def _resolve(job_id: str, result_key: str, glob: str) -> Optional[Path]:
    """Find an artifact file: prefer the job's recorded path, else glob the run dir."""
    job = store.get(job_id)
    if job and job.get("result") and job["result"].get(result_key):
        p = Path(job["result"][result_key])
        if p.exists():
            return p
    matches = sorted(tasks.run_dir(job_id).glob(glob))
    return matches[0] if matches else None

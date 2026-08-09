"""Parameterized OpenCut project builder (importable).

A function-shaped version of build_opencut_project.py: takes audio + transcript +
images dir as arguments instead of module-level constants, so the API worker can
assemble any job's artifacts. The standalone script stays as-is for manual use.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import struct
import uuid
import wave

TICKS_PER_SECOND = 120_000
CANVAS = {"width": 1920, "height": 1080}
NS = uuid.UUID("6f0c1e00-0000-4000-8000-000000000001")  # fixed namespace → stable ids

_IMG_RE = re.compile(r"^(\d+)_(\d\d)-(\d\d)\.png$")
_CAP_RE = re.compile(r"^\[(\d{1,2}):(\d{2})\]\s*(.+?)\s*$")


def _stable_id(name: str) -> str:
    return str(uuid.uuid5(NS, name))


def _ticks(seconds: float) -> int:
    return round(seconds * TICKS_PER_SECOND)


def _png_size(path: str):
    with open(path, "rb") as f:
        head = f.read(24)
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def _wav_duration(path: str) -> float:
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


def _srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_project(
    audio_file: str,
    images_dir: str,
    out_path: str,
    transcript_file: str | None = None,
    name: str = "Generated Video",
    include_captions: bool = False,
) -> dict:
    """Write `<out_path>` (.opencut.json) plus a sibling .srt. Returns a summary dict."""
    audio_dur_s = _wav_duration(audio_file)
    audio_dur_ticks = _ticks(audio_dur_s)
    audio_name = os.path.basename(audio_file)
    audio_media_id = _stable_id(audio_name)

    imgs = []
    for n in sorted(os.listdir(images_dir)):
        m = _IMG_RE.match(n)
        if not m:
            continue
        mm, ss = int(m.group(2)), int(m.group(3))
        imgs.append({"name": n, "start_s": mm * 60 + ss})
    if not imgs:
        raise ValueError(f"no timestamped PNGs (NNN_MM-SS.png) found in {images_dir}")

    image_elements = []
    manifest = [{
        "mediaId": audio_media_id,
        "filename": audio_name,
        "type": "audio",
        "size": os.path.getsize(audio_file),
        "duration": round(audio_dur_s, 3),
    }]
    for i, img in enumerate(imgs):
        start_s = img["start_s"]
        end_s = imgs[i + 1]["start_s"] if i + 1 < len(imgs) else audio_dur_s
        start_t = _ticks(start_s)
        dur_t = _ticks(end_s) - start_t
        mid = _stable_id(img["name"])
        w, h = _png_size(os.path.join(images_dir, img["name"]))
        image_elements.append({
            "id": _stable_id("el-" + img["name"]),
            "name": img["name"],
            "type": "image",
            "mediaId": mid,
            "startTime": start_t,
            "duration": dur_t,
            "trimStart": 0,
            "trimEnd": 0,
            "transform": {"scaleX": 1, "scaleY": 1, "position": {"x": 0, "y": 0}, "rotate": 0},
            "opacity": 1,
        })
        manifest.append({
            "mediaId": mid,
            "filename": img["name"],
            "type": "image",
            "size": os.path.getsize(os.path.join(images_dir, img["name"])),
            "width": w,
            "height": h,
        })

    caps = []
    if transcript_file and os.path.exists(transcript_file):
        with open(transcript_file) as f:
            for line in f:
                m = _CAP_RE.match(line)
                if m:
                    caps.append({"start_s": int(m.group(1)) * 60 + int(m.group(2)), "text": m.group(3)})

    caption_elements = []
    if include_captions:
        for i, cap in enumerate(caps):
            start_s = cap["start_s"]
            end_s = caps[i + 1]["start_s"] if i + 1 < len(caps) else audio_dur_s
            start_t = _ticks(start_s)
            dur_t = max(_ticks(end_s) - start_t, 1)
            caption_elements.append({
                "id": _stable_id(f"cap-{i}"),
                "name": cap["text"][:40],
                "type": "text",
                "content": cap["text"],
                "fontSize": 6,
                "fontFamily": "Arial",
                "color": "#ffffff",
                "background": {
                    "enabled": True, "color": "rgba(0,0,0,0.6)", "cornerRadius": 8,
                    "paddingX": 24, "paddingY": 12, "offsetX": 0, "offsetY": 0,
                },
                "textAlign": "center",
                "fontWeight": "bold",
                "fontStyle": "normal",
                "textDecoration": "none",
                "letterSpacing": 0,
                "lineHeight": 1.2,
                "startTime": start_t,
                "duration": dur_t,
                "trimStart": 0,
                "trimEnd": 0,
                "transform": {"scaleX": 1, "scaleY": 1, "position": {"x": 0, "y": 330}, "rotate": 0},
                "opacity": 1,
            })

    audio_element = {
        "id": _stable_id("el-audio"),
        "name": audio_name,
        "type": "audio",
        "sourceType": "upload",
        "mediaId": audio_media_id,
        "volume": 1,
        "startTime": 0,
        "duration": audio_dur_ticks,
        "trimStart": 0,
        "trimEnd": 0,
        "sourceDuration": audio_dur_ticks,
    }

    now = "2026-06-22T00:00:00.000Z"
    scene_id = _stable_id("scene-main")
    project_id = _stable_id("project-" + name)
    scene = {
        "id": scene_id,
        "name": "Main scene",
        "isMain": True,
        "tracks": {
            "overlay": ([{
                "id": _stable_id("track-captions"),
                "name": "Captions",
                "type": "text",
                "elements": caption_elements,
                "hidden": False,
            }] if include_captions and caption_elements else []),
            "main": {
                "id": _stable_id("track-main"),
                "name": "Main Track",
                "type": "video",
                "elements": image_elements,
                "muted": False,
                "hidden": False,
            },
            "audio": [{
                "id": _stable_id("track-audio"),
                "name": "Voiceover",
                "type": "audio",
                "elements": [audio_element],
                "muted": False,
            }],
        },
        "bookmarks": [],
        "createdAt": now,
        "updatedAt": now,
    }
    project = {
        "schema_version": 1,
        "exported_at": now,
        "project": {
            "metadata": {
                "id": project_id,
                "name": name,
                "duration": audio_dur_ticks,
                "createdAt": now,
                "updatedAt": now,
            },
            "scenes": [scene],
            "currentSceneId": scene_id,
            "settings": {
                "fps": {"numerator": 30, "denominator": 1},
                "canvasSize": CANVAS,
                "canvasSizeMode": "preset",
                "lastCustomCanvasSize": None,
                "originalCanvasSize": None,
                "background": {"type": "color", "color": "#000000"},
            },
            "version": 24,
            "timelineViewState": {"zoomLevel": 1, "scrollLeft": 0, "playheadTime": 0},
        },
        "media": manifest,
    }

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(project, f, indent=2)

    srt_path = os.path.splitext(out_path)[0] + ".srt"
    if srt_path.endswith(".opencut.srt"):
        srt_path = srt_path[: -len(".opencut.srt")] + ".srt"
    with open(srt_path, "w") as f:
        for i, cap in enumerate(caps):
            start_s = cap["start_s"]
            end_s = caps[i + 1]["start_s"] if i + 1 < len(caps) else audio_dur_s
            f.write(f"{i + 1}\n{_srt_time(start_s)} --> {_srt_time(end_s)}\n{cap['text']}\n\n")

    return {
        "project_file": out_path,
        "srt_file": srt_path,
        "duration_s": round(audio_dur_s, 2),
        "images": len(imgs),
        "captions": len(caption_elements),
    }


def _parse_srt(text: str) -> list[dict]:
    """Parse a .srt into ordered {start, end, text} entries (ignores the index numbers)."""
    entries = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = block.splitlines()
        if len(lines) >= 3 and "-->" in lines[1]:
            start, end = (s.strip() for s in lines[1].split("-->"))
            entries.append({"start": start, "end": end, "text": "\n".join(lines[2:]).strip()})
    return entries


def delete_captions(project_path: str, srt_path: str | None, indices: list[int]) -> dict:
    """Remove 1-based caption entries from a built OpenCut project and its .srt.

    Edits the deliverable in place: only the on-screen text overlays are dropped — the
    image and audio tracks (and the video's length) are untouched. The originals are
    backed up to <file>.bak before writing, giving a one-level undo.
    """
    with open(project_path) as f:
        project = json.load(f)

    track = None
    for scene in project.get("project", {}).get("scenes", []):
        for t in scene.get("tracks", {}).get("overlay", []):
            if t.get("type") == "text":
                track = t
                break
        if track:
            break
    if track is None or not track.get("elements"):
        raise ValueError("this project has no captions to delete")

    elements = track["elements"]
    by_time = sorted(range(len(elements)), key=lambda i: elements[i].get("startTime", 0))
    n = len(by_time)
    drop = {i for i in indices if 1 <= i <= n}
    if not drop:
        raise ValueError(f"no valid caption numbers in 1..{n}")

    keep_positions = sorted(by_time[rank - 1] for rank in range(1, n + 1) if rank not in drop)
    track["elements"] = [elements[i] for i in keep_positions]

    shutil.copyfile(project_path, project_path + ".bak")
    with open(project_path, "w") as f:
        json.dump(project, f, indent=2)

    remaining_srt = None
    if srt_path and os.path.exists(srt_path):
        with open(srt_path) as f:
            entries = _parse_srt(f.read())
        kept = [e for idx, e in enumerate(entries, start=1) if idx not in drop]
        shutil.copyfile(srt_path, srt_path + ".bak")
        with open(srt_path, "w") as f:
            for i, e in enumerate(kept, start=1):
                f.write(f"{i}\n{e['start']} --> {e['end']}\n{e['text']}\n\n")
        remaining_srt = len(kept)

    return {
        "deleted": sorted(drop),
        "remaining": len(keep_positions),
        "remaining_srt": remaining_srt,
        "project_file": project_path,
        "srt_file": srt_path,
    }

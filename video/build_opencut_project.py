#!/usr/bin/env python3
"""Generate an OpenCut project JSON (.opencut.json) from the aligned voiceover
and the timestamped image sequence in this folder.

Image filenames encode their on-screen start time, e.g. 007_00-18.png -> 00:18.
Each image is shown from its timestamp until the next image's timestamp; the
last image is held until the end of the audio. The wav goes on an audio track.

Times in the OpenCut timeline are measured in TICKS (120000 per second).
Media blobs are NOT embedded (that's just how OpenCut export works) -- the file
references media by id + filename, and the patched importer re-links the files
to the timeline by filename when you drop them back in.
"""
import json
import os
import re
import struct
import uuid
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(HERE, "images")
AUDIO_FILE = "script_weirdest_survival_tricks_af_sky.aligned.wav"
TRANSCRIPT_FILE = "script_weirdest_survival_tricks_af_sky.transcript.txt"

TICKS_PER_SECOND = 120_000
CANVAS = {"width": 1920, "height": 1080}
# Burned-in captions are off: captions are delivered as an .srt file uploaded to
# YouTube instead (YouTube handles wrapping/positioning, and they're toggleable).
INCLUDE_CAPTIONS = False
NS = uuid.UUID("6f0c1e00-0000-4000-8000-000000000001")  # fixed namespace for stable ids


def stable_id(name: str) -> str:
    return str(uuid.uuid5(NS, name))


def ticks(seconds: float) -> int:
    return round(seconds * TICKS_PER_SECOND)


def png_size(path: str):
    with open(path, "rb") as f:
        head = f.read(24)
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def wav_duration(path: str) -> float:
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


# --- audio -----------------------------------------------------------------
audio_path = os.path.join(HERE, AUDIO_FILE)
audio_dur_s = wav_duration(audio_path)
audio_dur_ticks = ticks(audio_dur_s)
audio_media_id = stable_id(AUDIO_FILE)

# --- images ----------------------------------------------------------------
pat = re.compile(r"^(\d+)_(\d\d)-(\d\d)\.png$")
imgs = []
for name in sorted(os.listdir(IMAGES_DIR)):
    m = pat.match(name)
    if not m:
        continue
    mm, ss = int(m.group(2)), int(m.group(3))
    imgs.append({"name": name, "start_s": mm * 60 + ss})

image_elements = []
manifest = [{
    "mediaId": audio_media_id,
    "filename": AUDIO_FILE,
    "type": "audio",
    "size": os.path.getsize(audio_path),
    "duration": round(audio_dur_s, 3),
}]

for i, img in enumerate(imgs):
    start_s = img["start_s"]
    end_s = imgs[i + 1]["start_s"] if i + 1 < len(imgs) else audio_dur_s
    start_t = ticks(start_s)
    dur_t = ticks(end_s) - start_t
    mid = stable_id(img["name"])
    w, h = png_size(os.path.join(IMAGES_DIR, img["name"]))
    image_elements.append({
        "id": stable_id("el-" + img["name"]),
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
        "size": os.path.getsize(os.path.join(IMAGES_DIR, img["name"])),
        "width": w,
        "height": h,
    })

# --- captions (transcript) -------------------------------------------------
# Lines look like:  [00:18] No hospitals.   (minutes can be 1 or 2 digits)
cap_pat = re.compile(r"^\[(\d{1,2}):(\d{2})\]\s*(.+?)\s*$")
caps = []
with open(os.path.join(HERE, TRANSCRIPT_FILE)) as f:
    for line in f:
        m = cap_pat.match(line)
        if not m:
            continue
        mm, ss, text = int(m.group(1)), int(m.group(2)), m.group(3)
        caps.append({"start_s": mm * 60 + ss, "text": text})

caption_elements = []
for i, cap in enumerate(caps):
    start_s = cap["start_s"]
    end_s = caps[i + 1]["start_s"] if i + 1 < len(caps) else audio_dur_s
    start_t = ticks(start_s)
    dur_t = max(ticks(end_s) - start_t, 1)
    caption_elements.append({
        "id": stable_id(f"cap-{i}"),
        "name": cap["text"][:40],
        "type": "text",
        "content": cap["text"],
        "fontSize": 6,
        "fontFamily": "Arial",
        "color": "#ffffff",
        "background": {
            "enabled": True,
            "color": "rgba(0,0,0,0.6)",
            "cornerRadius": 8,
            "paddingX": 24,
            "paddingY": 12,
            "offsetX": 0,
            "offsetY": 0,
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
    "id": stable_id("el-audio"),
    "name": AUDIO_FILE,
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
scene_id = stable_id("scene-main")
project_id = stable_id("project")

scene = {
    "id": scene_id,
    "name": "Main scene",
    "isMain": True,
    "tracks": {
        "overlay": ([{
            "id": stable_id("track-captions"),
            "name": "Captions",
            "type": "text",
            "elements": caption_elements,
            "hidden": False,
        }] if INCLUDE_CAPTIONS else []),
        "main": {
            "id": stable_id("track-main"),
            "name": "Main Track",
            "type": "video",
            "elements": image_elements,
            "muted": False,
            "hidden": False,
        },
        "audio": [{
            "id": stable_id("track-audio"),
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
            "name": "Weirdest Survival Tricks",
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

out = os.path.join(HERE, "weirdest_survival_tricks.opencut.json")
with open(out, "w") as f:
    json.dump(project, f, indent=2)

print(f"wrote {out}")
print(f"audio: {audio_dur_s:.2f}s ({audio_dur_ticks} ticks)")
print(f"images: {len(imgs)} (0:00 -> {imgs[-1]['start_s']//60}:{imgs[-1]['start_s']%60:02d}); last image held to end")
print(f"media manifest entries: {len(manifest)}")
print(f"captions in JSON: {len(caption_elements) if INCLUDE_CAPTIONS else 0}")

# --- SRT subtitle file (for YouTube upload) --------------------------------
def srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


srt_path = os.path.join(HERE, "weirdest_survival_tricks.srt")
with open(srt_path, "w") as f:
    for i, cap in enumerate(caps):
        start_s = cap["start_s"]
        end_s = caps[i + 1]["start_s"] if i + 1 < len(caps) else audio_dur_s
        f.write(f"{i + 1}\n{srt_time(start_s)} --> {srt_time(end_s)}\n{cap['text']}\n\n")

print(f"wrote {srt_path} ({len(caps)} subtitles)")

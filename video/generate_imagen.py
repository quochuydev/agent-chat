#!/usr/bin/env python3
"""Batch-generate images from a prompt file using Google Imagen Fast (cloud, Gemini API).

Defaults to Imagen 4 Fast (imagen-4.0-fast-generate-001) — Imagen 3 was shut down; the
"Fast" tier lives on as Imagen 4 Fast. Override with --model / IMAGEN_MODEL for another
Imagen `:predict` model.

A drop-in alternative to generate_images.py: same CLI, same prompt-file format
([MM:SS] prompt lines), same NNN_MM-SS.png output naming, and the same `[i/total]`
progress lines on stdout — so api/tasks.py can drive it through the identical
subprocess/progress/cancel path. The only difference is where pixels come from: instead
of a local FLUX model, each prompt is a single POST to the Imagen `:predict` endpoint.

Unlike the FLUX script this uses no ML deps at all — only the Python standard library
(urllib) — so it runs under any interpreter. It needs a Google API key in the
environment (GEMINI_API_KEY, or GOOGLE_API_KEY). Get one at https://aistudio.google.com.

Usage:
    python generate_imagen.py prompts.txt
    python generate_imagen.py prompts.txt --start 11 --end 30       # a batch
    python generate_imagen.py prompts.txt --width 1024 --height 576 # → 16:9 aspect
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Imagen Fast on the Gemini API. Imagen 3 is shut down, so default to Imagen 4 Fast;
# override with --model / IMAGEN_MODEL (e.g. imagen-4.0-generate-001 for higher quality).
DEFAULT_MODEL = os.environ.get("IMAGEN_MODEL", "imagen-4.0-fast-generate-001")
API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"

TS_RE = re.compile(r"^\[(\d{2}):(\d{2})\]\s*(.*)$")

# Imagen only accepts a fixed set of aspect ratios (not arbitrary width/height); we map
# the requested frame to the nearest one so the connector's width/height still steer it.
_ASPECTS = {"1:1": 1.0, "3:4": 0.75, "4:3": 4 / 3, "9:16": 9 / 16, "16:9": 16 / 9}


def _aspect_ratio(width: int, height: int) -> str:
    target = width / height if height else 16 / 9
    return min(_ASPECTS, key=lambda k: abs(_ASPECTS[k] - target))


def load_prompts(path):
    prompts = []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        m = TS_RE.match(line)
        if not m:
            continue
        mm, ss, text = m.group(1), m.group(2), m.group(3)
        prompts.append((f"{mm}-{ss}", text))
    return prompts


def _api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        sys.exit(
            "Imagen needs an API key: set GEMINI_API_KEY (or GOOGLE_API_KEY) in the "
            "connector environment (video/.env). Get one at https://aistudio.google.com."
        )
    return key


def _generate(model: str, api_key: str, prompt: str, aspect: str) -> bytes:
    """One image from Imagen. Retries transient 429/5xx, then raises with the API detail."""
    url = f"{API_ROOT}/{model}:predict"
    payload = json.dumps({
        "instances": [{"prompt": prompt}],
        "parameters": {"sampleCount": 1, "aspectRatio": aspect, "personGeneration": "allow_adult"},
    }).encode("utf-8")

    last_err = ""
    for attempt in range(4):
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            preds = data.get("predictions") or []
            b64 = preds[0].get("bytesBase64Encoded") if preds else None
            if not b64:
                # No image usually means the prompt tripped a safety filter.
                raise RuntimeError(
                    "Imagen returned no image (prompt may have been blocked by safety filters)"
                )
            return base64.b64decode(b64)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            last_err = f"HTTP {e.code}: {body[:400]}"
            if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(2 * (attempt + 1))  # linear backoff
                continue
            raise RuntimeError(f"Imagen request failed ({last_err})") from None
        except urllib.error.URLError as e:
            last_err = str(e.reason)
            if attempt < 3:
                time.sleep(2 * (attempt + 1))
                continue
            raise RuntimeError(f"Imagen request failed (network: {last_err})") from None
    raise RuntimeError(f"Imagen request failed ({last_err})")


def main():
    ap = argparse.ArgumentParser(description="Google Imagen Fast batch image generator")
    ap.add_argument("prompts")
    ap.add_argument("--start", type=int, default=1, help="1-based first prompt index (inclusive)")
    ap.add_argument("--end", type=int, default=None, help="1-based last prompt index (inclusive)")
    ap.add_argument("--model", default=DEFAULT_MODEL, help="Imagen model id")
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=576, help="576 keeps a 16:9 frame")
    ap.add_argument("--outdir", default="images")
    ap.add_argument("--cooldown", type=float, default=0.0,
                    help="Seconds to idle between images (helps stay under rate limits)")
    # Accepted for CLI parity with generate_images.py; Imagen fast ignores these.
    ap.add_argument("--steps", type=int, default=2)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    prompts = load_prompts(args.prompts)
    if not prompts:
        sys.exit("No timestamped prompts found in file.")

    end = args.end or len(prompts)
    sel = prompts[args.start - 1 : end]
    if not sel:
        sys.exit(f"No prompts in range {args.start}..{end} (file has {len(prompts)}).")

    api_key = _api_key()
    aspect = _aspect_ratio(args.width, args.height)
    outdir = Path(args.outdir)
    outdir.mkdir(exist_ok=True)

    print(f"Imagen model {args.model} (aspect {aspect}). Generating prompts "
          f"{args.start}..{end} of {len(prompts)} -> {outdir}/\n", flush=True)
    for offset, (ts, text) in enumerate(sel):
        idx = args.start + offset
        out_path = outdir / f"{idx:03d}_{ts}.png"
        print(f"[{idx}/{len(prompts)}] {ts} -> {out_path.name}", flush=True)
        image = _generate(args.model, api_key, text, aspect)
        out_path.write_bytes(image)
        # Optional idle between calls so a big batch stays under the API rate limit.
        if args.cooldown > 0 and offset < len(sel) - 1:
            print(f"cooling down {args.cooldown:g}s before the next image", flush=True)
            time.sleep(args.cooldown)

    print(f"\nDone. {len(sel)} images saved in {outdir}/", flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Batch-generate doodle images from a prompt file using FLUX.1-schnell (local, Apple Silicon / MLX).

Reads a prompts file where each prompt line starts with a timestamp like [00:04],
generates one image per prompt, and saves it as images/<index>_<timestamp>.png.

Usage:
    .venv/bin/python generate_images.py image_prompts_weirdest_survival_tricks.txt
    .venv/bin/python generate_images.py prompts.txt --start 1 --end 10        # first 10
    .venv/bin/python generate_images.py prompts.txt --start 11 --end 30       # next batch
    .venv/bin/python generate_images.py prompts.txt --steps 4 --quantize 4

First run downloads the FLUX.1-schnell weights (~a few GB) once, then runs fully offline.
"""
import argparse
import re
import sys
import time
from pathlib import Path

from mflux.models.flux.variants.txt2img.flux import Flux1
from mflux.models.common.config.model_config import ModelConfig

# Ungated, pre-quantized FLUX.1-schnell mirror in mflux format (no HF login needed).
DEFAULT_MODEL = "dhairyashil/FLUX.1-schnell-mflux-v0.6.2-4bit"

TS_RE = re.compile(r"^\[(\d{2}):(\d{2})\]\s*(.*)$")


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


def main():
    ap = argparse.ArgumentParser(description="FLUX.1-schnell batch image generator")
    ap.add_argument("prompts")
    ap.add_argument("--start", type=int, default=1, help="1-based first prompt index (inclusive)")
    ap.add_argument("--end", type=int, default=None, help="1-based last prompt index (inclusive)")
    ap.add_argument("--steps", type=int, default=2, help="Inference steps (schnell: 2-4 is enough)")
    ap.add_argument("--model", default=DEFAULT_MODEL,
                    help="'schnell' (gated, needs HF login) or an ungated HF repo id")
    ap.add_argument("--quantize", type=int, default=4, choices=[4, 8], help="Weight quantization bits")
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=576, help="576 keeps a 16:9 frame")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--outdir", default="images")
    ap.add_argument("--cooldown", type=float, default=0.0,
                    help="Seconds to idle between images so the GPU cools (prevents thermal shutdown)")
    args = ap.parse_args()

    prompts = load_prompts(args.prompts)
    if not prompts:
        sys.exit("No timestamped prompts found in file.")

    end = args.end or len(prompts)
    sel = prompts[args.start - 1 : end]
    if not sel:
        sys.exit(f"No prompts in range {args.start}..{end} (file has {len(prompts)}).")

    outdir = Path(args.outdir)
    outdir.mkdir(exist_ok=True)

    if "/" in args.model:
        # Third-party / mirror repo: pre-quantized, no extra quantize, no login.
        print(f"Loading {args.model} (ungated mirror). First run downloads weights (~a few GB)...")
        model_config = ModelConfig.from_name(model_name=args.model, base_model="schnell")
        flux = Flux1(model_config=model_config, quantize=None)
    else:
        # Canonical 'schnell' repo (gated: requires HF login + accepted license).
        print(f"Loading FLUX.1-schnell (quantize={args.quantize}-bit). First run downloads weights...")
        flux = Flux1(model_config=ModelConfig.schnell(), quantize=args.quantize)

    print(f"Generating prompts {args.start}..{end} of {len(prompts)} -> {outdir}/\n")
    for offset, (ts, text) in enumerate(sel):
        idx = args.start + offset
        out_path = outdir / f"{idx:03d}_{ts}.png"
        print(f"[{idx}/{len(prompts)}] {ts} -> {out_path.name}", flush=True)
        image = flux.generate_image(
            seed=args.seed + idx,
            prompt=text,
            num_inference_steps=args.steps,
            width=args.width,
            height=args.height,
        )
        image.save(path=str(out_path))
        # Idle between images (never after the last) so the GPU temperature drops.
        # A cancel kills this process, so the sleep is interruptible too.
        if args.cooldown > 0 and offset < len(sel) - 1:
            print(f"cooling down {args.cooldown:g}s before the next image", flush=True)
            time.sleep(args.cooldown)

    print(f"\nDone. {len(sel)} images saved in {outdir}/", flush=True)


if __name__ == "__main__":
    main()

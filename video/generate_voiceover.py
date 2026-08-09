#!/usr/bin/env python3
"""Generate narration audio from a plain-text script using Kokoro-82M (local, CPU/MPS).

Usage:
    .venv/bin/python generate_voiceover.py script_weirdest_survival_tricks.txt
    .venv/bin/python generate_voiceover.py script_weirdest_survival_tricks.txt --voice bm_george
    .venv/bin/python generate_voiceover.py myscript.txt --voice af_heart --speed 1.0 --out narration.wav

Common English voices:
    US male:    am_michael, am_fenrir, am_adam, am_eric
    US female:  af_heart (default), af_bella, af_nicole, af_sarah
    UK male:    bm_george, bm_lewis
    UK female:  bf_emma, bf_isabella
Full list: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SAMPLE_RATE = 24000


def main():
    ap = argparse.ArgumentParser(description="Kokoro-82M local TTS")
    ap.add_argument("script", help="Path to the plain-text narration script (.txt)")
    ap.add_argument("--voice", default="am_michael", help="Voice id (default: am_michael)")
    ap.add_argument("--speed", type=float, default=1.0, help="Speaking speed (default: 1.0)")
    ap.add_argument("--lang", default="a", help="'a'=US English, 'b'=UK English (default: a)")
    ap.add_argument("--out", default=None, help="Output .wav path (default: <script>_<voice>.wav)")
    args = ap.parse_args()

    script_path = Path(args.script)
    if not script_path.exists():
        sys.exit(f"Script not found: {script_path}")

    text = script_path.read_text(encoding="utf-8").strip()
    if not text:
        sys.exit("Script is empty.")

    out_path = Path(args.out) if args.out else script_path.with_name(
        f"{script_path.stem}_{args.voice}.wav"
    )

    print(f"Loading Kokoro-82M (first run downloads the model ~330 MB)...")
    pipeline = KPipeline(lang_code=args.lang)

    print(f"Synthesizing with voice '{args.voice}' at speed {args.speed}...")
    chunks = []
    for i, (gs, ps, audio) in enumerate(
        pipeline(text, voice=args.voice, speed=args.speed)
    ):
        chunks.append(audio)
        print(f"  segment {i + 1}: {gs[:60]!r}...")

    full = np.concatenate(chunks)
    sf.write(str(out_path), full, SAMPLE_RATE)
    seconds = len(full) / SAMPLE_RATE
    print(f"\nDone -> {out_path}  ({seconds/60:.1f} min, {SAMPLE_RATE} Hz)")


if __name__ == "__main__":
    main()

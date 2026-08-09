#!/usr/bin/env python3
"""Build a timestamped transcript (and aligned .wav) from a narration script using Kokoro-82M.

Splits the script into short caption-style lines, synthesizes each line locally,
measures its real duration, and writes:
  - <script>_<voice>.transcript.txt   ([MM:SS] one line per caption)
  - <script>_<voice>.aligned.wav       (audio whose timing matches the transcript exactly)

Usage:
    .venv/bin/python generate_transcript.py script_weirdest_survival_tricks.txt --voice af_sky
    .venv/bin/python generate_transcript.py script.txt --voice bm_george --speed 1.0 --maxlen 80
"""
import argparse
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro import KPipeline

SAMPLE_RATE = 24000


def split_lines(text, maxlen):
    """Split narration into short caption lines: sentences, further split on commas if long."""
    # normalize whitespace, collapse paragraphs into a single stream
    text = re.sub(r"\s+", " ", text).strip()
    # split into sentences keeping the terminator
    sentences = re.findall(r"[^.!?]+[.!?]+|\S[^.!?]*$", text)
    lines = []
    for s in sentences:
        s = s.strip()
        if not s:
            continue
        if len(s) <= maxlen:
            lines.append(s)
            continue
        # too long: break on commas / semicolons into clauses, regrouping up to maxlen
        parts = re.split(r"(?<=[,;:])\s+", s)
        buf = ""
        for p in parts:
            if not buf:
                buf = p
            elif len(buf) + 1 + len(p) <= maxlen:
                buf += " " + p
            else:
                lines.append(buf.strip())
                buf = p
        if buf.strip():
            lines.append(buf.strip())
    return lines


def ts(seconds):
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"[{m:02d}:{s:02d}]"


def main():
    ap = argparse.ArgumentParser(description="Kokoro-82M timestamped transcript")
    ap.add_argument("script")
    ap.add_argument("--voice", default="af_sky")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--lang", default="a")
    ap.add_argument("--maxlen", type=int, default=80, help="Max chars per caption line")
    args = ap.parse_args()

    script_path = Path(args.script)
    if not script_path.exists():
        sys.exit(f"Script not found: {script_path}")

    text = script_path.read_text(encoding="utf-8").strip()
    lines = split_lines(text, args.maxlen)
    if not lines:
        sys.exit("No lines produced from script.")

    stem = f"{script_path.stem}_{args.voice}"
    txt_out = script_path.with_name(f"{stem}.transcript.txt")
    wav_out = script_path.with_name(f"{stem}.aligned.wav")

    print(f"Loading Kokoro-82M, voice '{args.voice}'...")
    pipeline = KPipeline(lang_code=args.lang)

    transcript = []
    audio_chunks = []
    cursor = 0.0
    for i, line in enumerate(lines):
        segs = [a for _, _, a in pipeline(line, voice=args.voice, speed=args.speed)]
        if not segs:
            continue
        audio = np.concatenate(segs)
        transcript.append(f"{ts(cursor)} {line}")
        audio_chunks.append(audio)
        cursor += len(audio) / SAMPLE_RATE
        print(f"  {ts(cursor)} line {i + 1}/{len(lines)}")

    txt_out.write_text("\n".join(transcript) + "\n", encoding="utf-8")
    sf.write(str(wav_out), np.concatenate(audio_chunks), SAMPLE_RATE)

    print(f"\nTranscript -> {txt_out}  ({len(transcript)} lines)")
    print(f"Aligned wav -> {wav_out}  ({cursor/60:.1f} min)")


if __name__ == "__main__":
    main()

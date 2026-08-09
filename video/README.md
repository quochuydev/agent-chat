# Doodle History Video Pipeline (local, free)

Local toolchain for the hand-drawn doodle history videos. Everything runs offline on
Apple Silicon — no API keys, no credits, no subscriptions.

- **Voiceover:** Kokoro-82M (TTS) via `generate_voiceover.py`
- **Timestamped transcript:** `generate_transcript.py`
- **Images:** FLUX.1-schnell (ungated mirror) via `generate_images.py`

## One-time setup

```bash
# System deps (Homebrew)
brew install python@3.12 espeak-ng

# Virtual env + Python deps (run from this video/ folder)
/opt/homebrew/bin/python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install "kokoro>=0.9.2" soundfile mflux
```

All commands below assume the working directory is this `video/` folder and use the
venv's interpreter directly (`.venv/bin/python`), so no `activate` step is needed.

## 1. Narration script → voiceover (Kokoro-82M)

```bash
# Full narration as one .wav (natural pace)
.venv/bin/python generate_voiceover.py script_weirdest_survival_tricks.txt --voice af_sky

# Other voices
.venv/bin/python generate_voiceover.py SCRIPT.txt --voice bm_george   # UK male, documentary
.venv/bin/python generate_voiceover.py SCRIPT.txt --voice am_michael  # US male
.venv/bin/python generate_voiceover.py SCRIPT.txt --voice af_bella    # US female
.venv/bin/python generate_voiceover.py SCRIPT.txt --voice af_sky --speed 1.08
```

Voice list: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
(US = `am_`/`af_`, UK = `bm_`/`bf_`)

Play any output:

```bash
afplay script_weirdest_survival_tricks_af_sky.wav
afplay -t 20 FILE.wav   # first 20 seconds only
```

## 2. Timestamped transcript + aligned audio

Splits the script into short caption lines, times each against real Kokoro audio, and
writes a `[MM:SS]` transcript plus an `.aligned.wav` whose timing matches it exactly.

```bash
.venv/bin/python generate_transcript.py script_weirdest_survival_tricks.txt --voice af_sky
# -> script_weirdest_survival_tricks_af_sky.transcript.txt
# -> script_weirdest_survival_tricks_af_sky.aligned.wav
```

Note: the per-line `.aligned.wav` is slightly longer than the one-shot `.wav` from step 1
(extra silence padding per line). Use the aligned wav when you want captions/images to
line up with audio; use the step-1 wav for the tightest natural narration.

## 3. Image prompts → doodle images (FLUX.1-schnell)

Reads `image_prompts_*.txt` (one timestamped prompt per line) and renders PNGs to
`images/<index>_<MM-SS>.png`. Uses an ungated, pre-quantized mirror — no HF login.

```bash
# First 10 images
.venv/bin/python generate_images.py image_prompts_weirdest_survival_tricks.txt --start 1 --end 10 --width 768 --height 432

# Next batch
.venv/bin/python generate_images.py image_prompts_weirdest_survival_tricks.txt --start 11 --end 30

# Everything (long — see timing note below)
.venv/bin/python generate_images.py image_prompts_weirdest_survival_tricks.txt
```

Useful flags:

```
--steps 4          # schnell needs only 2-4 steps
--width 1024 --height 576   # 16:9 frame (default)
--model schnell    # use the gated official repo instead (requires HF login)
```

## 4. Assemble the video

```sh
.venv/bin/python build_opencut_project.py
```

## File map

| File                     | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `script_*.txt`           | Plain narration script (input to TTS)           |
| `generate_voiceover.py`  | Script → narration `.wav` (Kokoro-82M)          |
| `generate_transcript.py` | Script → `[MM:SS]` transcript + aligned `.wav`  |
| `generate_images.py`     | Prompts → doodle PNGs (FLUX.1-schnell)          |
| `image_prompts_*.txt`    | One timestamped image prompt per line           |
| `images/`                | Generated PNG frames                            |
| `.venv/`                 | Isolated Python env (delete to fully uninstall) |

## Models used (all free)

- **Kokoro-82M** — Apache-2.0 — https://huggingface.co/hexgrad/Kokoro-82M
- **FLUX.1-schnell** — Apache-2.0 — ungated mirror `dhairyashil/FLUX.1-schnell-mflux-v0.6.2-4bit`
- **mflux** — MIT — https://github.com/filipstrand/mflux

"""Connector configuration — centralizes env-driven settings (cost guardrails, limits).

Mirrors the web app's cost caps (web/src/lib/config.ts) using the SAME env var names so the
two layers stay in sync. The web agent clamps requests to these before calling the API;
here they become hard limits enforced by the Pydantic request models (models.py), so a
direct API call can't exceed them either.
"""
from __future__ import annotations

import os


def _pos_int(name: str, default: int) -> int:
    try:
        v = int(os.environ.get(name, ""))
        return v if v > 0 else default
    except (TypeError, ValueError):
        return default


# Longest narration a video may target, in seconds (caps script length → TTS cost).
# Default 30s = a short-form clip.
MAX_VIDEO_DURATION_SECONDS = _pos_int("MAX_VIDEO_DURATION_SECONDS", 30)

# Most images (scenes) a single video may generate (caps image-model spend).
# Default 10 = one image per ~3s of a 30s video.
MAX_IMAGES_PER_VIDEO = _pos_int("MAX_IMAGES_PER_VIDEO", 10)

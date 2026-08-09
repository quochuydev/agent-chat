"""Pydantic request/response models — mirror of web/src/lib/types.ts (doc 07).

Typed boundary between the agent's tool calls and the script runners.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from .config import MAX_IMAGES_PER_VIDEO, MAX_VIDEO_DURATION_SECONDS

# Kokoro voices the agent is allowed to pick (subset of video/README.md VOICES).
Voice = Literal[
    "af_sky",
    "af_heart",
    "af_bella",
    "af_nicole",
    "af_sarah",
    "am_michael",
    "am_adam",
    "am_eric",
    "bm_george",
    "bm_lewis",
    "bf_emma",
    "bf_isabella",
]

JobStatus = Literal["queued", "running", "done", "failed", "canceled"]

# Which backend renders the images. "flux" = local FLUX.1-schnell (free, offline);
# "imagen" = Google Imagen Fast (cloud, needs GEMINI_API_KEY on the connector).
ImageProvider = Literal["flux", "imagen"]


# --- requests ---------------------------------------------------------------
class ScriptRequest(BaseModel):
    topic: str
    # Upper bound is a cost guardrail (caps script length → downstream TTS spend).
    duration: int = Field(
        60, ge=5, le=MAX_VIDEO_DURATION_SECONDS, description="Target length in seconds"
    )


class VoiceoverRequest(BaseModel):
    script: str
    voice: Voice = "am_michael"
    speed: float = Field(1.0, ge=0.5, le=2.0)


class TranscriptRequest(BaseModel):
    script: str
    voice: Voice = "am_michael"
    speed: float = Field(1.0, ge=0.5, le=2.0)


class ImagesRequest(BaseModel):
    # max_length is a cost guardrail — one image is rendered per prompt.
    prompts: list[str] = Field(..., min_length=1, max_length=MAX_IMAGES_PER_VIDEO)
    width: int = 1024
    height: int = 576
    steps: int = Field(2, ge=1, le=8)
    provider: ImageProvider = "flux"


class RegenerateRequest(BaseModel):
    """Re-render a single image of an existing images job, keeping the old version."""

    index: int = Field(..., ge=1, description="1-based image index within the job")


class SubtitleDeleteRequest(BaseModel):
    """Delete captions from a finished build by their 1-based SRT numbers."""

    indices: list[int] = Field(..., min_length=1, description="1-based caption numbers to remove")


class BuildRequest(BaseModel):
    """Assemble the OpenCut project from artifacts already on disk.

    All fields optional: defaults reuse whatever the prior stages produced. The
    agent's tool schema exposes this as build_video({ project }); `project`
    carries the artifact references the earlier jobs returned.
    """

    name: str = "Generated Video"
    audio_file: Optional[str] = None
    transcript_file: Optional[str] = None
    images_dir: Optional[str] = None
    include_captions: bool = False


# --- responses --------------------------------------------------------------
class JobCreated(BaseModel):
    job_id: str
    status: JobStatus = "queued"


class ScriptResponse(BaseModel):
    text: str


class Progress(BaseModel):
    stage: str
    current: int = 0
    total: int = 0


class JobView(BaseModel):
    id: str
    tool: str
    status: JobStatus
    progress: Progress
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None

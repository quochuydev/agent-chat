// Tool schemas (doc 07) the agent is allowed to call. Same loop as the shopping bot —
// only the tools + fetch target change.

import { MAX_IMAGES_PER_VIDEO, MAX_VIDEO_DURATION_SECONDS } from "@/lib/config";

const VOICES = [
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
];

export const tools = [
  {
    type: "function" as const,
    function: {
      name: "write_script",
      description:
        "Draft a narration script for a short video. Returns the script text immediately (no job).",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "What the video is about." },
          duration: {
            type: "number",
            description: `Target length in seconds (e.g. 60). Maximum ${MAX_VIDEO_DURATION_SECONDS}s; longer is capped.`,
          },
        },
        required: ["topic", "duration"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_voiceover",
      description: "Start an async job to synthesize narration audio (Kokoro-82M). Returns a job_id.",
      parameters: {
        type: "object",
        properties: {
          script: { type: "string", description: "The narration text to voice." },
          voice: { type: "string", enum: VOICES, description: "Kokoro voice id." },
          speed: { type: "number", description: "Speaking speed, 0.5–2.0 (default 1.0)." },
        },
        required: ["script", "voice"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_transcript",
      description:
        "Start an async job that produces a timestamped transcript and a time-aligned .wav (use this audio for the build). Returns a job_id.",
      parameters: {
        type: "object",
        properties: {
          script: { type: "string" },
          voice: { type: "string", enum: VOICES },
          speed: { type: "number" },
        },
        required: ["script", "voice"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_images",
      description: "Start an async job to render one image per prompt (FLUX.1-schnell). Returns a job_id.",
      parameters: {
        type: "object",
        properties: {
          prompts: {
            type: "array",
            items: { type: "string" },
            description: `Short visual prompts, one per shot. Maximum ${MAX_IMAGES_PER_VIDEO} images per video; extras are dropped.`,
          },
          width: { type: "number", description: "default 1024" },
          height: { type: "number", description: "default 576" },
          steps: { type: "number", description: "default 2 (schnell minimum)" },
        },
        required: ["prompts"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "build_video",
      description:
        "Start an async job to assemble the final OpenCut project from produced artifacts. Returns a job_id.",
      parameters: {
        type: "object",
        properties: {
          project: {
            type: "object",
            description: "Artifact references from earlier jobs.",
            properties: {
              name: { type: "string" },
              audio_file: { type: "string", description: "From the transcript/voiceover job result." },
              transcript_file: { type: "string", description: "From the transcript job result." },
              images_dir: { type: "string", description: "From the images job result." },
              include_captions: { type: "boolean" },
            },
            required: ["audio_file", "images_dir"],
          },
        },
        required: ["project"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_job",
      description: "Query an async job's status, progress and result by job_id.",
      parameters: {
        type: "object",
        properties: { job_id: { type: "string" } },
        required: ["job_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_subtitles",
      description:
        "Read the actual caption/subtitle text (SRT, with timings) produced by a build job, so you can review or quote the wording and timing. Pass the build job_id.",
      parameters: {
        type: "object",
        properties: { job_id: { type: "string", description: "The build job id (or any job that has an .srt)." } },
        required: ["job_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "suggest_youtube_metadata",
      description:
        "Generate a ready-to-paste YouTube upload package (3 title options, description with chapters, tags, hashtags, thumbnail idea) for a finished video, grounded in its real narration transcript. Pass the transcript job_id (preferred — its timestamps become chapters) or a build job_id; the transcript is read server-side. Use when the user asks to suggest YouTube info, fill the YouTube fields, or prep a video for upload.",
      parameters: {
        type: "object",
        properties: {
          job_id: {
            type: "string",
            description:
              "The transcript job id (best — gives timestamped chapters), or a build job id with captions.",
          },
          transcript: {
            type: "string",
            description:
              "Optional: raw narration/transcript text to use directly instead of fetching by job_id.",
          },
        },
        required: ["job_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_subtitles",
      description:
        "Delete one or more captions from a finished build's OpenCut project (and its .srt) by their 1-based SRT numbers — edits the file in place, no re-render. Images/audio and video length are unchanged. Returns the remaining count.",
      parameters: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "The build job id." },
          indices: {
            type: "array",
            items: { type: "integer" },
            description: "1-based subtitle numbers to delete, as shown in the SRT (e.g. [4, 5]).",
          },
        },
        required: ["job_id", "indices"],
      },
    },
  },
];

// Tools that map 1:1 to an async connector endpoint (POST → { job_id }).
export const ASYNC_ENDPOINTS: Record<string, string> = {
  generate_voiceover: "/voiceover",
  generate_transcript: "/transcript",
  generate_images: "/images",
  build_video: "/build",
};

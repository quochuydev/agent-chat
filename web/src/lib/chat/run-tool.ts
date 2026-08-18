import { existsSync, readFileSync } from "node:fs";

import { getChannel } from "@/lib/channels";
import { MAX_IMAGES_PER_VIDEO, MAX_VIDEO_DURATION_SECONDS } from "@/lib/config";
import { deleteCaptions } from "@/lib/jobs/build-project";
import { resolveArtifact } from "@/lib/jobs/files";
import {
  runBuild,
  runImages,
  runTranscript,
  runVoiceover,
  type BuildRequest,
  type ImagesRequest,
  type TranscriptRequest,
  type VoiceoverRequest,
} from "@/lib/jobs/runners";
import * as store from "@/lib/jobs/store";
import { isVoice } from "@/lib/jobs/tts";
import type { Runner } from "@/lib/jobs/worker";
import { worker } from "@/lib/jobs/worker";
import type { JobRef } from "@/lib/types";

import { draftScript, draftYoutubeMetadata } from "./openai";

// Run one tool call → return { result for the LLM, optional job to surface to the UI }.
// `channelId` is the conversation's active channel: it sets the script voice and the
// image art style so every video stays on-brand for its niche. Async tools create a job
// row and hand it to the in-process worker (lib/jobs/worker.ts) directly — this function
// already runs server-side inside /api/chat/route.ts, so there's no HTTP hop.
type EnqueueResult = { result: { job_id: string; status: "queued"; note: string }; job: JobRef };

async function enqueue<P extends Record<string, unknown>>(
  tool: string,
  runner: Runner<P>,
  params: P,
): Promise<EnqueueResult> {
  const jobId = await store.create(tool, params);
  worker.submit(jobId, runner, params);
  return {
    result: { job_id: jobId, status: "queued", note: "Started — running in the background, the user sees live progress." },
    job: { id: jobId, tool, status: "queued" },
  };
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  channelId?: string | null,
): Promise<{ result: unknown; job?: JobRef }> {
  if (name === "write_script") {
    const topic = String(args.topic ?? "");
    // Cost guardrail: clamp the target length to [5, MAX] before drafting.
    const requested = Number(args.duration ?? 60) || 60;
    const duration = Math.min(Math.max(Math.floor(requested), 5), MAX_VIDEO_DURATION_SECONDS);
    const script = await draftScript(topic, duration, channelId);
    const note =
      requested > MAX_VIDEO_DURATION_SECONDS
        ? `Capped to the ${MAX_VIDEO_DURATION_SECONDS}s maximum video length to control cost.`
        : undefined;
    return { result: { script, duration, ...(note ? { note } : {}) } };
  }

  if (name === "get_job") {
    const jobId = String(args.job_id ?? "");
    const job = await store.get(jobId);
    return { result: job ?? { error: `job ${jobId} not found` } };
  }

  if (name === "read_subtitles") {
    const jobId = String(args.job_id ?? "");
    const job = await store.get(jobId);
    const path = resolveArtifact(job, jobId, "srt_file", ".srt");
    if (!path) return { result: { error: `no subtitles for job ${jobId}` } };
    return { result: { srt: readFileSync(path, "utf8") } };
  }

  if (name === "suggest_youtube_metadata") {
    // Prefer transcript text if the agent passed it; otherwise read the real file
    // from disk (timestamped transcript first, SRT captions as fallback).
    let transcript = typeof args.transcript === "string" ? args.transcript.trim() : "";
    const jobId = String(args.job_id ?? "");
    if (!transcript && jobId) {
      const job = await store.get(jobId);
      const transcriptPath = resolveArtifact(job, jobId, "transcript_file", ".transcript.txt");
      if (transcriptPath) {
        transcript = readFileSync(transcriptPath, "utf8").trim();
      } else {
        const srtPath = resolveArtifact(job, jobId, "srt_file", ".srt");
        if (srtPath) transcript = readFileSync(srtPath, "utf8").trim();
      }
    }
    if (!transcript) {
      return {
        result: {
          error: jobId
            ? `no transcript or captions found for job ${jobId} (run generate_transcript or build_video first)`
            : "pass a transcript job_id (or build job_id), or the transcript text directly",
        },
      };
    }
    try {
      const metadata = await draftYoutubeMetadata(transcript);
      return { result: { metadata } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "metadata generation failed";
      return { result: { error: message } };
    }
  }

  if (name === "delete_subtitles") {
    const jobId = String(args.job_id ?? "");
    const indices = Array.isArray(args.indices) ? (args.indices as number[]) : [];
    const job = await store.get(jobId);
    if (!job || job.tool !== "build_video" || !job.result) {
      return { result: { error: "subtitles can only be edited on a finished build job" } };
    }
    const result = { ...job.result };
    const projectFile = result.project_file as string | undefined;
    if (!projectFile || !existsSync(projectFile)) {
      return { result: { error: "this build has no project file on disk" } };
    }
    try {
      const summary = deleteCaptions(projectFile, result.srt_file as string | undefined, indices);
      result.captions = summary.remaining;
      await store.finish(jobId, result);
      return { result: summary };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : "delete failed" } };
    }
  }

  if (name === "generate_voiceover") {
    const voice = isVoice(args.voice) ? args.voice : "alloy";
    const speed = typeof args.speed === "number" ? args.speed : 1.0;
    const params: VoiceoverRequest = { script: String(args.script ?? ""), voice, speed };
    const { result, job } = await enqueue(name, runVoiceover, params);
    return { result, job };
  }

  if (name === "generate_transcript") {
    const voice = isVoice(args.voice) ? args.voice : "alloy";
    const speed = typeof args.speed === "number" ? args.speed : 1.0;
    const params: TranscriptRequest = { script: String(args.script ?? ""), voice, speed };
    const { result, job } = await enqueue(name, runTranscript, params);
    return { result, job };
  }

  if (name === "generate_images") {
    const { imageStyle } = getChannel(channelId);
    const all = Array.isArray(args.prompts) ? (args.prompts as unknown[]) : [];
    // Cost guardrail: never render more than MAX_IMAGES_PER_VIDEO images per job.
    const limited = all.slice(0, MAX_IMAGES_PER_VIDEO);
    const cappedNote =
      all.length > limited.length
        ? `Capped from ${all.length} to the ${MAX_IMAGES_PER_VIDEO}-image maximum per video to control cost. `
        : "";
    const params: ImagesRequest = {
      prompts: limited.map((p) => `${String(p)}. Style: ${imageStyle}.`),
      width: typeof args.width === "number" ? args.width : undefined,
      height: typeof args.height === "number" ? args.height : undefined,
    };
    const { result, job } = await enqueue("generate_images", runImages, params);
    return { result: { ...result, note: `${cappedNote}${result.note}` }, job };
  }

  if (name === "build_video") {
    const project = (args.project as Record<string, unknown>) ?? {};
    const params: BuildRequest = {
      name: typeof project.name === "string" ? project.name : undefined,
      audio_file: typeof project.audio_file === "string" ? project.audio_file : undefined,
      transcript_file: typeof project.transcript_file === "string" ? project.transcript_file : undefined,
      images_dir: typeof project.images_dir === "string" ? project.images_dir : undefined,
      include_captions: typeof project.include_captions === "boolean" ? project.include_captions : undefined,
    };
    const { result, job } = await enqueue("build_video", runBuild, params);
    return { result, job };
  }

  return { result: { error: `unknown tool ${name}` } };
}

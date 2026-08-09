import { getChannel } from "@/lib/channels";
import { MAX_IMAGES_PER_VIDEO, MAX_VIDEO_DURATION_SECONDS } from "@/lib/config";
import { getImageProvider } from "@/lib/image-providers";
import type { JobRef } from "@/lib/types";

import { API_BASE } from "./config";
import { connector } from "./connector";
import { draftScript, draftYoutubeMetadata } from "./openai";
import { ASYNC_ENDPOINTS } from "./tools";

// Run one tool call → return { result for the LLM, optional job to surface to the UI }.
// `channelId` is the conversation's active channel: it sets the script voice and the
// image art style so every video stays on-brand for its niche. `imageProvider` is the
// app-level image backend (FLUX vs Imagen) the user picked in the toolbar.
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  channelId?: string | null,
  imageProvider?: string | null,
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
    const { data } = await connector("GET", `/jobs/${jobId}`);
    return { result: data };
  }

  if (name === "read_subtitles") {
    const jobId = String(args.job_id ?? "");
    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}/srt`);
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { detail?: string };
        return { result: { error: detail.detail ?? `no subtitles for job ${jobId}` } };
      }
      return { result: { srt: await res.text() } };
    } catch (err) {
      const message = err instanceof Error ? err.message : "connector unreachable";
      return { result: { error: `${message} (is the video API on ${API_BASE}?)` } };
    }
  }

  if (name === "suggest_youtube_metadata") {
    // Prefer transcript text if the agent passed it; otherwise read the real file
    // from the connector (timestamped transcript first, SRT captions as fallback).
    let transcript = typeof args.transcript === "string" ? args.transcript.trim() : "";
    const jobId = String(args.job_id ?? "");
    if (!transcript && jobId) {
      const t = await connector("GET", `/jobs/${jobId}/transcript`);
      if (t.ok && typeof (t.data as { transcript?: string }).transcript === "string") {
        transcript = (t.data as { transcript: string }).transcript.trim();
      } else {
        try {
          const res = await fetch(`${API_BASE}/jobs/${jobId}/srt`);
          if (res.ok) transcript = (await res.text()).trim();
        } catch {
          // fall through to the no-transcript error below
        }
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
    const indices = Array.isArray(args.indices) ? args.indices : [];
    const { ok, data } = await connector("POST", `/jobs/${jobId}/subtitles/delete`, { indices });
    return { result: ok ? data : { error: (data as { detail?: string }).detail ?? data } };
  }

  const endpoint = ASYNC_ENDPOINTS[name];
  if (!endpoint) return { result: { error: `unknown tool ${name}` } };

  // build_video nests its fields under `project`; the others map 1:1.
  let payload = name === "build_video" ? (args.project as Record<string, unknown>) ?? {} : args;

  // Keep the whole video on-brand: append the channel's art style to every shot prompt
  // so the agent only has to say WHAT is in each scene, not how it's drawn.
  let cappedNote: string | undefined;
  if (name === "generate_images" && Array.isArray(payload.prompts)) {
    const { imageStyle } = getChannel(channelId);
    const all = payload.prompts as unknown[];
    // Cost guardrail: never render more than MAX_IMAGES_PER_VIDEO images per job.
    const limited = all.slice(0, MAX_IMAGES_PER_VIDEO);
    if (all.length > limited.length) {
      cappedNote = `Capped from ${all.length} to the ${MAX_IMAGES_PER_VIDEO}-image maximum per video to control cost. `;
    }
    payload = {
      ...payload,
      prompts: limited.map((p) => `${String(p)}. Style: ${imageStyle}.`),
      // Route to the user's chosen backend; getImageProvider falls back to the default.
      provider: getImageProvider(imageProvider).id,
    };
  }
  const { ok, data } = await connector("POST", endpoint, payload);
  if (!ok) return { result: data };

  const jobId = (data as { job_id?: string }).job_id;
  if (!jobId) return { result: data };

  const job: JobRef = { id: jobId, tool: name, status: "queued" };
  return {
    result: {
      job_id: jobId,
      status: "queued",
      note: `${cappedNote ?? ""}Started — running in the background, the user sees live progress.`,
    },
    job,
  };
}

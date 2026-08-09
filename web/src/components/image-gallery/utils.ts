import { connectorUrl } from "@/lib/connector";
import type { JobStatus } from "@/lib/types";

export const POLL_MS = 1500;

// src for an image; `key` busts the browser cache after a regenerate replaces the
// canonical file (the filename is stable, so versions.length changes the URL).
// `base` comes from useApiBase() in the rendering component (hydration-safe).
export function imgSrc(base: string | null, jobId: string, name: string, key: number) {
  return `${connectorUrl(`/jobs/${jobId}/images/${name}`, base)}?k=${key}`;
}

export async function pollUntilDone(jobId: string): Promise<JobStatus> {
  for (;;) {
    const res = await fetch(connectorUrl(`/jobs/${jobId}`), { cache: "no-store" });
    const data = (await res.json()) as { status?: JobStatus };
    const status = data.status ?? "failed";
    if (status === "done" || status === "failed" || status === "canceled") return status;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

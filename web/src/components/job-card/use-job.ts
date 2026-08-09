"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { connectorUrl } from "@/lib/connector";
import type { Job, JobRef } from "@/lib/types";

export const POLL_MS = 1500;

// Poll the connector's /jobs/{id} while active; stop on done|failed|canceled. Exposes cancel().
export function useJob(ref: JobRef) {
  const [job, setJob] = useState<Job>({
    id: ref.id,
    tool: ref.tool,
    status: ref.status,
    progress: { stage: "", current: 0, total: 0 },
    result: null,
    error: null,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(connectorUrl(`/jobs/${ref.id}`), { cache: "no-store" });
        const data = (await res.json()) as Job & { error?: string };
        if (cancelled || stopped.current) return;
        if (res.ok && data.id) {
          setJob(data);
          if (data.status === "done" || data.status === "failed" || data.status === "canceled") return;
        } else {
          setJob((j) => ({ ...j, status: "failed", error: data.error ?? `status ${res.status}` }));
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setJob((j) => ({ ...j, status: "failed", error: err instanceof Error ? err.message : "poll failed" }));
        return;
      }
      timer.current = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ref.id]);

  const cancel = useCallback(async () => {
    try {
      const res = await fetch(connectorUrl(`/jobs/${ref.id}/cancel`), { method: "POST" });
      const data = (await res.json()) as Job;
      if (data.status) {
        stopped.current = true;
        setJob((j) => ({ ...j, status: data.status }));
      }
    } catch {
      /* ignore — next poll will reconcile */
    }
  }, [ref.id]);

  return { job, cancel };
}

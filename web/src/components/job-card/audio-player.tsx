"use client";

import { connectorUrl } from "@/lib/connector";

// Click to hear (native audio element fed by the job's /audio route).
export function AudioPlayer({ jobId }: { jobId: string }) {
  return (
    <audio controls preload="none" className="h-9 w-full" src={connectorUrl(`/jobs/${jobId}/audio`)}>
      Your browser does not support audio playback.
    </audio>
  );
}

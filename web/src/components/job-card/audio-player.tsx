"use client";

import { connectorUrl, useApiBase } from "@/lib/connector";

// Click to hear (native audio element fed by the connector's /audio route, called
// directly when an ?apiUrl= backend is configured, else via the same-origin proxy).
export function AudioPlayer({ jobId }: { jobId: string }) {
  const base = useApiBase();
  return (
    <audio controls preload="none" className="h-9 w-full" src={connectorUrl(`/jobs/${jobId}/audio`, base)}>
      Your browser does not support audio playback.
    </audio>
  );
}

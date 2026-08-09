"use client";

import { Loader2 } from "lucide-react";

export function Placeholder({ first, elapsed }: { first: boolean; elapsed?: string }) {
  return (
    <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-lg bg-[#e7eaf0]">
      {first ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-[#90949c]" />
          {elapsed && <span className="font-mono text-[11px] tabular-nums text-[#90949c]">{elapsed}</span>}
        </>
      ) : (
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#bcc0c4]" />
      )}
    </div>
  );
}

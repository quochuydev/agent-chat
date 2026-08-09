"use client";

import { JobCard } from "@/components/job-card";
import type { JobRef } from "@/lib/types";

const TOOL_HEADING: Record<string, string> = {
  generate_voiceover: "Voiceover",
  generate_transcript: "Aligned transcript",
  generate_images: "Images",
  build_video: "Video build",
};

// The large right-hand canvas. Mirrors v0's preview area: it shows the latest (or the
// explicitly selected) job's full output, or an empty placeholder when nothing has run.
export function PreviewCanvas({
  jobs,
  selectedId,
  onOpenJob,
}: {
  jobs: JobRef[];
  selectedId: string | null;
  onOpenJob?: (jobId: string) => void;
}) {
  const job = (selectedId && jobs.find((j) => j.id === selectedId)) || jobs[jobs.length - 1] || null;

  if (!job) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#fafafa]">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <Logo className="h-14 w-14 text-[#c8c8c8]" />
          <p className="text-[14px] text-[#8f8f8f]">Your generation will show here.</p>
        </div>
      </div>
    );
  }

  const heading = TOOL_HEADING[job.tool] ?? job.tool;

  return (
    <div className="h-full w-full overflow-y-auto bg-[#fafafa]">
      <div className="mx-auto w-full max-w-[680px] px-6 py-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-[#171717]">{heading}</h2>
          <span className="font-mono text-[12px] text-[#a3a3a3]">#{job.id}</span>
        </div>
        {/* key on id so switching jobs remounts the poller cleanly */}
        <JobCard key={job.id} jobRef={job} onOpenJob={onOpenJob} variant="panel" />
      </div>
    </div>
  );
}

// Abstract v0-style mark: a rounded square crossed by a diagonal.
function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <rect x="6" y="6" width="36" height="36" rx="10" stroke="currentColor" strokeWidth="2.5" />
      <path d="M16 32 L32 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M28 16 H32 V20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

"use client";

import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Square,
} from "lucide-react";

import { ImageGallery } from "@/components/image-gallery";
import { cn } from "@/lib/utils";
import type { JobRef } from "@/lib/types";
import { DoneBody } from "./done-body";
import { useJob } from "./use-job";

const TOOL_META: Record<string, { label: string; icon: typeof Mic }> = {
  generate_voiceover: { label: "Voiceover", icon: Mic },
  generate_transcript: { label: "Transcript", icon: Mic },
  generate_images: { label: "Images", icon: ImageIcon },
  build_video: { label: "Building video", icon: Film },
};

export function JobCard({
  jobRef,
  onOpenJob,
  variant = "chat",
}: {
  jobRef: JobRef;
  onOpenJob?: (jobId: string) => void;
  // "chat" = compact card inline in a thread; "panel" = full-width card in the preview canvas.
  variant?: "chat" | "panel";
}) {
  const { job, cancel } = useJob(jobRef);
  const meta = TOOL_META[job.tool] ?? { label: job.tool, icon: Film };
  const { stage, current, total } = job.progress;
  const Icon = meta.icon;

  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null;
  const active = job.status === "queued" || job.status === "running";
  const isImages = job.tool === "generate_images";

  return (
    <div
      className={cn(
        "overflow-hidden border border-[#ededed] bg-white",
        variant === "panel" ? "w-full rounded-2xl" : "w-full max-w-[75%] rounded-[18px]",
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-2.5 text-[13px] font-semibold text-[#050505]">
        {active ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#171717]" />
        ) : job.status === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-[#1d9b4e]" />
        ) : job.status === "canceled" ? (
          <Ban className="h-4 w-4 text-[#90949c]" />
        ) : (
          <AlertCircle className="h-4 w-4 text-[#d93025]" />
        )}
        <Icon className="h-4 w-4 text-[#65676b]" />
        <span>{meta.label}</span>
        <span className="ml-auto font-mono text-[11px] font-normal text-[#90949c]">#{job.id}</span>
      </div>

      <div className="px-3 pb-3 pt-2">
        {active && (
          <div className="mb-2">
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e7eaf0]">
                <div
                  className={cn(
                    "h-full rounded-full bg-[#171717] transition-[width] duration-500",
                    pct === null && "w-1/3 animate-pulse",
                  )}
                  style={pct === null ? undefined : { width: `${pct}%` }}
                />
              </div>
              <button
                type="button"
                onClick={cancel}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-[#d93025] hover:bg-[#fdeded]"
              >
                <Square className="h-3 w-3 fill-current" />
                Stop
              </button>
            </div>
            <div className="mt-1 text-[12px] text-[#65676b]">
              {job.status === "queued"
                ? "queued…"
                : stage === "cooling"
                  ? `cooling down (GPU rest) · ${current}/${total} done`
                  : isImages && total > 0
                    ? `generating image ${current} of ${total}… · ${pct}%`
                    : `${stage || "working"}${total > 0 ? ` · ${current}/${total}` : ""}${
                        pct !== null ? ` · ${pct}%` : ""
                      }`}
            </div>
          </div>
        )}

        {/* Images: gallery shows live per-image progress and any rendered images that
            survive — even for a failed/canceled/orphaned job (it self-hides when empty). */}
        {isImages && job.status !== "queued" && <ImageGallery jobId={job.id} active={active} />}

        {job.status === "done" && !isImages && <DoneBody job={job} onOpenJob={onOpenJob} />}

        {job.status === "canceled" && (
          <div className={cn("text-[12px] text-[#90949c]", isImages && "mt-2")}>
            Stopped. Ask me to start it again.
          </div>
        )}

        {job.status === "failed" && (
          <div className={cn("text-[12px] leading-snug text-[#d93025]", isImages && "mt-2")}>
            {job.error ?? "Job failed."}
            <div className="mt-0.5 text-[#90949c]">
              {isImages ? "Showing what was rendered. Ask me to finish or retry." : "Ask me to retry."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

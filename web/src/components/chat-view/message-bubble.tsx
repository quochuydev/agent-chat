"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  type LucideIcon,
} from "lucide-react";

import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import type { DisplayMessage, JobRef } from "@/lib/types";
import { VoiceSample } from "./voice-sample";

const TOOL_META: Record<string, { label: string; icon: LucideIcon }> = {
  generate_voiceover: { label: "Recorded voiceover", icon: Mic },
  generate_transcript: { label: "Aligned transcript", icon: Mic },
  generate_images: { label: "Generated images", icon: ImageIcon },
  build_video: { label: "Built video", icon: Film },
};

// Kokoro voice ids mentioned in a message (af_sky, am_michael, bm_george, …) — surfaced
// as "hear this voice" chips so the user can preview the narration before generating.
const VOICE_RE = /\b[ab][fm]_[a-z]+\b/g;
function voicesIn(text: string): string[] {
  return Array.from(new Set(text.match(VOICE_RE) ?? []));
}

// One turn in the left activity log. User prompts render as a light inset block;
// assistant text renders as plain prose; each job becomes a compact, selectable row
// (the full output lives in the right preview canvas). Every message gets a copy button.
export function MessageBubble({
  message,
  isGroupStart,
  selectedJobId,
  onSelectJob,
}: {
  message: DisplayMessage;
  isGroupStart: boolean;
  selectedJobId: string | null;
  onSelectJob?: (jobId: string) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className={cn("group flex flex-col", isGroupStart ? "mt-4" : "mt-2")}>
        <div className="whitespace-pre-wrap break-words rounded-xl bg-[#f5f5f5] px-3 py-2 text-[14px] leading-[1.5] text-[#171717]">
          {message.content}
        </div>
        <div className="mt-1 flex opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton text={message.content} />
        </div>
      </div>
    );
  }

  const voices = message.content ? voicesIn(message.content) : [];

  return (
    <div className={cn("group flex flex-col gap-2", isGroupStart ? "mt-4" : "mt-2")}>
      {message.content && (
        <div className="break-words text-[14px] leading-[1.55] text-[#171717]">
          <Markdown content={message.content} />
        </div>
      )}
      {voices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {voices.map((v) => (
            <VoiceSample key={v} voice={v} />
          ))}
        </div>
      )}
      {message.jobs && message.jobs.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {message.jobs.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              selected={job.id === selectedJobId}
              onSelect={onSelectJob}
            />
          ))}
        </div>
      )}
      {message.content && (
        <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton text={message.content} />
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : "Copy message"}
      aria-label="Copy message"
      className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-[#8f8f8f] hover:bg-[#f5f5f5] hover:text-[#171717]"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function JobRow({
  job,
  selected,
  onSelect,
}: {
  job: JobRef;
  selected: boolean;
  onSelect?: (jobId: string) => void;
}) {
  const meta = TOOL_META[job.tool] ?? { label: job.tool, icon: Film };
  const Icon = meta.icon;
  const active = job.status === "queued" || job.status === "running";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(job.id)}
      title="Show in preview"
      className={cn(
        "group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        selected ? "bg-[#f0f0f0] text-[#171717]" : "text-[#8f8f8f] hover:bg-[#f5f5f5]",
      )}
    >
      {active ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#171717]" />
      ) : (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate">{meta.label}</span>
      <StatusDot status={job.status} />
    </button>
  );
}

function StatusDot({ status }: { status: JobRef["status"] }) {
  if (status === "queued" || status === "running") return null;
  const color =
    status === "done" ? "bg-[#1d9b4e]" : status === "failed" ? "bg-[#d93025]" : "bg-[#bdbdbd]";
  return <span className={cn("ml-auto h-1.5 w-1.5 shrink-0 rounded-full", color)} />;
}

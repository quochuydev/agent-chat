"use client";

import { Loader2, RefreshCw } from "lucide-react";

import { useApiBase } from "@/lib/connector";
import type { JobImage } from "@/lib/types";
import { imgSrc } from "./utils";

export function Thumb({
  jobId,
  img,
  regenerating,
  onOpen,
  onRegenerate,
}: {
  jobId: string;
  img: JobImage;
  regenerating: boolean;
  onOpen: () => void;
  onRegenerate: () => void;
}) {
  const base = useApiBase();
  const key = img.versions.length;
  return (
    <div className="group relative aspect-video overflow-hidden rounded-lg bg-[#e7eaf0]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imgSrc(base, jobId, img.name, key)}
        alt={img.prompt ?? img.name}
        onClick={onOpen}
        className="h-full w-full cursor-pointer object-cover"
      />
      <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[10px] font-medium text-white">
        {img.index}
        {img.versions.length > 0 && <span className="ml-0.5 opacity-80">·v{img.versions.length + 1}</span>}
      </span>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={regenerating}
        aria-label={`Regenerate image ${img.index}`}
        className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-100"
      >
        {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

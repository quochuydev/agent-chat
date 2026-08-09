"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, X } from "lucide-react";

import { useApiBase } from "@/lib/connector";
import type { JobImage } from "@/lib/types";
import { imgSrc } from "./utils";

export function Lightbox({
  jobId,
  images,
  index,
  regenerating,
  onClose,
  onNavigate,
  onRegenerate,
}: {
  jobId: string;
  images: JobImage[];
  index: number;
  regenerating: boolean;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onRegenerate: () => void;
}) {
  const base = useApiBase();
  const img = images[index];
  const prev = () => onNavigate((index - 1 + images.length) % images.length);
  const next = () => onNavigate((index + 1) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Previous"
        onClick={(e) => { e.stopPropagation(); prev(); }}
        className="absolute left-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={(e) => { e.stopPropagation(); next(); }}
        className="absolute right-4 bottom-1/2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      <div className="flex max-h-full max-w-3xl flex-col items-center" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc(base, jobId, img.name, img.versions.length)}
          alt={img.prompt ?? img.name}
          className="max-h-[70vh] rounded-lg object-contain"
        />
        <div className="mt-3 flex w-full items-start gap-3 text-white">
          <div className="flex-1 text-[13px]">
            <span className="text-white/60">
              #{img.index} of {images.length}
              {img.versions.length > 0 && ` · v${img.versions.length + 1}`}
            </span>
            {img.prompt && <p className="mt-0.5 text-white/90">{img.prompt}</p>}
          </div>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

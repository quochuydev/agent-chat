"use client";

import { useApiBase } from "@/lib/connector";
import type { JobImage } from "@/lib/types";
import { imgSrc } from "./utils";

export function Slider({
  jobId,
  images,
  onOpen,
}: {
  jobId: string;
  images: JobImage[];
  onOpen: (i: number) => void;
}) {
  const base = useApiBase();
  return (
    <div className="flex snap-x gap-2 overflow-x-auto pb-1">
      {images.map((img, i) => (
        <div key={img.name} className="relative w-40 shrink-0 snap-start">
          <div className="aspect-video overflow-hidden rounded-lg bg-[#e7eaf0]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc(base, jobId, img.name, img.versions.length)}
              alt={img.prompt ?? img.name}
              onClick={() => onOpen(i)}
              className="h-full w-full cursor-pointer object-cover"
            />
          </div>
          {img.prompt && <div className="mt-1 line-clamp-2 text-[11px] text-[#65676b]">{img.prompt}</div>}
        </div>
      ))}
    </div>
  );
}

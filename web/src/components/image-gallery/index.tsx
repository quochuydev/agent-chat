"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Grid2x2, Rows } from "lucide-react";

import { connectorUrl } from "@/lib/connector";
import type { JobImages } from "@/lib/types";
import { Lightbox } from "./lightbox";
import { Placeholder } from "./placeholder";
import { Slider } from "./slider";
import { Thumb } from "./thumb";
import { ViewToggle } from "./view-toggle";
import { POLL_MS, pollUntilDone } from "./utils";

type Props = { jobId: string; active: boolean };

export function ImageGallery({ jobId, active }: Props) {
  const [data, setData] = useState<JobImages | null>(null);
  const [view, setView] = useState<"grid" | "slider">("grid");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [regen, setRegen] = useState<Record<number, boolean>>({});
  const [nowMs, setNowMs] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // when the image currently rendering started — reset each time another finishes
  const genStartRef = useRef<number>(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(connectorUrl(`/jobs/${jobId}/images`), { cache: "no-store" });
      if (res.ok) setData((await res.json()) as JobImages);
    } catch {
      /* transient — keep last good data */
    }
  }, [jobId]);

  // Poll while the parent job is still rendering; one final fetch when it settles.
  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      await refresh();
      if (cancelled || !active) return;
      timer.current = setTimeout(loop, POLL_MS);
    };
    loop();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh, active]);

  const ready = data?.images.length ?? 0;

  // Tick a clock once a second while rendering so the elapsed timer updates live.
  useEffect(() => {
    if (!active) return;
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // Restart the per-image timer whenever another image finishes (or rendering begins).
  useEffect(() => {
    if (active) genStartRef.current = Date.now();
  }, [active, ready]);

  const regenerate = async (index: number) => {
    setRegen((r) => ({ ...r, [index]: true }));
    try {
      const res = await fetch(connectorUrl(`/jobs/${jobId}/regenerate`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const { job_id } = (await res.json()) as { job_id?: string };
      if (job_id) await pollUntilDone(job_id);
      await refresh(); // picks up the new version + replaced canonical file
    } finally {
      setRegen((r) => {
        const next = { ...r };
        delete next[index];
        return next;
      });
    }
  };

  const images = data?.images ?? [];
  const total = data?.total ?? images.length;
  // Only show "still rendering" slots while the job is actually running — otherwise a
  // stopped/failed/partial job would show a misleading perpetual spinner.
  const pending = active ? Math.max(0, total - images.length) : 0;
  const elapsed = active && genStartRef.current ? Math.max(0, Math.floor((nowMs - genStartRef.current) / 1000)) : 0;
  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  if (!data) {
    return <div className="py-2 text-[12px] text-[#65676b]">Loading images…</div>;
  }

  // Nothing rendered and the job isn't running — let the card show its status instead.
  if (!active && images.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[12px] text-[#65676b]">
        <span>
          {images.length}/{total} images
        </span>
        <div className="ml-auto flex items-center gap-1">
          <ViewToggle active={view === "grid"} onClick={() => setView("grid")} label="Grid">
            <Grid2x2 className="h-3.5 w-3.5" />
          </ViewToggle>
          <ViewToggle active={view === "slider"} onClick={() => setView("slider")} label="Slider">
            <Rows className="h-3.5 w-3.5" />
          </ViewToggle>
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {images.map((img, i) => (
            <Thumb
              key={img.name}
              jobId={jobId}
              img={img}
              regenerating={!!regen[img.index]}
              onOpen={() => setLightbox(i)}
              onRegenerate={() => regenerate(img.index)}
            />
          ))}
          {Array.from({ length: pending }).map((_, i) => (
            <Placeholder key={`p${i}`} first={i === 0} elapsed={i === 0 ? elapsedLabel : undefined} />
          ))}
        </div>
      ) : (
        <Slider jobId={jobId} images={images} onOpen={setLightbox} />
      )}

      {lightbox !== null && images[lightbox] && (
        <Lightbox
          jobId={jobId}
          images={images}
          index={lightbox}
          regenerating={!!regen[images[lightbox].index]}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
          onRegenerate={() => regenerate(images[lightbox].index)}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Square, Volume2 } from "lucide-react";

import { connectorUrl, useApiBase } from "@/lib/connector";
import { cn } from "@/lib/utils";

type State = "idle" | "loading" | "playing" | "error";

// A small "hear this voice" chip. Clicking fetches a short cached TTS preview from the
// connector (GET /voice/sample) and plays it. First play may take a few seconds while the
// model loads; the wav is cached server-side and as a blob URL here, so replays are instant.
export function VoiceSample({ voice }: { voice: string }) {
  const base = useApiBase();
  const [state, setState] = useState<State>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const stop = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setState("idle");
  };

  const toggle = async () => {
    if (state === "playing") return stop();
    if (state === "loading") return;
    try {
      setState("loading");
      if (!urlRef.current) {
        const res = await fetch(
          connectorUrl(`/voice/sample?voice=${encodeURIComponent(voice)}`, base),
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`sample failed (${res.status})`);
        urlRef.current = URL.createObjectURL(await res.blob());
      }
      const audio = new Audio(urlRef.current);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("error");
      await audio.play();
      setState("playing");
    } catch {
      setState("error");
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Hear ${voice}`}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
        state === "error"
          ? "border-[#f3c2c2] bg-[#fdf2f2] text-[#b42318]"
          : "border-[#ededed] bg-white text-[#525252] hover:bg-[#f5f5f5]",
      )}
    >
      {state === "loading" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : state === "playing" ? (
        <Square className="h-3.5 w-3.5 fill-current" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
      {state === "error" ? "Preview unavailable" : `Hear ${voice}`}
    </button>
  );
}

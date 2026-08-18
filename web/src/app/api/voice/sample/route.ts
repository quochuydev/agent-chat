import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { RUNS_DIR } from "@/lib/config";
import { isVoice, synthesize } from "@/lib/jobs/tts";

// Short, cached TTS preview of a voice so users can hear it before generating — replaces
// the connector's GET /voice/sample (Kokoro). Caches the wav per voice+speed on disk, so
// repeat plays are instant.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_TEXT = "Hey! This is a quick preview of how I sound. I'll be narrating your video.";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const voice = searchParams.get("voice") ?? "";
  const speed = Number(searchParams.get("speed") ?? "1.0");

  if (!isVoice(voice)) return NextResponse.json({ detail: "bad voice id" }, { status: 400 });
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2.0) {
    return NextResponse.json({ detail: "speed out of range" }, { status: 400 });
  }

  const samplesDir = path.join(RUNS_DIR, "_voice_samples");
  mkdirSync(samplesDir, { recursive: true });
  const out = path.join(samplesDir, `${voice}_${speed}.wav`);

  if (!existsSync(out)) {
    try {
      const wav = await synthesize(SAMPLE_TEXT, voice, speed);
      writeFileSync(out, wav);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "voice sample failed";
      return NextResponse.json({ detail }, { status: 500 });
    }
  }

  return new Response(new Uint8Array(readFileSync(out)), {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Disposition": `inline; filename="${voice}_${speed}.wav"`,
    },
  });
}

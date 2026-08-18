// Cloud narration (replaces the local Kokoro-82M model). One HTTP call per synthesize()
// to OpenAI's TTS endpoint; runners.ts calls this once per voiceover and once per
// caption line for the timestamped transcript.
import { OPENAI_API_KEY, OPENAI_TTS_URL } from "@/lib/chat/config";
import { OPENAI_TTS_MODEL } from "@/lib/config";

export const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type Voice = (typeof VOICES)[number];

export function isVoice(v: unknown): v is Voice {
  return typeof v === "string" && (VOICES as readonly string[]).includes(v);
}

export async function synthesize(text: string, voice: Voice, speed = 1.0, signal?: AbortSignal): Promise<Buffer> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set — cannot synthesize narration");
  const res = await fetch(OPENAI_TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      input: text,
      voice,
      speed,
      response_format: "wav",
    }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`TTS request failed (${res.status}): ${detail.slice(0, 400)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

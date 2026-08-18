// App-wide environment config. Per web/CLAUDE.md, every `process.env.*` read lives
// in a config.ts file — import the typed constants from here instead of reading env.

import path from "node:path";

// Neon Postgres connection string (pooled). Used by lib/db.ts for conversations,
// messages, and the async job store (lib/jobs/store.ts) — one database, one service.
export const DATABASE_URL = process.env.DATABASE_URL ?? "";

// Google Imagen (cloud image generation — see lib/jobs/imagen.ts). Get a key at
// https://aistudio.google.com. Without it, generate_images jobs fail with a clear error.
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
// Imagen 3 is shut down; "Fast" lives on as Imagen 4 Fast. Override for another
// Imagen `:predict` model (e.g. imagen-4.0-generate-001 for higher quality).
export const IMAGEN_MODEL = process.env.IMAGEN_MODEL ?? "imagen-4.0-fast-generate-001";

// OpenAI TTS model for generate_voiceover/generate_transcript/voice samples
// (lib/jobs/tts.ts). Uses the same OPENAI_API_KEY as the chat model.
export const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";

// Where job artifacts (audio/images/project files) are written — lib/jobs/runs.ts.
// A Docker deployment should mount a volume here so renders survive a restart.
export const RUNS_DIR = process.env.RUNS_DIR ?? path.join(process.cwd(), ".data", "runs");

// Public site origin (no trailing slash). Used for SEO: metadataBase, canonical URLs,
// Open Graph/Twitter absolute URLs, robots.txt and sitemap.xml. Override per environment
// with NEXT_PUBLIC_SITE_URL; defaults to the production domain.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chat.cappuai.com").replace(
  /\/$/,
  "",
);

// --- Cost guardrails ---------------------------------------------------------
// Hard caps on how much a single video can generate, so a runaway agent/prompt can't run
// up TTS + image spend. The agent tool layer (lib/chat/run-tool.ts) clamps requests to
// these before enqueueing a job; the job request validation enforces them as a backstop.
function posInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// Longest narration a video may target, in seconds (caps script length → TTS cost).
// Default 30s = a short-form clip.
export const MAX_VIDEO_DURATION_SECONDS = posInt(process.env.MAX_VIDEO_DURATION_SECONDS, 30);

// Most images (scenes) a single video may generate (caps image-model spend).
// Default 10 = one image per ~3s of a 30s video.
export const MAX_IMAGES_PER_VIDEO = posInt(process.env.MAX_IMAGES_PER_VIDEO, 10);

// How many jobs the in-process worker (lib/jobs/worker.ts) runs concurrently.
export const JOB_WORKER_CONCURRENCY = posInt(process.env.JOB_WORKER_CONCURRENCY, 2);

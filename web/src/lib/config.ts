// App-wide environment config. Per web/CLAUDE.md, every `process.env.*` read lives
// in a config.ts file — import the typed constants from here instead of reading env.

// Neon Postgres connection string (pooled). Used by lib/db.ts for conversations +
// messages, and shared with the Python connector's job store (same database).
export const DATABASE_URL = process.env.DATABASE_URL ?? "";

// Public site origin (no trailing slash). Used for SEO: metadataBase, canonical URLs,
// Open Graph/Twitter absolute URLs, robots.txt and sitemap.xml. Override per environment
// with NEXT_PUBLIC_SITE_URL; defaults to the production domain.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chat.cappuai.com").replace(
  /\/$/,
  "",
);

// --- Cost guardrails ---------------------------------------------------------
// Hard caps on how much a single video can generate, so a runaway agent/prompt can't run
// up TTS + image spend. The agent tool layer clamps to these before calling the connector
// (smooth UX); the connector (video/api/config.py) enforces the same limits as a backstop.
// Keep both sides in sync via the same env var names.
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

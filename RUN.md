# Running the AI Video Agent

One service, `web/` — a Next.js app that runs the chat agent AND the async job
pipeline (voiceover/transcript via OpenAI TTS, images via Google Imagen, OpenCut
assembly) in-process. See [docs/architecture](./docs/architecture) for the deeper
design docs (some describe an earlier two-service version — the pipeline they
describe is current, but the FastAPI connector they mention has since been folded
into `web/`).

## Setup

```bash
cd web
cp .env.example .env       # set the keys below
pnpm install
pnpm db:init                # applies web/src/lib/schema.sql to DATABASE_URL
pnpm dev                    # :3334
```

Env vars, set in `web/.env`:

- `OPENAI_API_KEY` — required. Powers the chat agent AND narration (OpenAI TTS).
- `OPENAI_MODEL` — chat model, default `gpt-4o-mini`.
- `OPENAI_TTS_MODEL` — narration model, default `gpt-4o-mini-tts`.
- `OPENAI_BASE_URL` — optional; point at any OpenAI-compatible provider (e.g.
  `https://api.deepseek.com/v1`) for chat. TTS still needs a real OpenAI-compatible
  `/audio/speech` endpoint.
- `GEMINI_API_KEY` — required for `generate_images` (Google Imagen). Get one at
  https://aistudio.google.com.
- `IMAGEN_MODEL` — optional override, default `imagen-4.0-fast-generate-001`.
- `DATABASE_URL` — required. Neon Postgres for conversations/messages AND the async
  job store (`jobs` table in `schema.sql`).
- `RUNS_DIR` — optional; where job artifacts (audio/images/project files) are written
  on disk, default `<cwd>/.data/runs`.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — Clerk authentication
  (https://dashboard.clerk.com → API keys). The workspace is private; signed-out
  visitors see the landing page and are redirected to `/sign-in`.

## Flow (doc 05)

Chat → agent calls `write_script` → on approval `generate_voiceover` /
`generate_transcript` / `generate_images` (each creates a job row and hands it to the
in-process worker — `web/src/lib/jobs/worker.ts` — which runs the matching runner in
`runners.ts`; job cards poll `GET /api/jobs/{id}` live) → agent reads finished job
results with `get_job` → `build_video` assembles the OpenCut project.

## Tests

No test suite yet for the TypeScript job pipeline (`web/src/lib/jobs/*`) — the prior
Python connector's pytest suite (ORM job store, OpenCut builder, FastAPI endpoints) was
removed along with `video/`.

## Scaling to long renders (doc 06)

Jobs persist in Postgres and orphaned (pre-crash/restart) jobs are marked failed on
startup. To move from the minutes tier to the hours tier, swap the in-process worker
(`web/src/lib/jobs/worker.ts`) for a real queue (e.g. BullMQ + Redis, or a hosted queue)
— the store (`store.ts`) and the runners (`runners.ts`) are unchanged; only the
queue/process boundary moves.

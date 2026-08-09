# Running the AI Video Agent

Two layers (see [docs/architecture](./docs/architecture)):

| Layer | Dir | Port | What |
| ----- | --- | ---- | ---- |
| Agent + chat UI | `web/` | 3334 | Next.js. Only this talks to the LLM (`api/chat/route.ts`). |
| Connector + jobs | `video/` | 3333 | FastAPI wrapping the scripts; async jobs in SQLite (or Neon Postgres via `DATABASE_URL`). |

## 1. Connector (`video/`)

**Easiest — one-line install (no git clone).** Downloads the latest release, sets up the
API + model venvs, ready to run:

```bash
curl -fsSL https://raw.githubusercontent.com/quochuydev/agent-chat/main/install.sh | bash
cd ~/agent-chat-connector && ./run_api.sh      # serves :3333
```

Private repo? prefix with `GITHUB_TOKEN=<token>`. Update later with `./setup.sh --update`.

**From a clone.** Set up both venvs (API + Kokoro/FLUX models), then run:

```bash
cd video
./setup.sh            # .venv-api (API) + .venv (models, Apple Silicon only)
./run_api.sh          # serves :3333
```

`./run_api.sh` alone also works — it lazily creates `.venv-api` on first start.

**No AI API key needed here.** The connector generates locally with free, offline models
(Kokoro voiceover, FLUX images) — no OpenAI key, no credits. Weights download from Hugging
Face on first generation. Model generation needs `video/.venv` (from `./setup.sh`) on Apple
Silicon; without it, `/script` and the job lifecycle still work but voiceover/image jobs fail
with a clear error. The only AI key (`OPENAI_API_KEY`) lives in the **web** layer below.

Endpoints (doc 07): `POST /script` (sync) · `/voiceover` `/transcript` `/images` `/build`
(async → `{job_id}`, `/images` takes a `provider`: `flux` local · `imagen` cloud) ·
`GET /jobs/{id}` (+ `/cancel` `/resume` `/regenerate` `/subtitles/delete` and artifact
routes — script, audio, transcript, images, project, srt, archive).

## 2. Web app (`web/`)

```bash
cd web
cp .env.example .env       # set the keys below
pnpm install
pnpm dev                   # :3334
```

**This is the only layer that needs an AI API key.** Set in `web/.env`:

- `OPENAI_API_KEY` — required (the agent loop that picks tools).
- `OPENAI_MODEL` — chat model, default `gpt-4o-mini`.
- `OPENAI_BASE_URL` — optional; point at any OpenAI-compatible provider (e.g.
  `https://api.deepseek.com`) to use a different model host.

Also required in `web/.env` (the app is fully behind auth):

- `DATABASE_URL` — Neon Postgres for conversations/messages (shared with the
  connector's job store when set). Without it, chat still runs but nothing persists.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` — Clerk authentication
  (https://dashboard.clerk.com → API keys). The workspace is private; signed-out
  visitors see the landing page and are redirected to `/sign-in`.

If you use the **hosted** frontend and only run the connector locally, you don't set any AI
key yourself — the hosted web app already has it. You just point it at your machine with
`?apiUrl=http://localhost:3333`.

## Flow (doc 05)

Chat → agent calls `write_script` → on approval `generate_voiceover` / `generate_transcript`
/ `generate_images` (async job cards poll the connector live — `http://localhost:3333/jobs/{id}`
directly, or the `/api/jobs/{id}` same-origin proxy) → agent reads finished job results with
`get_job` → `build_video` assembles the OpenCut project.

## Tests (`video/`)

```bash
cd video
.venv-api/bin/pip install -r requirements-dev.txt
.venv-api/bin/python -m pytest
```

Covers the ORM job store (lifecycle, progress, durability, orphan recovery), the
OpenCut builder, and the FastAPI endpoints — all with synthetic WAV/PNG fixtures, so
no models or `video/.venv` are needed to run them.

## Scaling to long renders (doc 06)

Jobs persist in `video/jobs.db` and orphaned (pre-crash) jobs are marked failed on
restart. To move from the minutes tier to the hours tier, swap the in-process worker
(`api/worker.py`) for RQ/arq + Redis — the store and stage runners are unchanged.

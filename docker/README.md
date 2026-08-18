# Deploying with Docker / Dokploy

| Service | Source                          | Port | Exposure                 |
| ------- | -------------------------------- | ---- | ------------------------ |
| `web`   | `web/` (Next.js chat UI + agent + job runners) | 3334 | public (attach a domain) |

Everything runs in one service. `web` is the only thing that talks to the LLM, and it
also runs the async job pipeline in-process (`web/src/lib/jobs/*`): narration via OpenAI
TTS and images via Google Imagen are both plain cloud API calls, so there's no local
model, no GPU, and no second container to run.

> ⚠️ **Imagen 4 Fast shut down 2026-08-17.** The default `IMAGEN_MODEL`
> (`imagen-4.0-fast-generate-001`) is no longer available — set `IMAGEN_MODEL` to its
> replacement (check [Google's Imagen docs](https://ai.google.dev/gemini-api/docs/imagen))
> before relying on `generate_images` in production.

## Local

```bash
cd docker
cp .env.example .env        # set OPENAI_API_KEY, DATABASE_URL, GEMINI_API_KEY
docker compose up --build
# web → http://localhost:3334
```

State persists in one volume: `web_runs` (job artifacts — audio/images/project files).
Conversations and the job store live in Postgres (`DATABASE_URL`), not the volume.

## Dokploy

1. **Create → Compose**, pointed at this repo. Compose path: `docker/docker-compose.yml`.
2. **Environment:** add `OPENAI_API_KEY` and `DATABASE_URL` (required), plus
   `GEMINI_API_KEY` to enable `generate_images` (optionally `OPENAI_BASE_URL`,
   `OPENAI_MODEL`, `OPENAI_TTS_MODEL`, `IMAGEN_MODEL`). To tune the cost caps, set
   `MAX_VIDEO_DURATION_SECONDS` / `MAX_IMAGES_PER_VIDEO` (defaults `30` / `10`).
3. **Domain:** attach to the **`web`** service, port **3334** (Traefik handles TLS).
4. **Deploy.** The `web_runs` volume keeps job artifacts across redeploys.

## Cost guardrails

Two hard caps stop a runaway prompt from running up image/TTS spend (defaults below,
override via env — the agent clamps requests to these, and job creation rejects
anything over them):

| Var | Default | Effect |
| --- | ------- | ------ |
| `MAX_VIDEO_DURATION_SECONDS` | `30` | Longest narration a video may target (caps script → TTS cost). |
| `MAX_IMAGES_PER_VIDEO` | `10` | Most images generated per video (caps image-model spend). |

## Cost per video (estimate)

At the default caps (**30s, 10 images**): Google Imagen for images, OpenAI TTS for
voice, `gpt-4o-mini` for the agent. Prices are approximate — verify current rates on
[OpenAI's](https://openai.com/api/pricing/) and
[Google's](https://ai.google.dev/gemini-api/docs/pricing) pricing pages, and note the
Imagen deprecation warning above.

| Component | Qty (30s / 10 img) | Cost |
| --------- | ------------------- | ---- |
| Images — Google Imagen | 10 | **~$0.20** |
| Voiceover — OpenAI TTS | ~30s narration | **~$0.01** |
| Agent — gpt-4o-mini | a few turns | **~$0.01** |
| Build / assembly | local (no API) | **$0** |
| **Total** | | **≈ $0.22 / video** (~$220 / 1,000) |

Images are the bulk of the cost, so fewer images per video is the biggest lever.

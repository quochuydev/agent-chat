# Deploying with Docker / Dokploy

| Service | Source                                   | Port | Exposure                 |
| ------- | ---------------------------------------- | ---- | ------------------------ |
| `web`   | `web/` (Next.js agent + chat UI)         | 3334 | public (attach a domain) |
| `video` | `video/` (FastAPI connector + job store) | 3333 | internal only            |

`web` is the only service that talks to the LLM. It reaches `video` over the internal
compose network at `http://video:3333` (`WEB_API_URL`).

## ⚠️ Local models need Apple Silicon — but Imagen works anywhere

Voiceover (Kokoro) and **FLUX** image generation are MLX-specific and run from `video/.venv`
as a subprocess — not installed in the container. Image generation via **Google Imagen**
(`provider="imagen"`) is a pure cloud call with no ML deps, so it works in this Linux
container once `GEMINI_API_KEY` is set. On a Linux server:

- ✅ chat, `write_script`, job store, Files drawer, subtitle review/delete, `build_video`.
- ✅ `generate_images` with the **Imagen 4 Fast** backend (needs `GEMINI_API_KEY`).
- ❌ `generate_voiceover` / `generate_transcript` (Kokoro) and FLUX images fail with a clear error.

Since `build_video` needs an audio file, a fully narrated video can't be assembled
server-side without a Linux voice backend. For local voiceover/FLUX, run the connector on
an Apple-Silicon host with `video/.venv` + models (outside Docker), or swap in Linux/GPU
backends. Set `GEMINI_API_KEY` (see `.env.example`) to enable Imagen images.

## Local

```bash
cd docker
cp .env.example .env        # set OPENAI_API_KEY
docker compose up --build
# web → http://localhost:3334
```

State persists in two volumes: `video_data` (jobs.db) and `video_runs` (artifacts).

## Dokploy — full stack (web + video)

1. **Create → Compose**, pointed at this repo. Compose path: `docker/docker-compose.yml`.
2. **Environment:** add `OPENAI_API_KEY` and `DATABASE_URL` (optionally `OPENAI_BASE_URL`,
   `OPENAI_MODEL`, and `GEMINI_API_KEY` to enable Imagen images). To tune the cost caps,
   set `MAX_VIDEO_DURATION_SECONDS` / `MAX_IMAGES_PER_VIDEO` (defaults `30` / `10`).
   `WEB_API_URL` is already wired to the internal `video` service.
3. **Domain:** attach to the **`web`** service, port **3334** (Traefik handles TLS).
4. **Deploy.** Volumes keep jobs/artifacts across redeploys.

Only `web` gets a public domain; `video` stays internal (no auth).

## Dokploy — connector only (no FLUX, Imagen images)

Deploy just the Python connector as a Dockerfile app:

1. **Create → Application → Dockerfile.**
2. **Build:** context/base directory `video`, Dockerfile path `docker/Dockerfile.video`.
3. **Environment:** `DATABASE_URL` (Postgres job store; omit to use the sqlite volume) and
   `GEMINI_API_KEY` (enables `provider="imagen"` image generation). Optionally
   `MAX_VIDEO_DURATION_SECONDS` / `MAX_IMAGES_PER_VIDEO` to tune the cost caps.
4. **Volumes:** mount `/data` (job store) and `/app/api/runs` (artifacts) to persist them.
5. **Port:** `3333`. The connector has **no auth**, so keep it internal or put it behind
   your own gateway rather than exposing it directly.

Works without any model venv: `write_script`, job lifecycle, **Imagen images**,
`build_video`, artifact serving. Voiceover/transcript (Kokoro) and FLUX images do not run
on Linux.

## Cost guardrails

Both services honor two hard caps so a runaway prompt can't run up image/TTS spend
(defaults, override via env, keep them equal on `web` and `video`):

| Var | Default | Effect |
| --- | ------- | ------ |
| `MAX_VIDEO_DURATION_SECONDS` | `30` | Longest narration a video may target (caps script → TTS cost). |
| `MAX_IMAGES_PER_VIDEO` | `10` | Most images generated per video (caps image-model spend). |

The web agent clamps requests to these; the connector rejects anything over them (`422`).

## Cost per video (estimate)

At the default caps (**30s, 10 images**) with the cloud backends — Imagen 4 Fast for
images, Gemini 2.5 Flash TTS for voice, `gpt-4o-mini` for the agent:

| Component | Rate | Qty (30s / 10 img) | Cost |
| --------- | ---- | ------------------ | ---- |
| Images — Imagen 4 Fast | $0.02 / image | 10 | **$0.20** |
| Voiceover — Gemini 2.5 Flash TTS | $10 / 1M audio tokens (25 tok/s) | 30s ≈ 750 tok | **~$0.01** |
| Agent — gpt-4o-mini | ~$0.15 / $0.60 per 1M in/out | a few turns | **~$0.01** |
| Build / assembly | local (no API) | — | **$0** |
| **Total** | | | **≈ $0.22 / video** (~$220 / 1,000) |

Images are ~90% of the cost, so fewer images is the biggest lever; **FLUX** (local, Apple
Silicon) makes images free but doesn't run on Linux. Prices are approximate — verify on
[Google's pricing page](https://ai.google.dev/gemini-api/docs/pricing).

> ⚠️ **Imagen 4 shuts down Aug 17, 2026.** The default `IMAGEN_MODEL`
> (`imagen-4.0-fast-generate-001`) is deprecated; migrate to Gemini 2.5 Flash Image
> ("Nano Banana", ~$0.039/image, different API) — which would raise a 10-image video to
> ~$0.40.

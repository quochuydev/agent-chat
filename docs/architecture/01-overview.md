# 01 — Overview

[← TOC](./README.md)

## Idea

```
"Make a 60s video about survival tricks, British voice"
        │
        ▼
  agent: write script → voiceover → images → assemble → result
```

The chat app **is an AI agent** (`web/src/app/api/chat/route.ts` =
LLM picks tool → code runs tool → loop). That loop drives a local FastAPI
connector (`video/`) which runs free, offline models and returns job ids
the chat polls live.

## What exists

```
web/                                   video/
├─ chat UI (Next 16/React 19)   ✅     ├─ api/  FastAPI :3333        ✅
├─ api/chat/route.ts  agent     ✅     │   ├─ endpoints + worker     ✅
├─ Postgres conversations       ✅     │   └─ durable job store      ✅
└─ .env: WEB_API_KEY=:3333      ✅     ├─ generate_voiceover.py (Kokoro)  ✅
                                       ├─ generate_transcript.py           ✅
                                       ├─ generate_images.py (FLUX)       ✅
                                       ├─ generate_imagen.py (Google)     ✅
                                       └─ build_project (OpenCut)         ✅
```

## How the layers talk

```
agent tools ──▶ POST :3333 /script · /voiceover · /transcript · /images · /build
                    │
                    ▼            async: return {job_id}
               worker threads ──▶ video/*.py ──▶ Kokoro / FLUX / Imagen / OpenCut
                    │
                    ▼            durable: SQLite or Neon Postgres (DATABASE_URL)
               GET /jobs/{id} ◀── UI polls live progress
```

The connector needs **no AI API key** — voice and images come from local
free models (Kokoro-82M, FLUX.1-schnell) or Google Imagen. Only the web
agent loop needs an OpenAI-compatible key (`OPENAI_API_KEY`).

## Model = function (nothing to train)

```
script text  ──▶ generate_voiceover.py ──▶ .wav   (Kokoro-82M, local, free)
text prompt  ──▶ generate_images.py    ──▶ .png   (FLUX.1-schnell, local, free)
text prompt  ──▶ generate_imagen.py    ──▶ .png   (Google Imagen, cloud)
```

→ Details: [02 — Tech stack](./02-tech-stack.md)

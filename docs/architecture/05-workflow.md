# 05 — Workflow

[← TOC](./README.md)

## End-to-end trace

```mermaid
sequenceDiagram
    participant U as User
    participant R as route.ts (agent)
    participant L as OpenAI
    participant F as FastAPI
    participant W as worker+models

    U->>R: "60s survival video, British voice"
    R->>L: msg + tools
    L-->>R: write_script(...)
    R->>R: run → script text
    R->>L: script result
    L-->>R: reply "script ready, record?"
    R-->>U: shows script

    U->>R: "yes go"
    R->>L: msg + tools
    L-->>R: generate_voiceover(script, bm_george)
    R->>F: POST /voiceover
    F->>W: start job v1 (async)
    F-->>R: {job_id:v1, running}
    R-->>U: "🎙️ recording…"

    loop until done (no LLM)
      U->>F: GET /jobs/v1
      F-->>U: progress
    end

    Note over R,W: same pattern → transcript → images → build
    W-->>U: ✅ done + project
```

> Polling (`GET /jobs/{id}`) hits the connector **directly** from the browser
> (doc 10 — localhost CORS), never the LLM. The transcript stage is usually
> started alongside voiceover (same script, same voice).

## Stage timeline

```
chat   │■ask        ■go                      ■watch          ■done
agent  │ █loop1  █loop2(start)   █loop3(start)   █loop4
OpenAI │ █       █                █                █          brain
FastAPI│         ██ /voiceover    ██ /images       ██ /build  async
models │         ███ Kokoro       ████████ FLUX     █ assemble slow
poll   │         ···· GET /jobs/{id} ····                     free
```

## Per-stage pattern (repeats)

```
LLM picks tool ─▶ FastAPI starts job ─▶ returns id ─▶ chat polls ─▶ done ─▶ next stage
```

→ Slow stages handled in [06 — Long jobs](./06-long-running-jobs.md).

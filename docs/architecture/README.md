# AI Video Agent — Technical Architecture

Chat request → AI agent → finished video. The agent is a thin tool-calling loop;
everything else is an async backend wrapping the existing `video/` scripts.

## TOC

| #   | Doc                                     | Covers                    |
| --- | --------------------------------------- | ------------------------- |
| 01  | [Overview](./01-overview.md)            | Idea + what exists        |
| 02  | [Tech stack](./02-tech-stack.md)        | Layers, add vs. avoid     |
| 03  | [Components](./03-components.md)        | UI · agent · API · models |
| 04  | [Agent loop](./04-agent-loop.md)        | Tool-calling cycle        |
| 05  | [Workflow](./05-workflow.md)            | End-to-end trace          |
| 06  | [Long jobs](./06-long-running-jobs.md)  | Durable jobs (6h case)    |
| 07  | [API & tools](./07-api-and-tools.md)    | Endpoints + tool schemas  |
| 08  | [Phases](./08-implementation-phases.md) | Build order               |
| 09  | [Performance](./09-performance.md)      | Faster image gen (h → min) |
| 10  | [UI](./10-ui.md)                        | Chat front-end · job cards |

## System

```mermaid
flowchart TD
    U[User · chat] --> R[web/ Next.js :3334<br/>api/chat/route.ts]
    R <-->|tool calls| L[OpenAI<br/>picks next tool]
    R -->|fetch WEB_API_URL| F[video/ FastAPI :3333]
    F --> Q[(queue)] --> W[worker]
    W --> P[video/*.py scripts]
    P --> K[Kokoro-82M · voice]
    P --> X[FLUX.1-schnell · images]
    P --> B[build_opencut_project]
    W --> J[(job store<br/>status·progress·result)]
    F -->|GET /jobs/id| J
```

## Responsibility split

```
LLM (OpenAI)      → decides next step          [done — route.ts]
Local models      → voice + images, free       [done — video/]
YOU build         → FastAPI + tools + jobs      [100% backend]
```

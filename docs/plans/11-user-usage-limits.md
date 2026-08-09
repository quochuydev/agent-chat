# Per-User Usage Limits — Implementation Plan

Status: plan (not yet implemented)

Limit how many videos a signed-in user can create (default: 2). Enforced in the **web**
layer only — it is the single place that knows the user (Clerk `userId`). The connector
(`video/`) has no user concept and jobs are not user-scoped, so it is out of scope.

## What counts as a video

The final assembly step, `build_video` (the agent's last tool in the pipeline). Counting
its **creation** is atomic and maps to "a video created". See *Decisions* for alternatives.

## Changes

### 1. Config — `web/src/lib/config.ts`

Per `web/CLAUDE.md`, all `process.env.*` reads live in `config.ts`.

```ts
export const VIDEO_VIDEO_LIMIT = posInt(process.env.VIDEO_VIDEO_LIMIT, 2);
```

Add `VIDEO_VIDEO_LIMIT=2` to `web/.env` and `web/.env.example`.

### 2. Schema — `web/src/lib/schema.sql`

```sql
CREATE TABLE IF NOT EXISTS user_usage (
  user_id        TEXT PRIMARY KEY,   -- Clerk user id
  videos_created INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Apply by running the same style of `sql` migration as the existing columns
(`scripts/init-db.mjs`).

### 3. Usage lib — `web/src/lib/usage.ts`

Atomic check-and-increment: one statement either reserves a slot and returns the new
count, or returns zero rows when the limit is already reached (no race window).

```ts
import { sql } from "@/lib/db";
import { VIDEO_VIDEO_LIMIT } from "@/lib/config";

export async function tryCreateVideo(
  userId: string,
): Promise<{ ok: true; remaining: number } | { ok: false; limit: number }> {
  const rows = await sql`
    INSERT INTO user_usage (user_id, videos_created)
    VALUES (${userId}, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET videos_created = user_usage.videos_created + 1, updated_at = now()
      WHERE user_usage.videos_created < ${VIDEO_VIDEO_LIMIT}
    RETURNING videos_created
  `;
  if (rows.length === 0) return { ok: false, limit: VIDEO_VIDEO_LIMIT };
  return { ok: true, remaining: VIDEO_VIDEO_LIMIT - Number(rows[0].videos_created) };
}
```

Optional read-only helper for UI (remaining count, no mutation):

```ts
export async function getVideoUsage(userId: string): Promise<number> {
  const rows = await sql`
    SELECT videos_created FROM user_usage WHERE user_id = ${userId}
  `;
  return rows.length ? Number(rows[0].videos_created) : 0;
}
```

### 4. Enforce in the tool layer — `web/src/lib/chat/run-tool.ts`

In the `build_video` branch, before calling the connector:

```ts
const usage = await tryCreateVideo(userId);
if (!usage.ok) {
  return {
    result: {
      error: `Plan limit reached: you've used your ${usage.limit} videos. Upgrade or contact support.`,
    },
  };
}
```

The error propagates through the agent tool-calling loop and renders as an assistant
message — no chat UI changes required.

`runTool` currently has no `userId` parameter: add one and pass it through from the route.

### 5. Get the user — `web/src/app/api/chat/route.ts`

Today the chat route has **no `auth()` call** (it relies on middleware protection only).
Add an explicit check:

```ts
import { auth } from "@clerk/nextjs/server";

const { userId } = await auth();
if (!userId) {
  return NextResponse.json({ message: "Sign in to chat", jobs: [] }, { status: 401 });
}
```

Pass `userId` into `runTool(...)`.

## Optional UI (remaining-usage pill)

Add `GET /api/usage`:

```ts
// src/app/api/usage/route.ts
import { auth } from "@clerk/nextjs/server";
import { getVideoUsage } from "@/lib/usage";
import { VIDEO_VIDEO_LIMIT } from "@/lib/config";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const used = await getVideoUsage(userId);
  return NextResponse.json({ used, limit: VIDEO_VIDEO_LIMIT });
}
```

Surface in the toolbar (reuse the `connector-status.tsx` pill pattern): "N videos left".

## Decisions to confirm

| Question | Default choice | Alternative |
| -------- | -------------- | ----------- |
| What counts as a video? | `build_video` job **creation** | Only successful build completions (poll `get_job` after finish) |
| Failed build consumes a slot? | Yes (simplest) | Decrement on `failed`/`canceled` status |
| Re-building the same script? | Consumes another slot | Allow one build per conversation (dedupe by conversation id) |
| Per-plan limits? | Single limit for all users (`VIDEO_VIDEO_LIMIT`) | Per-plan tiers: read limit from a `plans`/`subscriptions` lookup keyed by user |
| Connector-side enforcement? | No (web is the only client today) | Requires passing a user id/auth header through `/api/jobs` proxy |

## Files touched

- `web/src/lib/config.ts` — add `VIDEO_VIDEO_LIMIT`
- `web/src/lib/schema.sql` — add `user_usage` table
- `web/src/lib/usage.ts` — new (atomic reserve + read helpers)
- `web/src/lib/chat/run-tool.ts` — accept `userId`, enforce in `build_video`
- `web/src/app/api/chat/route.ts` — explicit `auth()`, pass `userId`
- `web/.env` + `web/.env.example` — `VIDEO_VIDEO_LIMIT=2`
- (optional) `web/src/app/api/usage/route.ts` + toolbar pill

## Effort

~30 minutes of code + one schema migration. No connector changes.

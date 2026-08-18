-- Conversations + messages + async jobs persistence (Neon Postgres). Run once against
-- DATABASE_URL (pnpm db:init).

CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,                       -- Clerk user id (owner)
  title       TEXT NOT NULL DEFAULT 'New chat',
  channel     TEXT NOT NULL DEFAULT 'money',       -- video niche/preset (lib/channels.ts)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
  ON conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role             TEXT NOT NULL,                  -- 'user' | 'assistant'
  content          TEXT NOT NULL DEFAULT '',
  jobs             JSONB,                          -- JobRef[] attached by the agent
  suggestions      JSONB,                          -- string[] follow-up chips from the model
  position         INTEGER NOT NULL,               -- order within the conversation
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON messages (conversation_id, position);

-- Migration for databases created before `suggestions` existed.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS suggestions JSONB;

-- Migration for databases created before conversations had a channel.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'money';

-- Async job store (write_script/generate_voiceover/generate_images/build_video), formerly
-- owned by the standalone Python connector — now written/read by web/src/lib/jobs/store.ts.
CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  tool        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued',
  stage       TEXT NOT NULL DEFAULT '',
  current     INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  params      JSONB NOT NULL DEFAULT '{}'::jsonb,
  result      JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_tool_idx ON jobs (tool);

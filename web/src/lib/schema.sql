-- Conversations + messages persistence (Neon Postgres). Run once against DATABASE_URL.
-- Shares the database with the Python connector's `jobs` table.

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

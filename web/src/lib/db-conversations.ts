import "server-only";

import { DEFAULT_CHANNEL_ID, getChannel } from "@/lib/channels";
import { sql } from "@/lib/db";
import type { Conversation, ConversationMeta, DisplayMessage, JobRef } from "@/lib/types";

// First assistant turn seeded into every new conversation (was a client constant).
export const GREETING_CONTENT =
  'Hi! Tell me what video to make — topic, length and a voice. e.g. "a 60s video about survival tricks, British documentary voice."';

type MessageRow = {
  role: string;
  content: string;
  jobs: JobRef[] | null;
  suggestions: string[] | null;
};

function rowToMessage(row: MessageRow): DisplayMessage {
  const msg: DisplayMessage = {
    role: row.role as DisplayMessage["role"],
    content: row.content,
  };
  if (row.jobs && row.jobs.length > 0) msg.jobs = row.jobs;
  if (row.suggestions && row.suggestions.length > 0) msg.suggestions = row.suggestions;
  return msg;
}

/** Conversations owned by `userId`, newest activity first (no messages). */
export async function listConversations(userId: string): Promise<ConversationMeta[]> {
  const rows = await sql`
    SELECT id, title, channel, extract(epoch FROM updated_at) * 1000 AS updated_at
    FROM conversations
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
  `;
  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    channel: (r.channel as string) ?? DEFAULT_CHANNEL_ID,
    updatedAt: Number(r.updated_at),
  }));
}

/** Create a conversation seeded with the greeting; returns the full conversation. */
export async function createConversation(
  userId: string,
  channel: string = DEFAULT_CHANNEL_ID,
): Promise<Conversation> {
  const channelId = getChannel(channel).id; // normalize to a known channel
  const [conv] = await sql`
    INSERT INTO conversations (user_id, channel)
    VALUES (${userId}, ${channelId})
    RETURNING id, title, channel, extract(epoch FROM updated_at) * 1000 AS updated_at
  `;
  await sql`
    INSERT INTO messages (conversation_id, role, content, position)
    VALUES (${conv.id}, 'assistant', ${GREETING_CONTENT}, 0)
  `;
  return {
    id: conv.id as string,
    title: conv.title as string,
    channel: conv.channel as string,
    updatedAt: Number(conv.updated_at),
    messages: [{ role: "assistant", content: GREETING_CONTENT }],
  };
}

/** Full conversation with messages — only if owned by `userId`, else null. */
export async function getConversation(
  userId: string,
  id: string,
): Promise<Conversation | null> {
  const [conv] = await sql`
    SELECT id, title, channel, extract(epoch FROM updated_at) * 1000 AS updated_at
    FROM conversations
    WHERE id = ${id} AND user_id = ${userId}
  `;
  if (!conv) return null;
  const rows = await sql`
    SELECT role, content, jobs, suggestions
    FROM messages
    WHERE conversation_id = ${id}
    ORDER BY position
  `;
  return {
    id: conv.id as string,
    title: conv.title as string,
    channel: (conv.channel as string) ?? DEFAULT_CHANNEL_ID,
    updatedAt: Number(conv.updated_at),
    messages: (rows as MessageRow[]).map(rowToMessage),
  };
}

/**
 * Replace a conversation's messages and update its title, atomically. No-op (returns
 * false) if the conversation isn't owned by `userId`.
 */
export async function saveConversation(
  userId: string,
  id: string,
  title: string,
  messages: DisplayMessage[],
  channel: string = DEFAULT_CHANNEL_ID,
): Promise<boolean> {
  const [owned] = await sql`
    SELECT 1 FROM conversations WHERE id = ${id} AND user_id = ${userId}
  `;
  if (!owned) return false;

  const channelId = getChannel(channel).id;
  const statements = [
    sql`UPDATE conversations SET title = ${title}, channel = ${channelId}, updated_at = now() WHERE id = ${id}`,
    sql`DELETE FROM messages WHERE conversation_id = ${id}`,
    ...messages.map(
      (m, i) => sql`
        INSERT INTO messages (conversation_id, role, content, jobs, suggestions, position)
        VALUES (
          ${id}, ${m.role}, ${m.content},
          ${m.jobs ? JSON.stringify(m.jobs) : null},
          ${m.suggestions ? JSON.stringify(m.suggestions) : null},
          ${i}
        )
      `,
    ),
  ];
  await sql.transaction(statements);
  return true;
}

/** Delete a conversation (and its messages via cascade). Returns false if not owned. */
export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM conversations WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `;
  return rows.length > 0;
}

import type { Conversation, ConversationMeta, DisplayMessage } from "@/lib/types";

// Client-side access to the conversation API (Postgres-backed, Clerk-scoped).
// Storage moved off localStorage — these are thin fetch wrappers over /api/conversations.

export async function listConversations(): Promise<ConversationMeta[]> {
  const res = await fetch("/api/conversations", { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as { conversations: ConversationMeta[] };
  return data.conversations ?? [];
}

export async function createConversation(channel?: string): Promise<Conversation> {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) throw new Error("Failed to create conversation");
  const data = (await res.json()) as { conversation: Conversation };
  return data.conversation;
}

export async function fetchConversation(id: string): Promise<Conversation | null> {
  const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { conversation: Conversation };
  return data.conversation;
}

export async function saveConversation(
  id: string,
  title: string,
  messages: DisplayMessage[],
  channel?: string,
): Promise<void> {
  await fetch(`/api/conversations/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, messages, channel }),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: "DELETE" });
}

export function deriveTitle(messages: DisplayMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const text = firstUser.content.trim().replace(/\s+/g, " ");
  return text.length > 40 ? `${text.slice(0, 40)}…` : text || "New chat";
}

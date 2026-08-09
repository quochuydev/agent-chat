import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  deleteConversation,
  getConversation,
  saveConversation,
} from "@/lib/db-conversations";
import type { DisplayMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/conversations/[id] — full conversation with messages.
export async function GET(_req: Request, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const conversation = await getConversation(userId, id);
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ conversation });
}

// PUT /api/conversations/[id] — replace messages + title for this conversation.
export async function PUT(req: Request, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as {
    title?: string;
    messages?: DisplayMessage[];
    channel?: string;
  };
  const messages = body.messages ?? [];
  const title = body.title ?? "New chat";
  const ok = await saveConversation(userId, id, title, messages, body.channel);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/conversations/[id]
export async function DELETE(_req: Request, { params }: Ctx) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await deleteConversation(userId, id);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

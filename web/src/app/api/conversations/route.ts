import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { createConversation, listConversations } from "@/lib/db-conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/conversations — the signed-in user's conversations (sidebar list, no messages).
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const conversations = await listConversations(userId);
  return NextResponse.json({ conversations });
}

// POST /api/conversations — create a new conversation seeded with the greeting.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { channel?: string };
  const conversation = await createConversation(userId, body.channel);
  return NextResponse.json({ conversation }, { status: 201 });
}

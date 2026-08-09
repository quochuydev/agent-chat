import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/chat/config";

// Job-status proxy (doc 03/10 [4]): forwards the chat's poll to FastAPI :3333.
// Keeps the connector URL server-side and gives the browser a same-origin endpoint.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await fetch(`${API_BASE}/jobs/${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "connector unreachable";
    return NextResponse.json(
      { error: `${message} (is the video API on ${API_BASE}?)` },
      { status: 502 },
    );
  }
}

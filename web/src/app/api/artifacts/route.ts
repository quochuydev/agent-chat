import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/chat/config";

// Proxy for the Files drawer: forwards GET /api/artifacts → connector's /artifacts,
// which lists every job and its run-dir files. Per-file download/preview goes through
// the existing catch-all proxy (/api/jobs/{id}/file/{path}).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE.replace(/\/$/, "")}/artifacts`, { cache: "no-store" });
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "connector unreachable";
    return NextResponse.json(
      { error: `${message} (is the video API on ${API_BASE}?)` },
      { status: 502 },
    );
  }
}

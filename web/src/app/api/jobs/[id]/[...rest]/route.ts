import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/chat/config";

// Catch-all proxy for a job's sub-resources (doc 03/10): forwards
// /api/jobs/{id}/{script|transcript|audio|images|images/{name}|cancel|regenerate}
// to the connector, streaming the body through (handles JSON, text, wav, png).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(req: Request, id: string, rest: string[]): Promise<Response> {
  const path = rest.map(encodeURIComponent).join("/");
  const url = `${API_BASE.replace(/\/$/, "")}/jobs/${encodeURIComponent(id)}/${path}`;
  try {
    const init: RequestInit = { method: req.method, cache: "no-store" };
    if (req.method !== "GET" && req.method !== "HEAD") {
      const body = await req.text();
      if (body) {
        init.body = body;
        init.headers = { "Content-Type": req.headers.get("content-type") ?? "application/json" };
      }
    }
    const res = await fetch(url, init);
    // Stream the upstream body back verbatim, preserving content-type (binary-safe).
    return new Response(res.body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/octet-stream" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "connector unreachable";
    return NextResponse.json(
      { error: `${message} (is the video API on ${API_BASE}?)` },
      { status: 502 },
    );
  }
}

type Ctx = { params: Promise<{ id: string; rest: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id, rest } = await params;
  return proxy(req, id, rest);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id, rest } = await params;
  return proxy(req, id, rest);
}

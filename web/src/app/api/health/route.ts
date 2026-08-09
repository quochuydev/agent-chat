import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/chat/config";

// Health probe for the connector-status pill in the toolbar. Forwards to the connector's
// /health so the same-origin (local-dev) path can report whether the Python API is up.
// Browsers pointed at a remote connector via ?apiUrl= hit that base's /health directly.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${API_BASE.replace(/\/$/, "")}/health`, { cache: "no-store" });
    return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

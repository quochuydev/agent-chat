import { NextResponse } from "next/server";

// Liveness probe for this service (useful for uptime checks / container healthchecks).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}

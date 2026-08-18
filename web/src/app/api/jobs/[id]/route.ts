import { NextResponse } from "next/server";

import * as store from "@/lib/jobs/store";

// Job status (was: proxy to the FastAPI connector). Client-side polling (use-job.ts)
// and the agent's get_job tool both read through here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await store.get(id);
  if (!job) return NextResponse.json({ detail: `job ${id} not found` }, { status: 404 });
  return NextResponse.json(job);
}

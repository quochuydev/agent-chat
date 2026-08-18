import { NextResponse } from "next/server";

import { listRunFiles } from "@/lib/jobs/files";
import * as store from "@/lib/jobs/store";

// Every job that produced files, with its run-dir contents (powers the Files drawer).
// Jobs are ordered newest-activity-first by their files' latest mtime; jobs with no run
// dir or no files are omitted. Was: proxy to the connector's /artifacts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await store.listJobs();
  const withFiles = jobs
    .map((j) => {
      const files = listRunFiles(j.id);
      if (files.length === 0) return null;
      const latest = Math.max(...files.map((f) => f.mtime));
      return { id: j.id, tool: j.tool, status: j.status, mtime: latest, files };
    })
    .filter((j): j is NonNullable<typeof j> => j !== null)
    .sort((a, b) => b.mtime - a.mtime);

  return NextResponse.json({ jobs: withFiles });
}

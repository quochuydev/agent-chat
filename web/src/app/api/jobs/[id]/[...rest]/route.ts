import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { deleteCaptions } from "@/lib/jobs/build-project";
import { cancellation } from "@/lib/jobs/cancellation";
import { listRunFiles, mimeType, resolveArtifact } from "@/lib/jobs/files";
import { runDir } from "@/lib/jobs/runs";
import { runRegenerate, runResume, type RegenerateRequest } from "@/lib/jobs/runners";
import * as store from "@/lib/jobs/store";
import { worker } from "@/lib/jobs/worker";
import { createZip } from "@/lib/jobs/zip";

// Dispatcher for a job's sub-resources — was a generic proxy to the FastAPI connector's
// /jobs/{id}/{...} routes; now serves them locally from the Postgres job store and the
// on-disk run dir (lib/jobs/runs.ts).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMG_CANON_RE = /^(\d{3})_(\d{2})-(\d{2})\.png$/;
const IMG_FILE_RE = /^\d{3}_\d{2}-\d{2}(\.v\d+)?\.png$/;

function notFound(detail: string) {
  return NextResponse.json({ detail }, { status: 404 });
}

function badRequest(detail: string) {
  return NextResponse.json({ detail }, { status: 400 });
}

function fileResponse(filePath: string, filename = path.basename(filePath)): Response {
  const body = new Uint8Array(readFileSync(filePath));
  return new Response(body, {
    headers: {
      "Content-Type": mimeType(filePath),
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}

type Ctx = { params: Promise<{ id: string; rest: string[] }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id, rest } = await params;
  const sub = rest.join("/");
  const job = await store.get(id);

  if (sub === "script") {
    const p = path.join(runDir(id), "script.txt");
    if (!existsSync(p)) return notFound("no script for this job");
    return NextResponse.json({ script: readFileSync(p, "utf8") });
  }

  if (sub === "transcript") {
    const p = resolveArtifact(job, id, "transcript_file", ".transcript.txt");
    if (!p) return notFound("no transcript for this job");
    return NextResponse.json({ transcript: readFileSync(p, "utf8") });
  }

  if (sub === "audio") {
    const p = resolveArtifact(job, id, "audio_file", ".wav");
    if (!p) return notFound("no audio for this job");
    return fileResponse(p);
  }

  if (sub === "images") {
    const base = runDir(id);
    const imagesDir = path.join(base, "images");
    const promptsPath = path.join(base, "prompts.txt");
    let prompts: string[] = [];
    if (existsSync(promptsPath)) {
      prompts = readFileSync(promptsPath, "utf8")
        .split("\n")
        .map((ln) => ln.trim())
        .filter(Boolean)
        .map((ln) => ln.replace(/^\[\d{2}:\d{2}\]\s*/, ""));
    }
    const items: { index: number; name: string; ts: string; prompt: string | null; versions: string[] }[] = [];
    if (existsSync(imagesDir)) {
      const names = readdirSync(imagesDir).filter((n) => IMG_CANON_RE.test(n)).sort();
      for (const name of names) {
        const m = IMG_CANON_RE.exec(name)!;
        const idx = Number(m[1]);
        const ts = `${m[2]}-${m[3]}`;
        const versionRe = new RegExp(`^${m[1]}_${ts}\\.v\\d+\\.png$`);
        const versions = readdirSync(imagesDir).filter((v) => versionRe.test(v)).sort();
        items.push({ index: idx, name, ts, prompt: prompts[idx - 1] ?? null, versions });
      }
    }
    const total = prompts.length || items.length;
    return NextResponse.json({ total, ready: items.length, images: items });
  }

  if (rest[0] === "images" && rest.length === 2) {
    const name = rest[1];
    if (!IMG_FILE_RE.test(name)) return badRequest("bad image name");
    const p = path.join(runDir(id), "images", name);
    if (!existsSync(p)) return notFound("image not found");
    return fileResponse(p);
  }

  if (sub === "project") {
    const p = resolveArtifact(job, id, "project_file", ".opencut.json");
    if (!p) return notFound("no project for this job");
    return fileResponse(p);
  }

  if (sub === "srt") {
    const p = resolveArtifact(job, id, "srt_file", ".srt");
    if (!p) return notFound("no captions for this job");
    return fileResponse(p);
  }

  if (sub === "archive") {
    const files = listRunFiles(id);
    if (files.length === 0) return notFound("no files for this job");
    const dir = runDir(id);
    const zip = createZip(files.map((f) => ({ name: f.name, data: readFileSync(path.join(dir, f.name)) })));
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${id}.zip"`,
      },
    });
  }

  if (rest[0] === "file" && rest.length > 1) {
    const rel = rest.slice(1).join("/");
    const base = path.resolve(runDir(id));
    const target = path.resolve(base, rel);
    if (base !== target && !target.startsWith(base + path.sep)) return badRequest("bad path");
    if (!existsSync(target) || !statSync(target).isFile()) return notFound("file not found");
    return new Response(new Uint8Array(readFileSync(target)), {
      headers: {
        "Content-Type": mimeType(target),
        "Content-Disposition": `attachment; filename="${path.basename(target)}"`,
      },
    });
  }

  return notFound(`unknown resource /jobs/${id}/${sub}`);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id, rest } = await params;
  const sub = rest.join("/");

  if (sub === "cancel") {
    const job = await store.get(id);
    if (!job) return notFound(`job ${id} not found`);
    if (job.status === "done" || job.status === "failed" || job.status === "canceled") {
      return NextResponse.json(job);
    }
    cancellation.cancel(id); // aborts the in-flight fetch, if any
    await store.setCanceled(id);
    return NextResponse.json(await store.get(id));
  }

  if (sub === "resume") {
    const job = await store.get(id);
    if (!job) return notFound(`job ${id} not found`);
    if (job.tool !== "generate_images") return badRequest("job is not an images job");
    cancellation.clear(id); // drop any prior cancel flag so it can run again
    worker.submit(id, runResume, null); // re-run under the SAME id
    await store.setStatus(id, "running");
    return NextResponse.json(await store.get(id));
  }

  if (sub === "regenerate") {
    const parent = await store.get(id);
    if (!parent) return notFound(`job ${id} not found`);
    if (parent.tool !== "generate_images") return badRequest("job is not an images job");
    const body = (await req.json()) as RegenerateRequest;
    const newId = await store.create("regenerate_image", { parent: id, index: body.index });
    worker.submit(newId, (jobId: string, r: RegenerateRequest) => runRegenerate(jobId, r, id), body);
    return NextResponse.json({ job_id: newId });
  }

  if (sub === "subtitles/delete") {
    const job = await store.get(id);
    if (!job) return notFound(`job ${id} not found`);
    if (job.tool !== "build_video" || !job.result) {
      return badRequest("subtitles can only be edited on a finished build job");
    }
    const result = { ...job.result };
    const projectFile = result.project_file as string | undefined;
    if (!projectFile || !existsSync(projectFile)) return notFound("this build has no project file on disk");
    const body = (await req.json()) as { indices: number[] };
    try {
      const summary = deleteCaptions(projectFile, result.srt_file as string | undefined, body.indices);
      result.captions = summary.remaining;
      await store.finish(id, result);
      return NextResponse.json(summary);
    } catch (err) {
      return badRequest(err instanceof Error ? err.message : "delete failed");
    }
  }

  return notFound(`unknown resource /jobs/${id}/${sub}`);
}

import "server-only";

import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { runDir } from "@/lib/jobs/runs";
import type { JobView } from "@/lib/jobs/store";

// Artifact lookup/serving helpers shared by the jobs API routes — port of the file
// helpers scattered through video/api/main.py (_resolve, _file_kind, list_images, the
// /artifacts listing).

const MIME_BY_EXT: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain",
  ".srt": "application/x-subrip",
  ".json": "application/json",
  ".zip": "application/zip",
};

export function mimeType(name: string): string {
  return MIME_BY_EXT[path.extname(name).toLowerCase()] ?? "application/octet-stream";
}

type FileKind = "audio" | "image" | "text" | "json" | "file";

const KIND_BY_EXT: Record<string, FileKind> = {
  ".wav": "audio",
  ".mp3": "audio",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".txt": "text",
  ".srt": "text",
  ".json": "json",
};

export function fileKind(name: string): FileKind {
  return KIND_BY_EXT[path.extname(name).toLowerCase()] ?? "file";
}

/** Find an artifact file: prefer the job's recorded result path, else the newest match
 * in the run dir ending with `suffix` (e.g. ".transcript.txt"). */
export function resolveArtifact(job: JobView | null, jobId: string, resultKey: string, suffix: string): string | null {
  const recorded = job?.result?.[resultKey] as string | undefined;
  if (recorded && existsSync(recorded)) return recorded;
  const dir = runDir(jobId);
  if (!existsSync(dir)) return null;
  const matches = readdirSync(dir)
    .filter((n) => n.endsWith(suffix))
    .sort();
  return matches.length > 0 ? path.join(dir, matches[0]) : null;
}

export type ArtifactFile = { name: string; size: number; kind: FileKind; mtime: number };

/** Every file under a job's run dir (recursively), relative-posix-named, for the Files
 * drawer and the .zip archive. */
export function listRunFiles(jobId: string): ArtifactFile[] {
  const dir = runDir(jobId);
  if (!existsSync(dir)) return [];
  const files: ArtifactFile[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const st = statSync(full);
        files.push({
          name: path.relative(dir, full).split(path.sep).join("/"),
          size: st.size,
          kind: fileKind(entry.name),
          mtime: st.mtimeMs / 1000,
        });
      }
    }
  };
  walk(dir);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

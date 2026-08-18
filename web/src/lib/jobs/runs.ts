import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";

import { RUNS_DIR } from "@/lib/config";

// Run-dir helpers, port of the run_dir/_run_dir helpers in video/api/tasks.py. Every
// job gets a folder under RUNS_DIR named by its job id, holding whatever it produced
// (script.txt, voiceover.wav, images/NNN_MM-SS.png, project.opencut.json, ...).

export function runDir(jobId: string): string {
  return path.join(RUNS_DIR, jobId);
}

export function ensureRunDir(jobId: string): string {
  const dir = runDir(jobId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

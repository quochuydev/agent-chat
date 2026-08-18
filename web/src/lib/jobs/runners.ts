import "server-only";

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { RUNS_DIR } from "@/lib/config";
import { buildProject, type BuildSummary } from "@/lib/jobs/build-project";
import { cancellation, Cancelled } from "@/lib/jobs/cancellation";
import { generateImage } from "@/lib/jobs/imagen";
import { ensureRunDir, runDir } from "@/lib/jobs/runs";
import * as store from "@/lib/jobs/store";
import { concatWav, readWav, wavDurationSeconds } from "@/lib/jobs/wav";
import { synthesize, type Voice } from "@/lib/jobs/tts";

// Stage runners — port of video/api/tasks.py, adapted to call cloud APIs directly
// in-process instead of shelling out to a local-model script and parsing its stdout.

export type VoiceoverRequest = { script: string; voice: Voice; speed?: number };
export type TranscriptRequest = { script: string; voice: Voice; speed?: number };
export type ImagesRequest = { prompts: string[]; width?: number; height?: number };
export type RegenerateRequest = { index: number };
export type BuildRequest = {
  name?: string;
  audio_file?: string;
  transcript_file?: string;
  images_dir?: string;
  include_captions?: boolean;
};

const IMG_CANON_RE = /^(\d{3})_(\d{2})-(\d{2})\.png$/;
const PROMPT_LINE_RE = /^\[(\d{2}):(\d{2})\]\s*(.*)$/;
const VOICE_FROM_AUDIO_RE = /^script_([a-z]+)\./;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function tsLabel(totalSeconds: number): { mm: string; ss: string } {
  return { mm: pad2(Math.floor(totalSeconds / 60)), ss: pad2(Math.floor(totalSeconds % 60)) };
}

type PromptEntry = { ts: string; text: string };

// generate_imagen.py's load_prompts, ported: '[MM:SS] prompt' lines, others dropped.
function parsePromptsFile(raw: string): PromptEntry[] {
  const entries: PromptEntry[] = [];
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = PROMPT_LINE_RE.exec(line);
    if (m) entries.push({ ts: `${m[1]}-${m[2]}`, text: m[3] });
  }
  return entries;
}

function presentIndices(imagesDir: string): Set<number> {
  if (!existsSync(imagesDir)) return new Set();
  const set = new Set<number>();
  for (const n of readdirSync(imagesDir)) {
    const m = IMG_CANON_RE.exec(n);
    if (m) set.add(Number(m[1]));
  }
  return set;
}

function countImages(imagesDir: string): number {
  return presentIndices(imagesDir).size;
}

// The job that produced `filePath` = the run-dir folder name it lives under.
function sourceJobId(filePath?: string | null): string | null {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  const runsResolved = path.resolve(RUNS_DIR);
  const rel = path.relative(runsResolved, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep)[0] || null;
}

// Voiceover/transcript audio is named script_<voice>.*; recover the voice id.
function voiceFromAudio(filePath?: string | null): string | null {
  if (!filePath) return null;
  const m = VOICE_FROM_AUDIO_RE.exec(path.basename(filePath));
  return m ? m[1] : null;
}

// Narration into short caption lines: sentences, further split on commas if long —
// port of generate_transcript.py's split_lines.
function splitLines(text: string, maxlen: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const sentences = normalized.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [];
  const lines: string[] = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length <= maxlen) {
      lines.push(s);
      continue;
    }
    const parts = s.split(/(?<=[,;:])\s+/);
    let buf = "";
    for (const p of parts) {
      if (!buf) buf = p;
      else if (buf.length + 1 + p.length <= maxlen) buf += ` ${p}`;
      else {
        lines.push(buf.trim());
        buf = p;
      }
    }
    if (buf.trim()) lines.push(buf.trim());
  }
  return lines;
}

function checkCancelled(jobId: string): void {
  if (cancellation.isCancelled(jobId)) throw new Cancelled();
}

// --- runners ------------------------------------------------------------------------
export async function runVoiceover(jobId: string, req: VoiceoverRequest): Promise<Record<string, unknown>> {
  const dir = ensureRunDir(jobId);
  writeFileSync(path.join(dir, "script.txt"), `${req.script.trim()}\n`);
  const out = path.join(dir, "voiceover.wav");
  await store.setProgress(jobId, "voiceover", 0, 0);

  const controller = cancellation.register(jobId);
  try {
    const wav = await synthesize(req.script.trim(), req.voice, req.speed ?? 1.0, controller.signal);
    writeFileSync(out, wav);
  } finally {
    cancellation.unregister(jobId);
  }
  return { audio_file: out, voice: req.voice, kind: "voiceover" };
}

export async function runTranscript(jobId: string, req: TranscriptRequest): Promise<Record<string, unknown>> {
  const dir = ensureRunDir(jobId);
  writeFileSync(path.join(dir, "script.txt"), `${req.script.trim()}\n`);
  await store.setProgress(jobId, "transcript", 0, 0);

  const lines = splitLines(req.script, 80);
  if (lines.length === 0) throw new Error("No lines produced from script.");

  const controller = cancellation.register(jobId);
  const transcriptLines: string[] = [];
  const clips: Buffer[] = [];
  let cursor = 0;
  try {
    for (let i = 0; i < lines.length; i++) {
      checkCancelled(jobId);
      const wav = await synthesize(lines[i], req.voice, req.speed ?? 1.0, controller.signal);
      clips.push(wav);
      const { mm, ss } = tsLabel(cursor);
      transcriptLines.push(`[${mm}:${ss}] ${lines[i]}`);
      cursor += wavDurationSeconds(readWav(wav));
      await store.setProgress(jobId, "transcript", i + 1, lines.length);
    }
  } finally {
    cancellation.unregister(jobId);
  }

  const stem = `script_${req.voice}`;
  const txtOut = path.join(dir, `${stem}.transcript.txt`);
  const wavOut = path.join(dir, `${stem}.aligned.wav`);
  writeFileSync(txtOut, `${transcriptLines.join("\n")}\n`);
  writeFileSync(wavOut, concatWav(clips));

  return { transcript_file: txtOut, audio_file: wavOut, kind: "transcript" };
}

export async function runImages(jobId: string, req: ImagesRequest): Promise<Record<string, unknown>> {
  const dir = ensureRunDir(jobId);
  const imagesDir = path.join(dir, "images");
  mkdirSync(imagesDir, { recursive: true });

  const spacing = 4;
  const width = req.width ?? 1024;
  const height = req.height ?? 576;
  const promptLines = req.prompts.map((p, i) => {
    const { mm, ss } = tsLabel(i * spacing);
    return `[${mm}:${ss}] ${p.trim()}`;
  });
  writeFileSync(path.join(dir, "prompts.txt"), `${promptLines.join("\n")}\n`);

  const total = req.prompts.length;
  await store.setProgress(jobId, "images", 0, total);

  const controller = cancellation.register(jobId);
  try {
    for (let i = 0; i < total; i++) {
      checkCancelled(jobId);
      const { mm, ss } = tsLabel(i * spacing);
      const image = await generateImage(req.prompts[i].trim(), width, height, controller.signal);
      const outPath = path.join(imagesDir, `${pad3(i + 1)}_${mm}-${ss}.png`);
      writeFileSync(outPath, image);
      await store.setProgress(jobId, "images", i + 1, total);
    }
  } finally {
    cancellation.unregister(jobId);
  }

  return { images_dir: imagesDir, count: countImages(imagesDir), kind: "images" };
}

// Finish a partially-rendered images job: generate only the missing indices into the
// same images dir. Runs under the SAME job_id so its progress/Stop/gallery keep working.
export async function runResume(jobId: string, _req?: null): Promise<Record<string, unknown>> {
  void _req;
  const dir = runDir(jobId);
  const promptsPath = path.join(dir, "prompts.txt");
  const imagesDir = path.join(dir, "images");
  if (!existsSync(promptsPath)) throw new Error("nothing to resume: this job has no prompts on disk");
  mkdirSync(imagesDir, { recursive: true });

  const prompts = parsePromptsFile(readFileSync(promptsPath, "utf8"));
  const total = prompts.length;
  const present = presentIndices(imagesDir);
  const missing = Array.from({ length: total }, (_, i) => i + 1).filter((i) => !present.has(i));
  if (missing.length === 0) {
    return { images_dir: imagesDir, count: total, kind: "images" };
  }

  const params = (await store.getParams(jobId)) ?? {};
  const width = (params.width as number) ?? 1024;
  const height = (params.height as number) ?? 576;
  await store.setProgress(jobId, "images", total - missing.length, total);

  const controller = cancellation.register(jobId);
  try {
    for (const idx of missing) {
      checkCancelled(jobId);
      const entry = prompts[idx - 1];
      const image = await generateImage(entry.text, width, height, controller.signal);
      writeFileSync(path.join(imagesDir, `${pad3(idx)}_${entry.ts}.png`), image);
      await store.setProgress(jobId, "images", presentIndices(imagesDir).size, total);
    }
  } finally {
    cancellation.unregister(jobId);
  }

  return { images_dir: imagesDir, count: countImages(imagesDir), kind: "images" };
}

// Re-render one image of `parentId`'s images job. The current PNG is archived to
// <name>.vN.png (never deleted) and a new canonical NNN_MM-SS.png is written.
export async function runRegenerate(
  jobId: string,
  req: RegenerateRequest,
  parentId: string,
): Promise<Record<string, unknown>> {
  const parent = runDir(parentId);
  const promptsPath = path.join(parent, "prompts.txt");
  const imagesDir = path.join(parent, "images");
  if (!existsSync(promptsPath) || !existsSync(imagesDir)) {
    throw new Error(`images job ${parentId} has no prompts/images to regenerate`);
  }

  const prompts = parsePromptsFile(readFileSync(promptsPath, "utf8"));
  if (req.index < 1 || req.index > prompts.length) {
    throw new Error(`index ${req.index} out of range 1..${prompts.length}`);
  }
  const entry = prompts[req.index - 1];
  const name = `${pad3(req.index)}_${entry.ts}.png`;
  const current = path.join(imagesDir, name);

  const params = (await store.getParams(parentId)) ?? {};
  const width = (params.width as number) ?? 1024;
  const height = (params.height as number) ?? 576;
  const versionRe = new RegExp(`^${pad3(req.index)}_${entry.ts}\\.v(\\d+)\\.png$`);
  const existingVersions = readdirSync(imagesDir).filter((n) => versionRe.test(n)).length;

  await store.setProgress(jobId, "regenerate", 0, 1);
  const controller = cancellation.register(jobId);
  let fresh: Buffer;
  try {
    fresh = await generateImage(entry.text, width, height, controller.signal);
  } finally {
    cancellation.unregister(jobId);
  }
  await store.setProgress(jobId, "regenerate", 1, 1);

  // Only swap on success — a failed/cancelled regenerate never touches the existing image.
  if (existsSync(current)) {
    renameSync(current, path.join(imagesDir, `${pad3(req.index)}_${entry.ts}.v${existingVersions + 1}.png`));
  }
  writeFileSync(current, fresh);

  const versions = readdirSync(imagesDir).filter((n) => versionRe.test(n)).length;
  return { images_dir: imagesDir, regenerated: name, versions, kind: "regenerate" };
}

export async function runBuild(jobId: string, req: BuildRequest): Promise<Record<string, unknown>> {
  await store.setProgress(jobId, "build", 0, 1);
  if (!req.audio_file || !req.images_dir) {
    throw new Error(
      "build needs audio_file and images_dir (pass the paths from the voiceover/transcript and images jobs).",
    );
  }
  if (!existsSync(req.audio_file)) throw new Error(`audio_file not found: ${req.audio_file}`);
  if (!statSync(req.images_dir).isDirectory()) throw new Error(`images_dir not found: ${req.images_dir}`);

  const out = path.join(ensureRunDir(jobId), "project.opencut.json");
  const summary: BuildSummary = buildProject({
    audioFile: req.audio_file,
    imagesDir: req.images_dir,
    outPath: out,
    transcriptFile: req.transcript_file,
    name: req.name,
    includeCaptions: req.include_captions,
  });
  await store.setProgress(jobId, "build", 1, 1);

  return {
    ...summary,
    kind: "build",
    source_images_job: sourceJobId(req.images_dir),
    source_audio_job: sourceJobId(req.audio_file),
    voice: voiceFromAudio(req.audio_file),
  };
}

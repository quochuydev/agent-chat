import "server-only";

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readWav, wavDurationSeconds } from "@/lib/jobs/wav";

// Parameterized OpenCut project builder — direct port of video/api/build_project.py.
// Pure logic (JSON assembly, WAV/PNG header parsing, SRT read/write), no ML deps, so it
// ports unchanged: takes audio + transcript + images dir as arguments and assembles any
// job's artifacts into an OpenCut project file.

const TICKS_PER_SECOND = 120_000;
const CANVAS = { width: 1920, height: 1080 };
const NS = "6f0c1e00-0000-4000-8000-000000000001"; // fixed namespace → stable ids

const IMG_RE = /^(\d+)_(\d\d)-(\d\d)\.png$/;
const CAP_RE = /^\[(\d{1,2}):(\d{2})\]\s*(.+?)\s*$/;

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// RFC 4122 v5 (name-based, SHA-1) — matches Python's uuid.uuid5, so re-building the
// same job's project twice yields the same media/element ids.
function uuidv5(namespace: string, name: string): string {
  const hash = createHash("sha1")
    .update(Buffer.concat([uuidToBytes(namespace), Buffer.from(name, "utf8")]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
}

const stableId = (name: string) => uuidv5(NS, name);
const ticks = (seconds: number) => Math.round(seconds * TICKS_PER_SECOND);

function pngSize(filePath: string): { width: number; height: number } {
  const fd = readFileSync(filePath);
  const head = fd.subarray(0, 24);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

function wavDuration(filePath: string): number {
  return wavDurationSeconds(readWav(readFileSync(filePath)));
}

function srtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rem = ms % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rem, 3)}`;
}

export type BuildProjectArgs = {
  audioFile: string;
  imagesDir: string;
  outPath: string;
  transcriptFile?: string | null;
  name?: string;
  includeCaptions?: boolean;
};

export type BuildSummary = {
  project_file: string;
  srt_file: string;
  duration_s: number;
  images: number;
  captions: number;
};

export function buildProject({
  audioFile,
  imagesDir,
  outPath,
  transcriptFile,
  name = "Generated Video",
  includeCaptions = false,
}: BuildProjectArgs): BuildSummary {
  const audioDurS = wavDuration(audioFile);
  const audioDurTicks = ticks(audioDurS);
  const audioName = path.basename(audioFile);
  const audioMediaId = stableId(audioName);

  const imgs = readdirSync(imagesDir)
    .sort()
    .map((n) => {
      const m = IMG_RE.exec(n);
      if (!m) return null;
      return { name: n, startS: Number(m[2]) * 60 + Number(m[3]) };
    })
    .filter((x): x is { name: string; startS: number } => x !== null);
  if (imgs.length === 0) {
    throw new Error(`no timestamped PNGs (NNN_MM-SS.png) found in ${imagesDir}`);
  }

  const imageElements = [];
  const manifest: Record<string, unknown>[] = [
    {
      mediaId: audioMediaId,
      filename: audioName,
      type: "audio",
      size: statSync(audioFile).size,
      duration: Math.round(audioDurS * 1000) / 1000,
    },
  ];
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i];
    const startS = img.startS;
    const endS = i + 1 < imgs.length ? imgs[i + 1].startS : audioDurS;
    const startT = ticks(startS);
    const durT = ticks(endS) - startT;
    const mid = stableId(img.name);
    const imgPath = path.join(imagesDir, img.name);
    const { width, height } = pngSize(imgPath);
    imageElements.push({
      id: stableId(`el-${img.name}`),
      name: img.name,
      type: "image",
      mediaId: mid,
      startTime: startT,
      duration: durT,
      trimStart: 0,
      trimEnd: 0,
      transform: { scaleX: 1, scaleY: 1, position: { x: 0, y: 0 }, rotate: 0 },
      opacity: 1,
    });
    manifest.push({
      mediaId: mid,
      filename: img.name,
      type: "image",
      size: statSync(imgPath).size,
      width,
      height,
    });
  }

  const caps: { startS: number; text: string }[] = [];
  if (transcriptFile && existsSync(transcriptFile)) {
    for (const line of readFileSync(transcriptFile, "utf8").split("\n")) {
      const m = CAP_RE.exec(line);
      if (m) caps.push({ startS: Number(m[1]) * 60 + Number(m[2]), text: m[3] });
    }
  }

  const captionElements = [];
  if (includeCaptions) {
    for (let i = 0; i < caps.length; i++) {
      const cap = caps[i];
      const startS = cap.startS;
      const endS = i + 1 < caps.length ? caps[i + 1].startS : audioDurS;
      const startT = ticks(startS);
      const durT = Math.max(ticks(endS) - startT, 1);
      captionElements.push({
        id: stableId(`cap-${i}`),
        name: cap.text.slice(0, 40),
        type: "text",
        content: cap.text,
        fontSize: 6,
        fontFamily: "Arial",
        color: "#ffffff",
        background: {
          enabled: true,
          color: "rgba(0,0,0,0.6)",
          cornerRadius: 8,
          paddingX: 24,
          paddingY: 12,
          offsetX: 0,
          offsetY: 0,
        },
        textAlign: "center",
        fontWeight: "bold",
        fontStyle: "normal",
        textDecoration: "none",
        letterSpacing: 0,
        lineHeight: 1.2,
        startTime: startT,
        duration: durT,
        trimStart: 0,
        trimEnd: 0,
        transform: { scaleX: 1, scaleY: 1, position: { x: 0, y: 330 }, rotate: 0 },
        opacity: 1,
      });
    }
  }

  const audioElement = {
    id: stableId("el-audio"),
    name: audioName,
    type: "audio",
    sourceType: "upload",
    mediaId: audioMediaId,
    volume: 1,
    startTime: 0,
    duration: audioDurTicks,
    trimStart: 0,
    trimEnd: 0,
    sourceDuration: audioDurTicks,
  };

  const now = new Date().toISOString();
  const sceneId = stableId("scene-main");
  const projectId = stableId(`project-${name}`);
  const scene = {
    id: sceneId,
    name: "Main scene",
    isMain: true,
    tracks: {
      overlay:
        includeCaptions && captionElements.length > 0
          ? [{ id: stableId("track-captions"), name: "Captions", type: "text", elements: captionElements, hidden: false }]
          : [],
      main: {
        id: stableId("track-main"),
        name: "Main Track",
        type: "video",
        elements: imageElements,
        muted: false,
        hidden: false,
      },
      audio: [{ id: stableId("track-audio"), name: "Voiceover", type: "audio", elements: [audioElement], muted: false }],
    },
    bookmarks: [],
    createdAt: now,
    updatedAt: now,
  };
  const project = {
    schema_version: 1,
    exported_at: now,
    project: {
      metadata: { id: projectId, name, duration: audioDurTicks, createdAt: now, updatedAt: now },
      scenes: [scene],
      currentSceneId: sceneId,
      settings: {
        fps: { numerator: 30, denominator: 1 },
        canvasSize: CANVAS,
        canvasSizeMode: "preset",
        lastCustomCanvasSize: null,
        originalCanvasSize: null,
        background: { type: "color", color: "#000000" },
      },
      version: 24,
      timelineViewState: { zoomLevel: 1, scrollLeft: 0, playheadTime: 0 },
    },
    media: manifest,
  };

  mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  writeFileSync(outPath, JSON.stringify(project, null, 2));

  const ext = path.extname(outPath);
  let srtPath = outPath.slice(0, outPath.length - ext.length) + ".srt";
  if (srtPath.endsWith(".opencut.srt")) srtPath = srtPath.slice(0, -".opencut.srt".length) + ".srt";
  const srtLines: string[] = [];
  for (let i = 0; i < caps.length; i++) {
    const cap = caps[i];
    const startS = cap.startS;
    const endS = i + 1 < caps.length ? caps[i + 1].startS : audioDurS;
    srtLines.push(`${i + 1}\n${srtTime(startS)} --> ${srtTime(endS)}\n${cap.text}\n`);
  }
  writeFileSync(srtPath, srtLines.join("\n"));

  return {
    project_file: outPath,
    srt_file: srtPath,
    duration_s: Math.round(audioDurS * 100) / 100,
    images: imgs.length,
    captions: captionElements.length,
  };
}

function parseSrt(text: string): { start: string; end: string; text: string }[] {
  const entries: { start: string; end: string; text: string }[] = [];
  for (const block of text.trim().split(/\n\s*\n/)) {
    const lines = block.split("\n");
    if (lines.length >= 3 && lines[1].includes("-->")) {
      const [start, end] = lines[1].split("-->").map((s) => s.trim());
      entries.push({ start, end, text: lines.slice(2).join("\n").trim() });
    }
  }
  return entries;
}

export type DeleteCaptionsSummary = {
  deleted: number[];
  remaining: number;
  remaining_srt: number | null;
  project_file: string;
  srt_file: string | null;
};

/**
 * Remove 1-based caption entries from a built OpenCut project and its .srt. Edits the
 * deliverable in place: only the text overlay track is touched — images/audio and the
 * video's length are untouched. Originals are backed up to <file>.bak (one-level undo).
 */
export function deleteCaptions(
  projectPath: string,
  srtPath: string | null | undefined,
  indices: number[],
): DeleteCaptionsSummary {
  const project = JSON.parse(readFileSync(projectPath, "utf8"));

  type OverlayTrack = { type: string; elements: { startTime?: number }[] };
  let track: OverlayTrack | null = null;
  for (const scene of project?.project?.scenes ?? []) {
    for (const t of scene?.tracks?.overlay ?? []) {
      if (t.type === "text") {
        track = t;
        break;
      }
    }
    if (track) break;
  }
  if (!track || !track.elements || track.elements.length === 0) {
    throw new Error("this project has no captions to delete");
  }

  const elements = track.elements;
  const byTime = elements.map((_, i) => i).sort((a, b) => (elements[a].startTime ?? 0) - (elements[b].startTime ?? 0));
  const n = byTime.length;
  const drop = new Set(indices.filter((i) => i >= 1 && i <= n));
  if (drop.size === 0) throw new Error(`no valid caption numbers in 1..${n}`);

  const keepPositions = Array.from({ length: n }, (_, i) => i + 1)
    .filter((rank) => !drop.has(rank))
    .map((rank) => byTime[rank - 1])
    .sort((a, b) => a - b);
  track.elements = keepPositions.map((i) => elements[i]);

  copyFileSync(projectPath, `${projectPath}.bak`);
  writeFileSync(projectPath, JSON.stringify(project, null, 2));

  let remainingSrt: number | null = null;
  if (srtPath && existsSync(srtPath)) {
    const entries = parseSrt(readFileSync(srtPath, "utf8"));
    const kept = entries.filter((_, idx) => !drop.has(idx + 1));
    copyFileSync(srtPath, `${srtPath}.bak`);
    const lines = kept.map((e, i) => `${i + 1}\n${e.start} --> ${e.end}\n${e.text}\n`);
    writeFileSync(srtPath, lines.join("\n"));
    remainingSrt = kept.length;
  }

  return {
    deleted: Array.from(drop).sort((a, b) => a - b),
    remaining: keepPositions.length,
    remaining_srt: remainingSrt,
    project_file: projectPath,
    srt_file: srtPath ?? null,
  };
}

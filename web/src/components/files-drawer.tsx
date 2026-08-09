"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  File as FileIcon,
  FileAudio,
  FileImage,
  FileJson,
  FileText,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import { connectorUrl, useApiBase } from "@/lib/connector";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/types";

type FileKind = "audio" | "image" | "text" | "json" | "file";
type ArtifactFile = { name: string; size: number; kind: FileKind; mtime: number };
type ArtifactJob = {
  id: string;
  tool: string;
  status: JobStatus;
  mtime: number;
  files: ArtifactFile[];
};

const TOOL_LABEL: Record<string, string> = {
  generate_voiceover: "Voiceover",
  generate_transcript: "Transcript",
  generate_images: "Images",
  build_video: "Build",
  regenerate_image: "Regenerate",
};

const KIND_ICON: Record<FileKind, typeof FileIcon> = {
  audio: FileAudio,
  image: FileImage,
  text: FileText,
  json: FileJson,
  file: FileIcon,
};

const STATUS_DOT: Record<JobStatus, string> = {
  done: "bg-[#1d9b4e]",
  running: "bg-[#0084ff]",
  queued: "bg-[#0084ff]",
  failed: "bg-[#d93025]",
  canceled: "bg-[#90949c]",
};

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Connector mtimes are epoch seconds → compact local date/time, e.g. "Jun 23, 11:05".
function fmtDate(mtimeSeconds: number): string {
  return new Date(mtimeSeconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Each path segment is encoded so nested files (images/001_00-00.png) survive the route.
// `base` (from useApiBase) targets the user's connector directly when configured.
function fileUrl(base: string | null, jobId: string, name: string): string {
  const path = name.split("/").map(encodeURIComponent).join("/");
  return connectorUrl(`/jobs/${jobId}/file/${path}`, base);
}

export function FilesDrawer({
  open,
  onClose,
  initialQuery = "",
}: {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}) {
  const [jobs, setJobs] = useState<ArtifactJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const base = useApiBase();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(connectorUrl("/artifacts"), { cache: "no-store" });
      const data = (await res.json()) as { jobs?: ArtifactJob[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Request failed (${res.status})`);
      setJobs(data.jobs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      load();
    }
  }, [open, initialQuery]);

  if (!open) return null;

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Filter by job (tool label / id) or file name. A job whose label/id matches keeps all
  // its files; otherwise only the files whose names match are shown.
  const q = query.trim().toLowerCase();
  const filtered =
    jobs == null
      ? null
      : q === ""
        ? jobs
        : jobs.flatMap((job) => {
            const label = (TOOL_LABEL[job.tool] ?? job.tool).toLowerCase();
            const jobMatch = label.includes(q) || job.id.toLowerCase().includes(q);
            const files = jobMatch ? job.files : job.files.filter((f) => f.name.toLowerCase().includes(q));
            return jobMatch || files.length > 0 ? [{ ...job, files }] : [];
          });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close files"
        onClick={onClose}
        className="flex-1 cursor-pointer bg-black/30"
      />
      <aside className="flex h-full w-[360px] max-w-[85vw] flex-col border-l border-[#e4e6eb] bg-white shadow-xl">
        <header className="flex items-center gap-2 border-b border-[#e4e6eb] px-4 py-3">
          <span className="text-[15px] font-semibold text-[#050505]">Files</span>
          <button
            type="button"
            onClick={load}
            aria-label="Refresh"
            className="ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#65676b] hover:bg-[#f2f2f2]"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[#65676b] hover:bg-[#f2f2f2]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-[#e4e6eb] px-3 py-2">
          <div className="flex items-center gap-2 rounded-full bg-[#f0f2f5] px-3">
            <Search className="h-4 w-4 shrink-0 text-[#65676b]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files or jobs"
              className="h-8 flex-1 bg-transparent text-[13px] text-[#050505] placeholder-[#65676b] outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#65676b] hover:bg-[#e4e6eb]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && !jobs && (
            <div className="px-2 py-6 text-center text-[13px] text-[#65676b]">Loading…</div>
          )}
          {error && (
            <div className="px-2 py-6 text-center text-[13px] text-[#d93025]">{error}</div>
          )}
          {filtered && filtered.length === 0 && (
            <div className="px-2 py-6 text-center text-[13px] text-[#65676b]">
              {q ? `No matches for “${query.trim()}”.` : "No files yet. Run a job to produce artifacts."}
            </div>
          )}

          {filtered?.map((job) => {
            const isCollapsed = q === "" && collapsed.has(job.id);
            return (
              <div key={job.id} className="mb-1">
                <div className="flex items-center gap-1 rounded-md pr-2 hover:bg-[#f2f2f2]">
                  <button
                    type="button"
                    onClick={() => toggle(job.id)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#90949c]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-[#90949c]" />
                    )}
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[job.status])} />
                    <span className="text-[13px] font-semibold text-[#050505]">
                      {TOOL_LABEL[job.tool] ?? job.tool}
                    </span>
                    <span className="truncate font-mono text-[11px] text-[#90949c]">#{job.id}</span>
                  </button>
                  <a
                    href={connectorUrl(`/jobs/${job.id}/archive`, base)}
                    download={`${job.id}.zip`}
                    aria-label={`Download all ${job.files.length} files as .zip`}
                    title="Download all as .zip"
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#65676b] hover:bg-[#e7f3ff] hover:text-[#0084ff]"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <span className="w-5 shrink-0 text-right text-[11px] text-[#90949c]">
                    {job.files.length}
                  </span>
                </div>

                {!isCollapsed && (
                  <ul className="ml-3 border-l border-[#e9ebee] pl-2">
                    {job.files.map((f) => {
                      const url = fileUrl(base, job.id, f.name);
                      const Icon = KIND_ICON[f.kind];
                      return (
                        <li
                          key={f.name}
                          className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[#f7f8fa]"
                        >
                          {f.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt={f.name}
                              className="h-8 w-8 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <Icon className="h-5 w-5 shrink-0 text-[#65676b]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block cursor-pointer truncate text-[12px] text-[#050505] hover:text-[#0084ff] hover:underline"
                              title={`${f.name} — open`}
                            >
                              {f.name}
                            </a>
                            <span className="text-[10px] text-[#90949c]">{fmtDate(f.mtime)}</span>
                          </div>
                          <span className="shrink-0 text-[11px] text-[#90949c]">{fmtSize(f.size)}</span>
                          <a
                            href={url}
                            download={f.name.split("/").pop()}
                            aria-label={`Download ${f.name}`}
                            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#65676b] opacity-0 hover:bg-[#e7f3ff] hover:text-[#0084ff] group-hover:opacity-100"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

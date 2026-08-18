import "server-only";

import { randomBytes } from "node:crypto";

import { sql } from "@/lib/db";

// Durable job store — Postgres (the same Neon DB as conversations/messages), replacing
// the standalone connector's SQLite/Postgres JobStore (video/api/jobs.py). Progress is
// checkpointed per stage so a crash mid-render can be inspected; on-disk artifacts
// (lib/jobs/runs.ts) let a later resume finish an interrupted images job.

export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";

export type JobProgress = { stage: string; current: number; total: number };

export type JobView = {
  id: string;
  tool: string;
  status: JobStatus;
  progress: JobProgress;
  result: Record<string, unknown> | null;
  error: string | null;
};

export type JobWithParams = JobView & { params: Record<string, unknown> };

type JobRow = {
  id: string;
  tool: string;
  status: JobStatus;
  stage: string;
  current: number;
  total: number;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
};

function rowToView(row: JobRow): JobView {
  return {
    id: row.id,
    tool: row.tool,
    status: row.status,
    progress: { stage: row.stage, current: row.current, total: row.total },
    result: row.result,
    error: row.error,
  };
}

export async function create(tool: string, params: Record<string, unknown>): Promise<string> {
  const id = randomBytes(4).toString("hex");
  await sql`
    INSERT INTO jobs (id, tool, status, params)
    VALUES (${id}, ${tool}, 'queued', ${JSON.stringify(params)})
  `;
  return id;
}

export async function setStatus(jobId: string, status: JobStatus): Promise<void> {
  await sql`UPDATE jobs SET status = ${status}, updated_at = now() WHERE id = ${jobId}`;
}

export async function setProgress(jobId: string, stage: string, current = 0, total = 0): Promise<void> {
  await sql`
    UPDATE jobs SET status = 'running', stage = ${stage}, current = ${current}, total = ${total},
      error = NULL, updated_at = now()
    WHERE id = ${jobId}
  `;
}

export async function finish(jobId: string, result: Record<string, unknown>): Promise<void> {
  await sql`
    UPDATE jobs SET status = 'done', result = ${JSON.stringify(result)}, error = NULL, updated_at = now()
    WHERE id = ${jobId}
  `;
}

export async function fail(jobId: string, error: string): Promise<void> {
  await sql`UPDATE jobs SET status = 'failed', error = ${error}, updated_at = now() WHERE id = ${jobId}`;
}

export async function setCanceled(jobId: string): Promise<void> {
  await sql`
    UPDATE jobs SET status = 'canceled', error = 'canceled by user', updated_at = now() WHERE id = ${jobId}
  `;
}

export async function get(jobId: string): Promise<JobView | null> {
  const rows = await sql`SELECT * FROM jobs WHERE id = ${jobId}`;
  return rows.length > 0 ? rowToView(rows[0] as JobRow) : null;
}

/** The original request params (used to resume/regenerate an images job). */
export async function getParams(jobId: string): Promise<Record<string, unknown> | null> {
  const rows = await sql`SELECT params FROM jobs WHERE id = ${jobId}`;
  return rows.length > 0 ? ((rows[0] as { params: Record<string, unknown> }).params ?? {}) : null;
}

/** All jobs (optionally filtered by tool), each view augmented with its params. */
export async function listJobs(tool?: string): Promise<JobWithParams[]> {
  const rows = tool
    ? await sql`SELECT * FROM jobs WHERE tool = ${tool} ORDER BY created_at DESC`
    : await sql`SELECT * FROM jobs ORDER BY created_at DESC`;
  return (rows as JobRow[]).map((row) => ({ ...rowToView(row), params: row.params }));
}

/**
 * On startup, fail jobs left 'queued'/'running' by a prior crash/restart. The
 * in-process worker queue doesn't survive a restart, so any unfinished job is
 * orphaned; surfacing it as failed (rather than forever 'running') lets the chat
 * offer a retry. On-disk artifacts remain for a possible resume.
 */
export async function resetOrphans(): Promise<number> {
  const rows = await sql`
    UPDATE jobs SET status = 'failed', error = 'server restarted before this job finished', updated_at = now()
    WHERE status IN ('queued', 'running')
    RETURNING id
  `;
  return rows.length;
}

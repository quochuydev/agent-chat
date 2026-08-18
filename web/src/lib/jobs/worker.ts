import "server-only";

import { JOB_WORKER_CONCURRENCY } from "@/lib/config";
import { cancellation, Cancelled } from "@/lib/jobs/cancellation";
import * as store from "@/lib/jobs/store";

// In-process worker pool, port of video/api/worker.py. Drains a queue of jobs with
// bounded concurrency, runs the matching stage runner, and writes the result/error back
// to the durable store. Runs inside the same persistent Node server as the rest of the
// app (this deploys as `next build --standalone` + `node server.js`, not serverless),
// so — like the Python worker — an in-process queue survives for the process lifetime.

export type Runner<P = Record<string, unknown>> = (jobId: string, params: P) => Promise<Record<string, unknown>>;

type QueueItem = { jobId: string; runner: Runner; params: unknown };

class Worker {
  private queue: QueueItem[] = [];
  private active = 0;

  constructor(private concurrency: number) {}

  submit<P>(jobId: string, runner: Runner<P>, params: P): void {
    this.queue.push({ jobId, runner: runner as Runner, params });
    this.pump();
  }

  private pump(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;
      this.active++;
      void this.runOne(item).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async runOne({ jobId, runner, params }: QueueItem): Promise<void> {
    try {
      if (cancellation.isCancelled(jobId)) {
        await store.setCanceled(jobId);
        return;
      }
      await store.setStatus(jobId, "running");
      const result = await runner(jobId, params as Record<string, unknown>);
      await store.finish(jobId, result);
    } catch (err) {
      if (err instanceof Cancelled || cancellation.isCancelled(jobId)) {
        await store.setCanceled(jobId);
      } else {
        const detail = err instanceof Error ? err.message : String(err);
        await store.fail(jobId, detail);
      }
    } finally {
      cancellation.clear(jobId);
    }
  }
}

// Singleton on globalThis so Next.js dev-mode module reloads don't spawn a second queue.
const g = globalThis as unknown as { __videoWorker?: Worker };
export const worker = g.__videoWorker ?? (g.__videoWorker = new Worker(JOB_WORKER_CONCURRENCY));

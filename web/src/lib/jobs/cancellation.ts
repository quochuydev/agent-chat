// Job cancellation registry ("click to stop"), port of video/api/control.py. A running
// stage's fetch calls (TTS/Imagen) take an AbortSignal; to stop them we keep the
// AbortController here keyed by job id and abort it on request. Queued jobs (no
// controller yet) are stopped by flagging them — the worker checks the flag before
// starting.

export class Cancelled extends Error {
  constructor() {
    super("job cancelled");
    this.name = "Cancelled";
  }
}

class Cancellation {
  private controllers = new Map<string, AbortController>();
  private cancelled = new Set<string>();

  register(jobId: string): AbortController {
    const controller = new AbortController();
    this.controllers.set(jobId, controller);
    return controller;
  }

  unregister(jobId: string): void {
    this.controllers.delete(jobId);
  }

  isCancelled(jobId: string): boolean {
    return this.cancelled.has(jobId);
  }

  /** Flag the job and abort its in-flight fetch, if any. */
  cancel(jobId: string): void {
    this.cancelled.add(jobId);
    this.controllers.get(jobId)?.abort();
  }

  clear(jobId: string): void {
    this.cancelled.delete(jobId);
    this.controllers.delete(jobId);
  }
}

// Process-wide singleton shared by runners (register/check) and the cancel route. Kept
// on globalThis so Next.js dev-mode module reloads don't spawn a second registry.
const g = globalThis as unknown as { __videoCancellation?: Cancellation };
export const cancellation = g.__videoCancellation ?? (g.__videoCancellation = new Cancellation());

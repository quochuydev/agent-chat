"""In-process worker pool (doc 02 scale dial: minutes tier).

A small thread pool drains a queue of jobs, runs the matching stage runner, and writes
the result/error back to the durable store. Two workers by default so voiceover/transcript
can overlap the long image job (doc 09 'pipeline overlap'); image gen itself is GPU-serial.

To scale to the hours tier (doc 06), swap this for RQ/arq + Redis — the store and the
runners are unchanged; only the queue/process boundary moves.
"""
from __future__ import annotations

import os
import queue
import threading
import traceback
from typing import Any, Callable

from .control import Cancelled, cancellation
from .jobs import JobStore

Runner = Callable[[JobStore, str, Any], dict]


class Worker:
    def __init__(self, store: JobStore, concurrency: int | None = None):
        self._store = store
        self._q: "queue.Queue[tuple[str, Runner, Any]]" = queue.Queue()
        self._threads: list[threading.Thread] = []
        self._n = concurrency or int(os.environ.get("VIDEO_WORKERS", "2"))

    def start(self) -> None:
        for i in range(self._n):
            t = threading.Thread(target=self._loop, name=f"video-worker-{i}", daemon=True)
            t.start()
            self._threads.append(t)

    def submit(self, job_id: str, runner: Runner, req: Any) -> None:
        self._q.put((job_id, runner, req))

    def _loop(self) -> None:
        while True:
            job_id, runner, req = self._q.get()
            try:
                if cancellation.is_cancelled(job_id):  # stopped while still queued
                    self._store.set_canceled(job_id)
                    continue
                self._store.set_status(job_id, "running")
                result = runner(self._store, job_id, req)
                self._store.finish(job_id, result)
            except Cancelled:
                self._store.set_canceled(job_id)
            except Exception as exc:  # noqa: BLE001 — surface any failure to the job
                if cancellation.is_cancelled(job_id):
                    self._store.set_canceled(job_id)
                else:
                    detail = str(exc) or traceback.format_exc(limit=3)
                    self._store.fail(job_id, detail)
            finally:
                cancellation.clear(job_id)
                self._q.task_done()

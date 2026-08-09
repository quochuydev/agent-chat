"""Job cancellation registry (the 'click to stop' feature).

A running stage runs its model script as a subprocess; to stop it we keep the live
Popen handle here keyed by job_id and terminate it on request. Queued jobs (no process
yet) are stopped by flagging them — the worker checks the flag before starting.
"""
from __future__ import annotations

import subprocess
import threading


class Cancelled(Exception):
    """Raised inside a runner when its job was cancelled mid-flight."""


class Cancellation:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._procs: dict[str, subprocess.Popen] = {}
        self._cancelled: set[str] = set()

    def register(self, job_id: str, proc: subprocess.Popen) -> None:
        with self._lock:
            self._procs[job_id] = proc

    def unregister(self, job_id: str) -> None:
        with self._lock:
            self._procs.pop(job_id, None)

    def is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            return job_id in self._cancelled

    def cancel(self, job_id: str) -> None:
        """Flag the job and kill its subprocess if one is running."""
        with self._lock:
            self._cancelled.add(job_id)
            proc = self._procs.get(job_id)
        if proc and proc.poll() is None:
            proc.terminate()

    def clear(self, job_id: str) -> None:
        with self._lock:
            self._cancelled.discard(job_id)
            self._procs.pop(job_id, None)


# Process-wide singleton shared by tasks (register/check) and main (cancel endpoint).
cancellation = Cancellation()

"""Durable job store — SQLAlchemy ORM over SQLite (doc 06: survive restarts).

A `Job` row holds status + progress + result. Writes are checkpointed per stage so a
crash mid-render can be inspected (and, with on-disk artifacts, resumed). The DB model
lives here; it stays separate from the Pydantic API models in models.py (the ORM row is
storage, JobView is the wire shape). SQLite is opened thread-safe for the worker pool.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Optional

from sqlalchemy import Float, Integer, String, Text, create_engine, select, update
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("VIDEO_JOBS_DB", os.path.join(HERE, "..", "jobs.db"))
# When set, the job store uses this Postgres (Neon) database — the same one the web app
# uses for conversations/messages. Tests still pass an explicit sqlite path.
DATABASE_URL = os.environ.get("DATABASE_URL")


def _normalize_url(database_url: str) -> str:
    """Make a libpq URL SQLAlchemy-friendly: pin the psycopg(3) driver."""
    if database_url.startswith("postgres://"):
        database_url = "postgresql://" + database_url[len("postgres://"):]
    if database_url.startswith("postgresql://"):
        database_url = "postgresql+psycopg://" + database_url[len("postgresql://"):]
    return database_url


class Base(DeclarativeBase):
    pass


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    tool: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="queued")
    stage: Mapped[str] = mapped_column(String, nullable=False, default="")
    current: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    params: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[float] = mapped_column(Float, nullable=False)

    def to_view(self) -> dict[str, Any]:
        """Shape returned by GET /jobs/{id} (doc 07), parsed by JobView."""
        return {
            "id": self.id,
            "tool": self.tool,
            "status": self.status,
            "progress": {"stage": self.stage, "current": self.current, "total": self.total},
            "result": json.loads(self.result) if self.result else None,
            "error": self.error,
        }


class JobStore:
    def __init__(self, path: Optional[str] = None):
        # Postgres when DATABASE_URL is set and no explicit sqlite path was given
        # (production); a sqlite file otherwise (tests pass a tmp path).
        if path is None and DATABASE_URL:
            self._engine = create_engine(
                _normalize_url(DATABASE_URL),
                pool_pre_ping=True,  # Neon closes idle conns; recycle them transparently
                future=True,
            )
        else:
            sqlite_path = path or DB_PATH
            url = "sqlite://" if sqlite_path == ":memory:" else f"sqlite:///{os.path.abspath(sqlite_path)}"
            self._engine = create_engine(
                url,
                # One pool shared across worker threads; SQLite needs the thread guard off
                # and a busy-timeout so concurrent writers wait rather than erroring.
                connect_args={"check_same_thread": False, "timeout": 30},
                future=True,
            )
        Base.metadata.create_all(self._engine)
        self._session = sessionmaker(bind=self._engine, expire_on_commit=False, future=True)

    def create(self, tool: str, params: dict[str, Any]) -> str:
        job_id = uuid.uuid4().hex[:8]
        now = time.time()
        with self._session.begin() as s:
            s.add(Job(id=job_id, tool=tool, status="queued",
                      params=json.dumps(params), created_at=now, updated_at=now))
        return job_id

    def set_status(self, job_id: str, status: str) -> None:
        self._update(job_id, status=status)

    def set_progress(self, job_id: str, stage: str, current: int = 0, total: int = 0) -> None:
        self._update(job_id, status="running", stage=stage, current=current, total=total)

    def finish(self, job_id: str, result: dict[str, Any]) -> None:
        self._update(job_id, status="done", result=json.dumps(result))

    def fail(self, job_id: str, error: str) -> None:
        self._update(job_id, status="failed", error=error)

    def set_canceled(self, job_id: str) -> None:
        self._update(job_id, status="canceled", error="canceled by user")

    def get(self, job_id: str) -> Optional[dict[str, Any]]:
        with self._session() as s:
            job = s.get(Job, job_id)
            return job.to_view() if job else None

    def get_params(self, job_id: str) -> Optional[dict[str, Any]]:
        """The original request params (used to regenerate a single image)."""
        with self._session() as s:
            job = s.get(Job, job_id)
            return json.loads(job.params) if job else None

    def list_jobs(self, tool: Optional[str] = None) -> list[dict[str, Any]]:
        """All jobs (optionally filtered by tool), each view augmented with its params."""
        with self._session() as s:
            q = select(Job)
            if tool:
                q = q.where(Job.tool == tool)
            return [{**j.to_view(), "params": json.loads(j.params)} for j in s.scalars(q)]

    def reset_orphans(self) -> int:
        """On startup, fail jobs left 'queued'/'running' by a prior crash (doc 06).

        The in-process worker queue does not survive a restart, so any unfinished job is
        orphaned. Surfacing it as failed (rather than forever 'running') lets the chat
        offer a retry. On-disk artifacts remain for a future resume.
        """
        with self._session.begin() as s:
            res = s.execute(
                update(Job)
                .where(Job.status.in_(("queued", "running")))
                .values(status="failed",
                        error="worker restarted before this job finished",
                        updated_at=time.time())
            )
            return res.rowcount or 0

    def _update(self, job_id: str, **values: Any) -> None:
        values["updated_at"] = time.time()
        # Clear a stale error when a job moves back into running/done (e.g. on resume),
        # unless this update is itself setting one.
        if values.get("status") in ("running", "done") and "error" not in values:
            values["error"] = None
        with self._session.begin() as s:
            s.execute(update(Job).where(Job.id == job_id).values(**values))

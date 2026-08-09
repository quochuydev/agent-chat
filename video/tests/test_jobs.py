"""JobStore (SQLAlchemy ORM) — lifecycle, progress, persistence, orphan recovery."""
from __future__ import annotations

from pathlib import Path

from api.jobs import JobStore


def test_create_returns_queued_job(store: JobStore):
    job_id = store.create("generate_images", {"prompts": ["a", "b"]})
    job = store.get(job_id)
    assert job is not None
    assert job["status"] == "queued"
    assert job["tool"] == "generate_images"
    assert job["progress"] == {"stage": "", "current": 0, "total": 0}
    assert job["result"] is None and job["error"] is None


def test_get_unknown_returns_none(store: JobStore):
    assert store.get("does-not-exist") is None


def test_progress_moves_to_running(store: JobStore):
    job_id = store.create("generate_images", {})
    store.set_progress(job_id, "images", 3, 10)
    job = store.get(job_id)
    assert job["status"] == "running"
    assert job["progress"] == {"stage": "images", "current": 3, "total": 10}


def test_finish_stores_parsed_result(store: JobStore):
    job_id = store.create("build_video", {})
    store.finish(job_id, {"project_file": "/tmp/p.json", "images": 2})
    job = store.get(job_id)
    assert job["status"] == "done"
    assert job["result"] == {"project_file": "/tmp/p.json", "images": 2}


def test_fail_stores_error(store: JobStore):
    job_id = store.create("generate_voiceover", {})
    store.fail(job_id, "kokoro exploded")
    job = store.get(job_id)
    assert job["status"] == "failed"
    assert job["error"] == "kokoro exploded"


def test_reset_orphans_fails_only_unfinished(store: JobStore):
    queued = store.create("generate_images", {})
    running = store.create("generate_images", {})
    store.set_progress(running, "images", 1, 5)
    done = store.create("build_video", {})
    store.finish(done, {"ok": True})

    affected = store.reset_orphans()

    assert affected == 2
    assert store.get(queued)["status"] == "failed"
    assert store.get(running)["status"] == "failed"
    assert "restarted" in store.get(queued)["error"]
    assert store.get(done)["status"] == "done"  # terminal jobs untouched


def test_resuming_clears_stale_error(store: JobStore):
    """A failed job that moves back to running/done drops its old error (resume case)."""
    job_id = store.create("generate_images", {})
    store.fail(job_id, "worker restarted before this job finished")
    assert store.get(job_id)["error"]

    store.set_progress(job_id, "images", 7, 13)  # resume → running
    assert store.get(job_id)["error"] is None

    store.finish(job_id, {"count": 13})
    assert store.get(job_id)["error"] is None


def test_state_persists_across_store_instances(tmp_path: Path):
    """Durability (doc 06): a new store on the same file sees prior jobs."""
    db = str(tmp_path / "jobs.db")
    first = JobStore(db)
    job_id = first.create("build_video", {"name": "X"})
    first.finish(job_id, {"images": 7})

    reopened = JobStore(db)
    job = reopened.get(job_id)
    assert job is not None
    assert job["status"] == "done"
    assert job["result"] == {"images": 7}

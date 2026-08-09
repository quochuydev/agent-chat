"""FastAPI endpoint tests (doc 07) with an isolated store and stubbed workers.

The worker is swapped so tests never shell out to the ML scripts:
- NoopWorker: jobs stay queued (verifies enqueue + job creation).
- SyncWorker: runs the real runner inline (used for build, which is pure-python).
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api.main as main
from api.jobs import JobStore


class NoopWorker:
    def start(self) -> None: ...
    def submit(self, *args) -> None: ...


class SyncWorker:
    """Runs the submitted runner synchronously so endpoint→worker→task is exercised."""

    def __init__(self, store: JobStore):
        self._store = store

    def start(self) -> None: ...

    def submit(self, job_id, runner, req) -> None:
        try:
            self._store.set_status(job_id, "running")
            self._store.finish(job_id, runner(self._store, job_id, req))
        except Exception as exc:  # mirror worker.Worker error handling
            self._store.fail(job_id, str(exc))


def _client(tmp_path, monkeypatch, worker_factory):
    store = JobStore(str(tmp_path / "jobs.db"))
    monkeypatch.setattr(main, "store", store)
    monkeypatch.setattr(main, "worker", worker_factory(store))
    return TestClient(main.app), store


@pytest.fixture
def client(tmp_path, monkeypatch):
    c, store = _client(tmp_path, monkeypatch, lambda _s: NoopWorker())
    with c:
        yield c, store


@pytest.fixture
def sync_client(tmp_path, monkeypatch):
    c, store = _client(tmp_path, monkeypatch, SyncWorker)
    with c:
        yield c, store


def test_health(client):
    c, _ = client
    assert c.get("/health").json() == {"ok": True}


def test_script_is_sync_and_mentions_topic(client):
    c, _ = client
    res = c.post("/script", json={"topic": "deep sea fish", "duration": 30})
    assert res.status_code == 200
    assert "deep sea fish" in res.json()["text"]


def test_cost_guardrails_reject_overage(client):
    """Duration and image-count caps (api/config.py) are enforced by the request models."""
    from api.config import MAX_IMAGES_PER_VIDEO, MAX_VIDEO_DURATION_SECONDS

    c, _ = client
    over_time = c.post("/script", json={"topic": "x", "duration": MAX_VIDEO_DURATION_SECONDS + 1})
    assert over_time.status_code == 422
    over_imgs = c.post("/images", json={"prompts": ["p"] * (MAX_IMAGES_PER_VIDEO + 1)})
    assert over_imgs.status_code == 422


def test_voiceover_enqueues_queued_job(client):
    c, store = client
    res = c.post("/voiceover", json={"script": "hello world", "voice": "bm_george"})
    assert res.status_code == 200
    job_id = res.json()["job_id"]
    assert res.json()["status"] == "queued"

    view = c.get(f"/jobs/{job_id}").json()
    assert view["tool"] == "generate_voiceover"
    assert view["status"] == "queued"


def test_images_requires_non_empty_prompts(client):
    c, _ = client
    assert c.post("/images", json={"prompts": []}).status_code == 422


def test_unknown_job_returns_404(client):
    c, _ = client
    assert c.get("/jobs/nope").status_code == 404


# NB: the connector's /build takes the unwrapped fields — route.ts strips the
# tool's `project` wrapper before POSTing here (see ASYNC_ENDPOINTS handling).
def test_build_missing_artifacts_fails_gracefully(sync_client):
    c, _ = sync_client
    job_id = c.post("/build", json={"name": "X"}).json()["job_id"]
    view = c.get(f"/jobs/{job_id}").json()
    assert view["status"] == "failed"
    assert "audio_file" in view["error"]


def test_build_success_end_to_end(sync_client, artifacts):
    c, _ = sync_client
    res = c.post(
        "/build",
        json={
            "name": "Survival",
            "audio_file": artifacts["audio"],
            "transcript_file": artifacts["transcript"],
            "images_dir": artifacts["images_dir"],
        },
    )
    job_id = res.json()["job_id"]
    view = c.get(f"/jobs/{job_id}").json()
    assert view["status"] == "done"
    assert view["result"]["images"] == 2
    assert Path(view["result"]["project_file"]).exists()

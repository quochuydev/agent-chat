"""Endpoint tests for the enhanced job card: cancel, regenerate routing, and the
artifact-serving routes (script / transcript / audio / images + versions).

RUNS_DIR is redirected to a tmp dir so file-serving works without running models.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api.main as main
import api.tasks as tasks
from api.jobs import JobStore
from tests.conftest import make_png, make_wav


class NoopWorker:
    def start(self) -> None: ...
    def submit(self, *args) -> None: ...


@pytest.fixture
def env(tmp_path, monkeypatch):
    """TestClient with an isolated store, no-op worker, and a tmp RUNS_DIR."""
    store = JobStore(str(tmp_path / "jobs.db"))
    runs = tmp_path / "runs"
    runs.mkdir()
    monkeypatch.setattr(main, "store", store)
    monkeypatch.setattr(main, "worker", NoopWorker())
    monkeypatch.setattr(tasks, "RUNS_DIR", runs)
    with TestClient(main.app) as c:
        yield c, store, runs


def _seed_images_job(store: JobStore, runs: Path) -> str:
    """An images job whose run dir has prompts + two rendered PNGs (one with a version)."""
    job_id = store.create("generate_images", {"prompts": ["a cat", "a dog"], "width": 800, "height": 450})
    store.finish(job_id, {"images_dir": str(runs / job_id / "images"), "count": 2})
    d = runs / job_id
    (d / "images").mkdir(parents=True)
    (d / "prompts.txt").write_text("[00:00] a cat\n[00:02] a dog\n", encoding="utf-8")
    make_png(d / "images" / "001_00-00.png", 800, 450)
    make_png(d / "images" / "002_00-02.png", 800, 450)
    make_png(d / "images" / "001_00-00.v1.png", 800, 450)  # an archived prior version
    return job_id


# --- cancel -----------------------------------------------------------------
def test_cancel_marks_job_canceled(env):
    c, store, _ = env
    job_id = c.post("/voiceover", json={"script": "hi", "voice": "am_michael"}).json()["job_id"]
    res = c.post(f"/jobs/{job_id}/cancel")
    assert res.status_code == 200
    assert res.json()["status"] == "canceled"
    assert store.get(job_id)["status"] == "canceled"


def test_cancel_unknown_404(env):
    c, _, _ = env
    assert c.post("/jobs/nope/cancel").status_code == 404


def test_cancel_terminal_job_is_noop(env):
    c, store, _ = env
    job_id = store.create("build_video", {})
    store.finish(job_id, {"ok": True})
    res = c.post(f"/jobs/{job_id}/cancel")
    assert res.json()["status"] == "done"  # unchanged


# --- regenerate routing -----------------------------------------------------
def test_regenerate_returns_new_job(env):
    c, store, runs = env
    parent = _seed_images_job(store, runs)
    res = c.post(f"/jobs/{parent}/regenerate", json={"index": 1})
    assert res.status_code == 200
    assert res.json()["job_id"] != parent


def test_regenerate_rejects_non_images_job(env):
    c, store, _ = env
    vo = store.create("generate_voiceover", {})
    assert c.post(f"/jobs/{vo}/regenerate", json={"index": 1}).status_code == 400


def test_regenerate_requires_positive_index(env):
    c, store, runs = env
    parent = _seed_images_job(store, runs)
    assert c.post(f"/jobs/{parent}/regenerate", json={"index": 0}).status_code == 422


# --- images listing + serving -----------------------------------------------
def test_list_images_reports_prompts_versions_and_progress(env):
    c, store, runs = env
    parent = _seed_images_job(store, runs)
    body = c.get(f"/jobs/{parent}/images").json()
    assert body["total"] == 2 and body["ready"] == 2
    first = body["images"][0]
    assert first["index"] == 1
    assert first["prompt"] == "a cat"
    assert first["versions"] == ["001_00-00.v1.png"]


def test_serve_image_and_version(env):
    c, store, runs = env
    parent = _seed_images_job(store, runs)
    ok = c.get(f"/jobs/{parent}/images/001_00-00.png")
    assert ok.status_code == 200 and ok.headers["content-type"] == "image/png"
    assert c.get(f"/jobs/{parent}/images/001_00-00.v1.png").status_code == 200


def test_serve_image_rejects_bad_name_and_missing(env):
    c, store, runs = env
    parent = _seed_images_job(store, runs)
    assert c.get(f"/jobs/{parent}/images/..%2Fsecret").status_code in (400, 404)
    assert c.get(f"/jobs/{parent}/images/evil.txt").status_code == 400
    assert c.get(f"/jobs/{parent}/images/099_09-09.png").status_code == 404


# --- script / transcript / audio --------------------------------------------
def test_serve_script_and_transcript_and_audio(env):
    c, store, runs = env
    job_id = store.create("generate_transcript", {})
    d = runs / job_id
    d.mkdir()
    (d / "script.txt").write_text("Once upon a time.", encoding="utf-8")
    (d / "script_af_sky.transcript.txt").write_text("[00:00] Once upon a time.\n", encoding="utf-8")
    make_wav(d / "script_af_sky.aligned.wav", seconds=1.0)
    store.finish(job_id, {
        "transcript_file": str(d / "script_af_sky.transcript.txt"),
        "audio_file": str(d / "script_af_sky.aligned.wav"),
    })

    assert c.get(f"/jobs/{job_id}/script").json()["script"] == "Once upon a time."
    assert "Once upon a time" in c.get(f"/jobs/{job_id}/transcript").json()["transcript"]
    audio = c.get(f"/jobs/{job_id}/audio")
    assert audio.status_code == 200 and audio.headers["content-type"] == "audio/wav"


def test_missing_artifacts_404(env):
    c, store, _ = env
    job_id = store.create("generate_voiceover", {})
    assert c.get(f"/jobs/{job_id}/script").status_code == 404
    assert c.get(f"/jobs/{job_id}/audio").status_code == 404


# --- orphan recovery (restart with PNGs already on disk) --------------------
def test_reconcile_recovers_complete_image_orphan(env):
    c, store, runs = env
    parent = _seed_images_job(store, runs)  # 2 prompts, 2 PNGs on disk
    store.fail(parent, "worker restarted before this job finished")

    recovered = main._reconcile_image_orphans()

    assert recovered == 1
    job = store.get(parent)
    assert job["status"] == "done"
    assert job["result"]["count"] == 2


def test_reconcile_leaves_partial_orphan_failed_but_images_visible(env):
    c, store, runs = env
    # 3 prompts but only 2 rendered → incomplete
    parent = store.create("generate_images", {"prompts": ["a", "b", "c"]})
    store.fail(parent, "worker restarted before this job finished")
    d = runs / parent
    (d / "images").mkdir(parents=True)
    (d / "prompts.txt").write_text("[00:00] a\n[00:02] b\n[00:04] c\n", encoding="utf-8")
    make_png(d / "images" / "001_00-00.png")
    make_png(d / "images" / "002_00-02.png")

    recovered = main._reconcile_image_orphans()

    assert recovered == 0
    assert store.get(parent)["status"] == "failed"
    # the rendered images are still listed for the UI
    assert c.get(f"/jobs/{parent}/images").json()["ready"] == 2


def test_list_jobs_filters_by_tool(env):
    _, store, _ = env
    store.create("generate_images", {})
    store.create("generate_voiceover", {})
    imgs = store.list_jobs(tool="generate_images")
    assert len(imgs) == 1 and imgs[0]["tool"] == "generate_images"
    assert "params" in imgs[0]

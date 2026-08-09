"""run_regenerate crash-safety + version swap (stubs _stream so no models run)."""
from __future__ import annotations

from pathlib import Path

import pytest

import api.tasks as tasks
from api.jobs import JobStore
from api.models import RegenerateRequest
from tests.conftest import make_png


@pytest.fixture
def parent(tmp_path, monkeypatch):
    """Seed an images job with one rendered image + prompts, RUNS_DIR → tmp."""
    runs = tmp_path / "runs"
    runs.mkdir()
    monkeypatch.setattr(tasks, "RUNS_DIR", runs)
    store = JobStore(str(tmp_path / "jobs.db"))
    parent_id = store.create("generate_images", {"prompts": ["a cat"], "width": 800, "height": 450, "steps": 2})
    d = runs / parent_id
    (d / "images").mkdir(parents=True)
    (d / "prompts.txt").write_text("[00:00] a cat\n", encoding="utf-8")
    make_png(d / "images" / "001_00-00.png", 800, 450)
    return store, runs, parent_id


def test_failed_regenerate_preserves_original(parent, monkeypatch):
    store, runs, parent_id = parent
    images = runs / parent_id / "images"
    before = (images / "001_00-00.png").read_bytes()

    def boom(job_id, cmd, on_line):
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(tasks, "_stream", boom)
    regen_id = store.create("regenerate_image", {})
    with pytest.raises(RuntimeError):
        tasks.run_regenerate(store, regen_id, RegenerateRequest(index=1), parent_id)

    # original intact, nothing archived
    assert (images / "001_00-00.png").read_bytes() == before
    assert list(images.glob("001_00-00.v*.png")) == []


def test_successful_regenerate_archives_old_and_promotes_new(parent, monkeypatch):
    store, runs, parent_id = parent
    images = runs / parent_id / "images"
    old = (images / "001_00-00.png").read_bytes()

    def fake_stream(job_id, cmd, on_line):
        out = Path(cmd[cmd.index("--outdir") + 1])  # scratch dir run_regenerate passes
        out.mkdir(parents=True, exist_ok=True)
        make_png(out / "001_00-00.png", 640, 360)  # a visibly different render
        on_line("[1/1] 00-00 -> 001_00-00.png")

    monkeypatch.setattr(tasks, "_stream", fake_stream)
    regen_id = store.create("regenerate_image", {})
    result = tasks.run_regenerate(store, regen_id, RegenerateRequest(index=1), parent_id)

    assert result["versions"] == 1
    assert (images / "001_00-00.v1.png").read_bytes() == old  # old archived, not deleted
    assert (images / "001_00-00.png").read_bytes() != old      # canonical replaced

"""run_resume — fills only the missing image indices, leaving existing ones intact."""
from __future__ import annotations

import re
from pathlib import Path

import pytest

import api.tasks as tasks
from api.jobs import JobStore
from tests.conftest import make_png


@pytest.fixture
def partial(tmp_path, monkeypatch):
    """Images job for 3 prompts with only #1 rendered; RUNS_DIR → tmp."""
    runs = tmp_path / "runs"
    runs.mkdir()
    monkeypatch.setattr(tasks, "RUNS_DIR", runs)
    store = JobStore(str(tmp_path / "jobs.db"))
    job_id = store.create("generate_images", {"prompts": ["a", "b", "c"], "width": 800, "height": 450})
    d = runs / job_id
    (d / "images").mkdir(parents=True)
    (d / "prompts.txt").write_text("[00:00] a\n[00:02] b\n[00:04] c\n", encoding="utf-8")
    make_png(d / "images" / "001_00-00.png", 800, 450)
    return store, runs, job_id


def _fake_generator(monkeypatch):
    """Stub _stream so it 'renders' exactly the --start..--end range it's given."""
    def fake(job_id, cmd, on_line):
        prompts = Path(cmd[2])
        out = Path(cmd[cmd.index("--outdir") + 1])
        start = int(cmd[cmd.index("--start") + 1])
        end = int(cmd[cmd.index("--end") + 1])
        lines = [ln for ln in prompts.read_text(encoding="utf-8").splitlines() if ln.strip()]
        for i in range(start, end + 1):
            m = re.match(r"^\[(\d{2}):(\d{2})\]", lines[i - 1])
            out.mkdir(parents=True, exist_ok=True)
            make_png(out / f"{i:03d}_{m.group(1)}-{m.group(2)}.png")
            on_line(f"[{i}/{len(lines)}]")
    monkeypatch.setattr(tasks, "_stream", fake)


def test_resume_fills_missing_and_keeps_existing(partial, monkeypatch):
    store, runs, job_id = partial
    images = runs / job_id / "images"
    first_before = (images / "001_00-00.png").read_bytes()
    _fake_generator(monkeypatch)

    result = tasks.run_resume(store, job_id)

    assert result["count"] == 3
    assert sorted(p.name for p in images.glob("[0-9]*.png")) == [
        "001_00-00.png", "002_00-02.png", "003_00-04.png",
    ]
    assert (images / "001_00-00.png").read_bytes() == first_before  # untouched


def test_resume_when_complete_is_a_noop(partial, monkeypatch):
    store, runs, job_id = partial
    images = runs / job_id / "images"
    make_png(images / "002_00-02.png")
    make_png(images / "003_00-04.png")
    # _stream must NOT be called when nothing is missing
    monkeypatch.setattr(tasks, "_stream", lambda *a, **k: pytest.fail("should not render"))

    result = tasks.run_resume(store, job_id)
    assert result["count"] == 3


def test_resume_renders_noncontiguous_gaps(partial, monkeypatch):
    store, runs, job_id = partial
    images = runs / job_id / "images"
    make_png(images / "003_00-04.png")  # now 1 and 3 present, only 2 missing
    calls: list[tuple[int, int]] = []
    real_fake = _fake_generator(monkeypatch)  # installs the stub

    # wrap to record ranges
    orig = tasks._stream
    def recording(job_id_, cmd, on_line):
        calls.append((int(cmd[cmd.index("--start") + 1]), int(cmd[cmd.index("--end") + 1])))
        orig(job_id_, cmd, on_line)
    monkeypatch.setattr(tasks, "_stream", recording)

    tasks.run_resume(store, job_id)
    assert calls == [(2, 2)]  # single missing index, one invocation

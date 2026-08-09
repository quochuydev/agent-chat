"""build_project — assembles a valid OpenCut project + SRT from on-disk artifacts."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from api.build_project import build_project


def test_build_writes_project_and_srt(artifacts, tmp_path: Path):
    out = tmp_path / "project.opencut.json"
    summary = build_project(
        audio_file=artifacts["audio"],
        images_dir=artifacts["images_dir"],
        out_path=str(out),
        transcript_file=artifacts["transcript"],
        name="Test Video",
    )

    assert out.exists()
    assert summary["images"] == 2
    assert summary["duration_s"] == pytest.approx(4.0, abs=0.05)

    project = json.loads(out.read_text())
    p = project["project"]
    assert p["metadata"]["name"] == "Test Video"
    # one media entry per image + one audio
    assert len(project["media"]) == 3
    main_track = p["scenes"][0]["tracks"]["main"]
    assert len(main_track["elements"]) == 2

    # first image starts at 0; second at 2s -> 2 * 120000 ticks
    els = main_track["elements"]
    assert els[0]["startTime"] == 0
    assert els[1]["startTime"] == 2 * 120_000

    srt = Path(summary["srt_file"])
    assert srt.exists()
    assert "First line." in srt.read_text()


def test_captions_off_by_default(artifacts, tmp_path: Path):
    out = tmp_path / "p.opencut.json"
    summary = build_project(
        audio_file=artifacts["audio"],
        images_dir=artifacts["images_dir"],
        out_path=str(out),
        transcript_file=artifacts["transcript"],
    )
    assert summary["captions"] == 0
    overlay = json.loads(out.read_text())["project"]["scenes"][0]["tracks"]["overlay"]
    assert overlay == []


def test_captions_on_emits_overlay_track(artifacts, tmp_path: Path):
    out = tmp_path / "p.opencut.json"
    summary = build_project(
        audio_file=artifacts["audio"],
        images_dir=artifacts["images_dir"],
        out_path=str(out),
        transcript_file=artifacts["transcript"],
        include_captions=True,
    )
    assert summary["captions"] == 2
    overlay = json.loads(out.read_text())["project"]["scenes"][0]["tracks"]["overlay"]
    assert len(overlay) == 1
    assert len(overlay[0]["elements"]) == 2


def test_build_raises_without_images(tmp_path: Path, artifacts):
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(ValueError, match="no timestamped PNGs"):
        build_project(
            audio_file=artifacts["audio"],
            images_dir=str(empty),
            out_path=str(tmp_path / "p.opencut.json"),
        )


def test_stable_ids_are_deterministic(artifacts, tmp_path: Path):
    """Same inputs + name -> identical project id (uuid5 over a fixed namespace)."""
    def build(dst: str) -> dict:
        build_project(
            audio_file=artifacts["audio"],
            images_dir=artifacts["images_dir"],
            out_path=dst,
            name="Same",
        )
        return json.loads(Path(dst).read_text())

    a = build(str(tmp_path / "a.opencut.json"))
    b = build(str(tmp_path / "b.opencut.json"))
    assert a["project"]["metadata"]["id"] == b["project"]["metadata"]["id"]

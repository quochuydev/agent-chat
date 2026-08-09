"""Shared fixtures. Synthetic WAV/PNG artifacts so build tests need no ML deps."""
from __future__ import annotations

import struct
import wave
import zlib
from pathlib import Path

import pytest

from api.jobs import JobStore


@pytest.fixture
def store(tmp_path: Path) -> JobStore:
    """A fresh ORM-backed store on a throwaway SQLite file."""
    return JobStore(str(tmp_path / "jobs.db"))


def make_wav(path: Path, seconds: float = 2.0, rate: int = 24000) -> Path:
    """Write a valid silent mono 16-bit WAV (read by build_project via the wave module)."""
    frames = int(seconds * rate)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * frames)
    return path


def make_png(path: Path, width: int = 1024, height: int = 576) -> Path:
    """Write a minimal but valid 1x1-ish PNG whose IHDR advertises width/height.

    build_project reads size from the IHDR header bytes and the file size from disk;
    the pixel data only needs to be a well-formed (decompressible) IDAT chunk.
    """
    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    idat = zlib.compress(b"\x00\x00\x00\x00")
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    path.write_bytes(png)
    return path


@pytest.fixture
def artifacts(tmp_path: Path):
    """A complete artifact set: aligned wav, two timestamped PNGs, a transcript."""
    audio = make_wav(tmp_path / "voice.aligned.wav", seconds=4.0)
    images_dir = tmp_path / "images"
    images_dir.mkdir()
    make_png(images_dir / "001_00-00.png", 800, 450)
    make_png(images_dir / "002_00-02.png", 800, 450)
    transcript = tmp_path / "voice.transcript.txt"
    transcript.write_text("[00:00] First line.\n[00:02] Second line.\n", encoding="utf-8")
    return {"audio": str(audio), "images_dir": str(images_dir), "transcript": str(transcript)}

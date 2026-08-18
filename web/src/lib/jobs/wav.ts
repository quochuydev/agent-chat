// Minimal WAV (PCM) read/write — no npm dependency. Needed because build-project.ts
// measures narration duration from the audio file, and runners.ts concatenates
// per-line TTS clips into one aligned track (mirrors what generate_transcript.py did
// with numpy/soundfile, just without those deps).

export type Wav = {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  data: Buffer; // raw PCM samples (no header)
};

// Parses fmt/data chunks out of a RIFF/WAVE buffer, tolerating extra chunks (LIST, etc.)
// that some encoders insert between them.
export function readWav(buf: Buffer): Wav {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE buffer");
  }
  let offset = 12;
  let fmt: { numChannels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let data: Buffer | null = null;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        numChannels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      data = buf.subarray(body, body + size);
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }

  if (!fmt || !data) throw new Error("WAV missing fmt/data chunk");
  return { sampleRate: fmt.sampleRate, numChannels: fmt.numChannels, bitsPerSample: fmt.bitsPerSample, data };
}

export function wavDurationSeconds(wav: Wav): number {
  const bytesPerFrame = wav.numChannels * (wav.bitsPerSample / 8);
  return bytesPerFrame > 0 ? wav.data.length / bytesPerFrame / wav.sampleRate : 0;
}

export function writeWav(wav: Wav): Buffer {
  const byteRate = wav.sampleRate * wav.numChannels * (wav.bitsPerSample / 8);
  const blockAlign = wav.numChannels * (wav.bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + wav.data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size (PCM)
  header.writeUInt16LE(1, 20); // audio format: PCM
  header.writeUInt16LE(wav.numChannels, 22);
  header.writeUInt32LE(wav.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(wav.bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(wav.data.length, 40);
  return Buffer.concat([header, wav.data]);
}

// Concatenates same-format WAV buffers (e.g. one TTS call per caption line) into one
// track, in order. All inputs must share sample rate/channels/bit depth — true here
// since every clip comes from the same tts.ts call.
export function concatWav(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) throw new Error("concatWav: no buffers");
  const wavs = buffers.map(readWav);
  const [first] = wavs;
  for (const w of wavs) {
    if (w.sampleRate !== first.sampleRate || w.numChannels !== first.numChannels || w.bitsPerSample !== first.bitsPerSample) {
      throw new Error("concatWav: mismatched WAV format between clips");
    }
  }
  return writeWav({ ...first, data: Buffer.concat(wavs.map((w) => w.data)) });
}

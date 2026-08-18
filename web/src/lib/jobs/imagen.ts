// Google Imagen (cloud image generation) — port of video/generate_imagen.py. Sole image
// backend now that local FLUX is gone: one POST per prompt to the Imagen `:predict`
// endpoint, same aspect-ratio snapping and retry/backoff as the Python version.
import { GEMINI_API_KEY, IMAGEN_MODEL } from "@/lib/config";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

// Imagen only accepts a fixed set of aspect ratios (not arbitrary width/height); map the
// requested frame to the nearest one so callers can still steer it via width/height.
const ASPECTS: Record<string, number> = { "1:1": 1, "3:4": 0.75, "4:3": 4 / 3, "9:16": 9 / 16, "16:9": 16 / 9 };

export function aspectRatio(width: number, height: number): string {
  const target = height ? width / height : 16 / 9;
  let best = "16:9";
  let bestDiff = Infinity;
  for (const [ratio, value] of Object.entries(ASPECTS)) {
    const diff = Math.abs(value - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = ratio;
    }
  }
  return best;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateImage(
  prompt: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set — cannot generate images. Get one at https://aistudio.google.com.",
    );
  }
  const aspect = aspectRatio(width, height);
  const url = `${API_ROOT}/${IMAGEN_MODEL}:predict`;
  const payload = JSON.stringify({
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: aspect, personGeneration: "allow_adult" },
  });

  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: payload,
      signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { predictions?: { bytesBase64Encoded?: string }[] };
      const b64 = data.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) {
        throw new Error("Imagen returned no image (prompt may have been blocked by safety filters)");
      }
      return Buffer.from(b64, "base64");
    }
    const body = await res.text().catch(() => "");
    lastError = `HTTP ${res.status}: ${body.slice(0, 400)}`;
    if ([429, 500, 502, 503, 504].includes(res.status) && attempt < 3) {
      await sleep(2000 * (attempt + 1)); // linear backoff
      continue;
    }
    throw new Error(`Imagen request failed (${lastError})`);
  }
  throw new Error(`Imagen request failed (${lastError})`);
}

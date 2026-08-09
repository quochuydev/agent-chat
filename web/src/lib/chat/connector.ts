import { API_BASE } from "./config";
import type { ConnectorResult } from "./types";

// Thin JSON wrapper around the video connector (video/ :3333). Never throws — a
// failed/unreachable call comes back as { ok: false, data: { error } }.
export async function connector(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<ConnectorResult> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : "connector unreachable";
    return { ok: false, data: { error: `${message} (is the video API on ${API_BASE}?)` }, status: 0 };
  }
}

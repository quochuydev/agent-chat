// Job/artifact routes now live in this same Next.js app (web/src/app/api/jobs/…,
// lib/jobs/*) — everything is same-origin, so this is just a small naming helper kept
// around so call sites read `connectorUrl("/jobs/123")` instead of a raw template string.
export function connectorUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `/api${p}`;
}

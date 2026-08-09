"use client";

import { useEffect, useState } from "react";

// The video connector (the heavy Python backend) is not deployed — each user runs it
// locally and points the hosted frontend at it with a ?apiUrl= query param. We remember
// that value so it survives navigation, and call the connector straight from the browser
// (only the user's own machine can reach their localhost — a server-side proxy can't).

const STORAGE_KEY = "agentchat:apiUrl";
// Where the connector runs by default — every user runs it locally on this port, so we
// target it directly from the browser unless overridden. Same as opening ?apiUrl=<this>.
const DEFAULT_API_BASE = "http://localhost:3333";
const stripTrailingSlash = (u: string) => u.replace(/\/+$/, "");

// Resolve the connector base URL: a ?apiUrl= query param wins (and is remembered), then
// the last remembered value, else the default local connector (http://localhost:3333).
export function resolveApiBase(): string | null {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("apiUrl");
  if (param) {
    const value = stripTrailingSlash(param);
    window.localStorage.setItem(STORAGE_KEY, value);
    return value;
  }
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved ? stripTrailingSlash(saved) : DEFAULT_API_BASE;
}

// Build a connector URL for `path` (e.g. "/jobs/123"). With a base set we hit the user's
// backend directly; otherwise the same-origin proxy. Pass `base` explicitly in render
// (from useApiBase) to stay hydration-safe; omit it in event handlers / effects.
export function connectorUrl(path: string, base: string | null = resolveApiBase()): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : `/api${p}`;
}

// Render-safe base for href/src attributes: null on the server and the first client paint
// (so SSR and hydration agree), then the resolved value after mount.
export function useApiBase(): string | null {
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => setBase(resolveApiBase()), []);
  return base;
}

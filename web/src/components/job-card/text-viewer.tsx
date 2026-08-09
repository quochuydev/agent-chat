"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { connectorUrl } from "@/lib/connector";

// View full script / transcript — fetched on first expand.
export function TextViewer({ jobId, kind, label }: { jobId: string; kind: "script" | "transcript"; label: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && text === null && !loading) {
      setLoading(true);
      try {
        const res = await fetch(connectorUrl(`/jobs/${jobId}/${kind}`), { cache: "no-store" });
        const data = (await res.json()) as Record<string, string>;
        setText(data[kind] ?? "(empty)");
      } catch {
        setText("(failed to load)");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex cursor-pointer items-center gap-1 text-[12px] font-medium text-[#0084ff] hover:underline"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        View full {label}
      </button>
      {open && (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-[#f0f2f5] p-2.5 text-[12px] leading-[1.4] text-[#050505]">
          {loading ? "Loading…" : text}
        </pre>
      )}
    </div>
  );
}

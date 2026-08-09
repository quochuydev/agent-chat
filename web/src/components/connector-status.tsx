"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Play, Terminal } from "lucide-react";

import { connectorUrl, useApiBase } from "@/lib/connector";
import { cn } from "@/lib/utils";

// Full, from-scratch sequence to bring up the local Python video connector (see RUN.md).
// Written so it works from any fresh terminal — one-line install (no git clone), then start.
const INSTALL_URL = "https://raw.githubusercontent.com/quochuydev/agent-chat/main/install.sh";
const RUN_STEPS = [
  {
    cmd: `curl -fsSL ${INSTALL_URL} | bash`,
    note: "Download + set up the connector (no git clone). Private repo? prefix GITHUB_TOKEN=…",
  },
  {
    cmd: "cd ~/agent-chat-connector && ./run_api.sh",
    note: "Start it — serves on http://localhost:3333",
  },
];
const RUN_COMMAND = RUN_STEPS.map((s) => s.cmd).join("\n");

type Status = "checking" | "online" | "offline";

// Replaces the toolbar's faux address bar. Video generation needs the Python connector
// running locally, so this polls its /health and — when it's down — shows exactly how to
// start it (copyable command). When up, it shows a green "Connector running" pill with the
// target URL. The connector isn't hosted; users run it themselves and point the frontend
// at it via ?apiUrl= (see lib/connector.ts).
export function ConnectorStatus() {
  const base = useApiBase();
  const [status, setStatus] = useState<Status>("checking");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch(connectorUrl("/health", base), { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      setStatus(res.ok && data?.ok !== false ? "online" : "offline");
    } catch {
      setStatus("offline");
    }
  }, [base]);

  // Poll on mount and every 5s so the pill tracks the connector coming up / going down.
  useEffect(() => {
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, [check]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(RUN_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the command is visible to copy manually */
    }
  };

  const target = base ?? "localhost:3333";

  return (
    <div className="relative hidden min-w-0 max-w-[560px] flex-1 lg:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-[#ededed] bg-[#fafafa] px-2.5 py-1.5 text-left hover:bg-[#f5f5f5]"
        title="Local video connector status"
      >
        <StatusDot status={status} />
        <span className="min-w-0 flex-1 truncate text-[13px] text-[#525252]">
          {status === "online"
            ? `Connector running · ${target}`
            : status === "checking"
              ? "Checking connector…"
              : "Connector offline — run the local server"}
        </span>
        <Terminal className="h-4 w-4 shrink-0 text-[#8f8f8f]" />
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <button
            type="button"
            aria-label="Close connector help"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-2 w-[420px] max-w-[90vw] rounded-xl border border-[#ededed] bg-white p-4 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-[#171717]" />
                <h3 className="text-[13px] font-semibold text-[#171717]">
                  Start the video connector
                </h3>
              </div>
              <button
                type="button"
                onClick={copy}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[#ededed] px-2 py-1 text-[11px] font-medium text-[#525252] hover:bg-[#f5f5f5]"
                title="Copy all commands"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy all"}
              </button>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[#8f8f8f]">
              Video generation runs on a small Python server on your machine. Open a terminal,
              paste these one at a time, and keep the last one running while you make videos.
            </p>

            <ol className="mt-3 space-y-2">
              {RUN_STEPS.map((step, i) => (
                <li key={step.cmd} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#171717] text-[10px] font-semibold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="rounded-md bg-[#0d0d0d] px-2.5 py-1.5">
                      <code className="block overflow-x-auto whitespace-nowrap font-mono text-[12px] text-[#e5e5e5]">
                        <span className="select-none text-[#6b7280]">$ </span>
                        {step.cmd}
                      </code>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-[#a3a3a3]">{step.note}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-3 text-[11px] leading-relaxed text-[#a3a3a3]">
              Needs <code className="text-[#525252]">python3</code>; full voiceover/image
              generation needs an Apple-Silicon Mac. <strong className="text-[#525252]">No AI
              API key required</strong> — generation runs on free local models (weights
              download on first use). If this frontend is hosted, open it with{" "}
              <code className="text-[#525252]">?apiUrl=http://localhost:3333</code> so it can
              reach your connector.
            </p>

            <div className="mt-3 flex items-center justify-between border-t border-[#f0f0f0] pt-3">
              <span className="flex items-center gap-1.5 text-[12px]">
                <StatusDot status={status} />
                <span className="text-[#525252]">
                  {status === "online"
                    ? "Connected"
                    : status === "checking"
                      ? "Checking…"
                      : "Not reachable"}
                </span>
              </span>
              <button
                type="button"
                onClick={check}
                className="cursor-pointer rounded-md px-2 py-1 text-[12px] font-medium text-[#171717] hover:bg-[#f5f5f5]"
              >
                Retry
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: Status }) {
  if (status === "checking") {
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#8f8f8f]" />;
  }
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        status === "online" ? "bg-green-500" : "bg-red-500",
      )}
    />
  );
}

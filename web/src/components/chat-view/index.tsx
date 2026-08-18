"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ImageIcon, MessageSquare, Mic, Plus } from "lucide-react";

import { CHANNELS, getChannel } from "@/lib/channels";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatResponse, DisplayMessage } from "@/lib/types";
import { MessageBubble } from "./message-bubble";
import { TypingIndicator } from "./typing-indicator";

type Props = {
  messages: DisplayMessage[];
  channelId: string;
  onSelectChannel: (id: string) => void;
  onChange: (messages: DisplayMessage[]) => void;
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  onOpenFiles: () => void;
};

// Which quick chips to show above the composer: the model's suggestions from the latest
// assistant turn, or the active channel's starter prompts when the chat hasn't begun.
function nextActions(messages: DisplayMessage[], starters: string[]): string[] {
  const last = messages[messages.length - 1];
  if (!last) return starters;
  if (last.role !== "assistant") return [];
  return last.suggestions ?? starters;
}

export function ChatView({
  messages,
  channelId,
  onSelectChannel,
  onChange,
  selectedJobId,
  onSelectJob,
  onOpenFiles,
}: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialScroll = useRef(true);

  // Jump straight to the bottom on first load/refresh; animate for new messages after.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: initialScroll.current ? "auto" : "smooth" });
    initialScroll.current = false;
  }, [messages, loading]);

  // Job rows settle after mount, so the initial jump can land short. Re-pin to the bottom
  // as content height changes — but only while the user is already near the bottom, so we
  // never yank them away after they scroll up to read.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const ro = new ResizeObserver(() => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        el.scrollTo({ top: el.scrollHeight });
      }
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  // Auto-grow the textarea to fit its content (capped), and shrink back when cleared.
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const next: DisplayMessage[] = [...messages, { role: "user", content }];
    onChange(next);
    setInput("");
    setLoading(true);
    // Follow the newest output once this turn produces a job.
    onSelectJob(null);

    try {
      const history: ChatMessage[] = next.map(({ role, content }) => ({ role, content }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, channelId }),
      });
      const data = (await res.json()) as ChatResponse;

      onChange([
        ...next,
        {
          role: "assistant",
          content: data.message || "(no response)",
          jobs: data.jobs,
          suggestions: data.suggestions,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      onChange([...next, { role: "assistant", content: `Error: ${message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const channel = getChannel(channelId);
  // A conversation with no user turn yet is "new" — offer the channel picker so the
  // creator chooses a niche before describing the video.
  const isNewChat = !messages.some((m) => m.role === "user");
  const canSend = input.trim().length > 0 && !loading;
  const suggestions = loading ? [] : nextActions(messages, channel.starters);

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        <div ref={contentRef} className="flex w-full flex-col">
          {messages.map((m, idx) => {
            const prev = messages[idx - 1];
            const isGroupStart = !prev || prev.role !== m.role;
            return (
              <MessageBubble
                key={idx}
                message={m}
                isGroupStart={isGroupStart}
                selectedJobId={selectedJobId}
                onSelectJob={onSelectJob}
              />
            );
          })}
          {isNewChat && !loading && (
            <ChannelPicker channelId={channel.id} onSelect={onSelectChannel} />
          )}
          {loading && <TypingIndicator />}
        </div>
      </div>

      <div className="px-3 pb-3 pt-1">
        {suggestions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="cursor-pointer rounded-full border border-[#ededed] bg-white px-2.5 py-1 text-[12px] text-[#525252] transition-colors hover:bg-[#f5f5f5]"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-[#e5e5e5] bg-white px-3 pb-2 pt-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-[#d4d4d4]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a follow-up…"
            disabled={loading}
            rows={1}
            autoFocus
            className="max-h-[140px] w-full resize-none bg-transparent text-[14px] leading-6 text-[#171717] placeholder-[#a3a3a3] outline-none disabled:opacity-60"
          />
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <ComposerIcon label="Attach output files" onClick={onOpenFiles}>
                <Plus className="h-[18px] w-[18px]" />
              </ComposerIcon>
              <ComposerIcon label="Comment">
                <MessageSquare className="h-[17px] w-[17px]" />
              </ComposerIcon>
              <ComposerIcon label="Add image">
                <ImageIcon className="h-[17px] w-[17px]" />
              </ComposerIcon>
            </div>
            <button
              type="button"
              onClick={() => send()}
              disabled={!canSend}
              aria-label={canSend ? "Send" : "Dictate"}
              title={canSend ? "Send" : "Dictate"}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                canSend
                  ? "cursor-pointer bg-[#171717] text-white hover:bg-black"
                  : "cursor-not-allowed bg-[#171717] text-white opacity-90",
              )}
            >
              {canSend ? <ArrowUp className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComposerIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[#8f8f8f] hover:bg-[#f5f5f5]"
    >
      {children}
    </button>
  );
}

// Shown on a fresh conversation: pick the channel (niche) this video belongs to. The
// selected card sets the script voice and art style; the starter chips update to match.
function ChannelPicker({
  channelId,
  onSelect,
}: {
  channelId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-1 px-1">
      <div className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[#a3a3a3]">
        Choose a channel
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {CHANNELS.map((c) => {
          const selected = c.id === channelId;
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              aria-pressed={selected}
              className={cn(
                "flex cursor-pointer flex-col rounded-xl border p-3 text-left transition-colors",
                selected
                  ? "border-[#171717] bg-[#fafafa]"
                  : "border-[#ededed] bg-white hover:bg-[#fafafa]",
              )}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#171717]">
                <Icon className="h-[18px] w-[18px] shrink-0 text-[#171717]" />
                {c.name}
              </span>
              <span className="mt-1 text-[12px] leading-snug text-[#8f8f8f]">{c.tagline}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

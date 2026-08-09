"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { CHANNELS, getChannel } from "@/lib/channels";
import { cn } from "@/lib/utils";

// Compact channel picker for the toolbar. Shows the active channel; clicking opens a
// menu of every channel (the "ideas" the app can produce). Changing it re-brands the
// conversation's script voice and image style for the next turn.
export function ChannelSwitcher({
  channelId,
  onSelect,
}: {
  channelId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = getChannel(channelId);
  const ActiveIcon = active.icon;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch channel"
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#ededed] px-2 py-1 text-[13px] text-[#171717] hover:bg-[#f5f5f5]"
      >
        <ActiveIcon className="h-[17px] w-[17px] shrink-0 text-[#171717]" />
        <span className="hidden max-w-[140px] truncate font-medium sm:inline">{active.name}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[#8f8f8f]" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close channel menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute left-0 top-[calc(100%+6px)] z-50 w-[280px] overflow-hidden rounded-xl border border-[#ededed] bg-white p-1 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.25)]"
          >
            {CHANNELS.map((c) => {
              const selected = c.id === active.id;
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#f5f5f5]",
                    selected && "bg-[#f5f5f5]",
                  )}
                >
                  <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#171717]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[13px] font-medium text-[#171717]">{c.name}</span>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[#171717]" />}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-[#8f8f8f]">
                      {c.tagline}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { UserButton } from "@clerk/nextjs";
import { MessageSquarePlus, PanelLeftClose, Search, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ConversationMeta } from "@/lib/types";

type Props = {
  conversations: ConversationMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
};

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: Props) {
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-[#ededed] bg-white">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-[14px] font-semibold text-[#171717]">Chats</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[#525252] hover:bg-[#f5f5f5]"
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={onNew}
          className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg bg-[#171717] px-3 text-[13px] font-medium text-white hover:bg-black"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="flex h-9 items-center gap-2 rounded-lg border border-[#ededed] bg-[#fafafa] px-3 text-[#8f8f8f]">
          <Search className="h-4 w-4" />
          <input
            placeholder="Search chats"
            className="h-full flex-1 bg-transparent text-[13px] text-[#171717] placeholder-[#a3a3a3] outline-none"
            // search is decorative for now
            disabled
          />
        </div>
      </div>

      <div className="px-4 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-[#a3a3a3]">
        Recent
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <div className="px-3 py-2 text-[13px] text-[#a3a3a3]">No chats yet</div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li key={c.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "group relative flex h-9 cursor-pointer items-center rounded-lg pl-3 pr-1 text-[13px]",
                      isActive
                        ? "bg-[#f0f0f0] text-[#171717]"
                        : "text-[#525252] hover:bg-[#f5f5f5]",
                    )}
                    onClick={() => onSelect(c.id)}
                  >
                    <span className="line-clamp-1 flex-1 pr-2">{c.title}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Delete this chat?")) onDelete(c.id);
                      }}
                      className={cn(
                        "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[#525252] opacity-0 transition-opacity hover:bg-black/5 group-hover:opacity-100",
                        isActive && "opacity-100",
                      )}
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[#ededed] px-4 py-3">
        <UserButton />
        <span className="text-[13px] text-[#8f8f8f]">Account</span>
      </div>
    </aside>
  );
}

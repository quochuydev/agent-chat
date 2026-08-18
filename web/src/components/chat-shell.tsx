"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChatView } from "@/components/chat-view";
import { ConversationList } from "@/components/conversation-list";
import { FilesDrawer } from "@/components/files-drawer";
import { PreviewCanvas } from "@/components/preview-canvas";
import { Toolbar } from "@/components/toolbar";
import { DEFAULT_CHANNEL_ID } from "@/lib/channels";
import {
  createConversation,
  deleteConversation,
  deriveTitle,
  fetchConversation,
  listConversations,
  saveConversation,
} from "@/lib/conversations";
import type { ConversationMeta, DisplayMessage } from "@/lib/types";

export function ChatShell() {
  const [metas, setMetas] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Messages are loaded lazily per conversation and cached here by id.
  const [messagesById, setMessagesById] = useState<Record<string, DisplayMessage[]>>({});
  const [hydrated, setHydrated] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // The job shown in the right preview canvas (null = follow the latest job).
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesQuery, setFilesQuery] = useState("");
  // Draggable width of the left chat pane (px, md+ screens only). Persisted across sessions.
  const CHAT_MIN_WIDTH = 320;
  const CHAT_MAX_WIDTH = 720;
  const [chatWidth, setChatWidth] = useState(400);
  const [resizing, setResizing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem("chatWidth"));
    if (stored >= CHAT_MIN_WIDTH && stored <= CHAT_MAX_WIDTH) setChatWidth(stored);
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const next = Math.min(CHAT_MAX_WIDTH, Math.max(CHAT_MIN_WIDTH, e.clientX));
      setChatWidth(next);
    };
    const onUp = () => setResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // Suppress text selection while dragging.
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [resizing]);

  useEffect(() => {
    window.localStorage.setItem("chatWidth", String(chatWidth));
  }, [chatWidth]);

  const openFiles = (query = "") => {
    setFilesQuery(query);
    setFilesOpen(true);
  };

  // Debounced PUT so rapid message updates collapse into one write per conversation.
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    (async () => {
      const loaded = await listConversations();
      if (loaded.length === 0) {
        const fresh = await createConversation();
        setMetas([{ id: fresh.id, title: fresh.title, channel: fresh.channel, updatedAt: fresh.updatedAt }]);
        setMessagesById({ [fresh.id]: fresh.messages });
        setActiveId(fresh.id);
      } else {
        setMetas(loaded);
        const first = loaded[0];
        setActiveId(first.id);
        const full = await fetchConversation(first.id);
        if (full) setMessagesById((prev) => ({ ...prev, [first.id]: full.messages }));
      }
      setHydrated(true);
    })();
  }, []);

  const scheduleSave = useCallback(
    (id: string, title: string, messages: DisplayMessage[], channel: string) => {
      clearTimeout(saveTimers.current[id]);
      saveTimers.current[id] = setTimeout(() => {
        void saveConversation(id, title, messages, channel);
      }, 500);
    },
    [],
  );

  const active = activeId
    ? metas.find((c) => c.id === activeId) ?? null
    : null;
  const activeMessages = activeId ? messagesById[activeId] : undefined;

  const handleChange = (messages: DisplayMessage[]) => {
    if (!activeId) return;
    const current = metas.find((c) => c.id === activeId);
    const title =
      current && current.title === "New chat" ? deriveTitle(messages) : current?.title ?? "New chat";
    const channel = current?.channel ?? DEFAULT_CHANNEL_ID;

    setMessagesById((prev) => ({ ...prev, [activeId]: messages }));
    setMetas((prev) =>
      prev
        .map((c) =>
          c.id === activeId ? { ...c, title, updatedAt: Date.now() } : c,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    );
    scheduleSave(activeId, title, messages, channel);
  };

  // Switch the active conversation's channel (toolbar switcher / new-chat cards) and
  // persist it. Only meaningful before the video is built; the choice sticks per chat.
  const handleSelectChannel = (channel: string) => {
    if (!activeId) return;
    const current = metas.find((c) => c.id === activeId);
    if (!current || current.channel === channel) return;
    setMetas((prev) => prev.map((c) => (c.id === activeId ? { ...c, channel } : c)));
    scheduleSave(activeId, current.title, messagesById[activeId] ?? [], channel);
  };

  const handleNew = async () => {
    const fresh = await createConversation();
    setMetas((prev) => [
      { id: fresh.id, title: fresh.title, channel: fresh.channel, updatedAt: fresh.updatedAt },
      ...prev,
    ]);
    setMessagesById((prev) => ({ ...prev, [fresh.id]: fresh.messages }));
    setActiveId(fresh.id);
    setSelectedJobId(null);
    setSidebarOpen(false);
  };

  const handleSelect = async (id: string) => {
    setActiveId(id);
    setSelectedJobId(null);
    setSidebarOpen(false);
    if (!messagesById[id]) {
      const full = await fetchConversation(id);
      if (full) setMessagesById((prev) => ({ ...prev, [id]: full.messages }));
    }
  };

  const handleDelete = async (id: string) => {
    void deleteConversation(id);
    const next = metas.filter((c) => c.id !== id);
    setMessagesById((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
    if (id === activeId) {
      if (next.length > 0) {
        setMetas(next);
        void handleSelect(next[0].id);
      } else {
        const fresh = await createConversation();
        setMetas([{ id: fresh.id, title: fresh.title, channel: fresh.channel, updatedAt: fresh.updatedAt }]);
        setMessagesById({ [fresh.id]: fresh.messages });
        setActiveId(fresh.id);
        return;
      }
    } else {
      setMetas(next);
    }
  };

  if (!hydrated || !active) {
    return <div className="h-full w-full bg-white" />;
  }

  const messages = activeMessages ?? [];
  const jobs = messages.flatMap((m) => m.jobs ?? []);

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <Toolbar
        title={active.title}
        channelId={active.channel}
        onSelectChannel={handleSelectChannel}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onOpenFiles={() => openFiles()}
      />

      <div className="flex min-h-0 flex-1">
        {/* Left: activity log + composer. Width is drag-resizable on md+ screens. */}
        <div
          className="flex w-full shrink-0 flex-col border-r border-[#ededed]"
          style={isDesktop ? { width: chatWidth } : undefined}
        >
          <ChatView
            messages={messages}
            channelId={active.channel}
            onSelectChannel={handleSelectChannel}
            onChange={handleChange}
            selectedJobId={selectedJobId}
            onSelectJob={setSelectedJobId}
            onOpenFiles={() => openFiles()}
          />
        </div>

        {/* Drag handle to resize the chat pane (md+ only). */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat width"
          onMouseDown={() => setResizing(true)}
          className={`hidden w-1 shrink-0 cursor-col-resize md:block ${
            resizing ? "bg-[#0a0a0a]" : "bg-[#ededed] hover:bg-[#d4d4d4]"
          }`}
        />

        {/* Right: preview canvas (hidden on mobile, where the log fills the screen) */}
        <div className="hidden min-w-0 flex-1 md:block">
          <PreviewCanvas jobs={jobs} selectedId={selectedJobId} onOpenJob={openFiles} />
        </div>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex">
          <ConversationList
            conversations={metas}
            activeId={activeId}
            onSelect={handleSelect}
            onNew={handleNew}
            onDelete={handleDelete}
            onClose={() => setSidebarOpen(false)}
          />
          <button
            type="button"
            aria-label="Close sidebar overlay"
            className="flex-1 cursor-pointer bg-black/30"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <FilesDrawer open={filesOpen} onClose={() => setFilesOpen(false)} initialQuery={filesQuery} />
    </div>
  );
}

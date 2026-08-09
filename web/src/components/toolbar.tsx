"use client";

import { UserButton } from "@clerk/nextjs";
import { ChevronDown, Database, Eye, PanelLeft, Star } from "lucide-react";

import { ChannelSwitcher } from "@/components/channel-switcher";
import { ConnectorStatus } from "@/components/connector-status";
import { ImageProviderSwitcher } from "@/components/image-provider-switcher";
import type { ImageProviderId } from "@/lib/image-providers";
import { cn } from "@/lib/utils";

// v0-style top chrome: sidebar/title on the left, the local video-connector status +
// run-command guide in the center, and the account menu on the right. Wired controls:
// the sidebar toggle (☰ + title), the channel switcher, the connector-status pill, and
// the output button (🗄 → Files drawer).
export function Toolbar({
  title,
  channelId,
  onSelectChannel,
  imageProvider,
  onSelectProvider,
  onToggleSidebar,
  onOpenFiles,
}: {
  title: string;
  channelId: string;
  onSelectChannel: (id: string) => void;
  imageProvider: string;
  onSelectProvider: (id: ImageProviderId) => void;
  onToggleSidebar: () => void;
  onOpenFiles: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[#ededed] bg-white pl-2 pr-3">
      {/* Left: sidebar toggle, project title, view switcher */}
      <div className="flex min-w-0 items-center gap-1">
        <IconButton label="Toggle sidebar" onClick={onToggleSidebar}>
          <PanelLeft className="h-[18px] w-[18px]" />
        </IconButton>

        <button
          type="button"
          onClick={onToggleSidebar}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-[#f5f5f5]"
        >
          <Star className="h-4 w-4 shrink-0 text-[#8f8f8f]" />
          <span className="truncate text-[13px] font-medium text-[#171717]">{title}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#8f8f8f]" />
        </button>

        <div className="ml-1 hidden items-center gap-0.5 rounded-lg border border-[#ededed] p-0.5 md:flex">
          <SegButton label="Preview" active>
            <Eye className="h-[17px] w-[17px]" />
          </SegButton>
          <SegButton label="Output files" onClick={onOpenFiles}>
            <Database className="h-[17px] w-[17px]" />
          </SegButton>
        </div>

        <div className="ml-1 flex items-center gap-1.5">
          <ChannelSwitcher channelId={channelId} onSelect={onSelectChannel} />
          <ImageProviderSwitcher providerId={imageProvider} onSelect={onSelectProvider} />
        </div>
      </div>

      {/* Center: local video-connector status + run-command guide */}
      <ConnectorStatus />

      {/* Right: account */}
      <div className="flex items-center gap-1">
        <div className="ml-1 flex items-center">
          <UserButton />
        </div>
      </div>
    </header>
  );
}

function IconButton({
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
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[#525252] hover:bg-[#f5f5f5]"
    >
      {children}
    </button>
  );
}

function SegButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md",
        active ? "bg-[#f0f0f0] text-[#171717]" : "text-[#8f8f8f] hover:bg-[#f5f5f5]",
      )}
    >
      {children}
    </button>
  );
}

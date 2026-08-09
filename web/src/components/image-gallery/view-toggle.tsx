"use client";

import { cn } from "@/lib/utils";

export function ViewToggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-6 w-6 cursor-pointer items-center justify-center rounded-md",
        active ? "bg-[#e7f3ff] text-[#0084ff]" : "text-[#90949c] hover:bg-[#f0f2f5]",
      )}
    >
      {children}
    </button>
  );
}

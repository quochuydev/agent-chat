"use client";

export function TypingIndicator() {
  return (
    <div className="mt-4 flex items-center gap-1 px-2 py-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#bdbdbd] [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#bdbdbd] [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#bdbdbd]" />
    </div>
  );
}

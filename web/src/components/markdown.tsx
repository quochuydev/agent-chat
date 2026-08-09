import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders assistant message text as markdown, styled tight to fit a chat bubble.
// (User messages stay plain — we show exactly what they typed.)
const components: Components = {
  p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0 leading-[1.35]">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-[1.35]">{children}</li>,
  h1: ({ children }) => <h1 className="mb-1 mt-2 text-[16px] font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1 mt-2 text-[15px] font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-[15px] font-semibold first:mt-0">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="my-1 border-l-2 border-[#bcc0c4] pl-2.5 italic text-[#3a3b3c]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-[#d8dadf]" />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="cursor-pointer text-[#0084ff] underline underline-offset-2"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[13px]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-1 overflow-x-auto rounded-lg bg-black/[0.06] p-2.5 font-mono text-[13px]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-[#d8dadf] last:border-0">{children}</tr>,
  th: ({ children }) => (
    <th className="whitespace-nowrap border-b border-[#bcc0c4] px-2.5 py-1.5 text-left align-top font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-2.5 py-1.5 align-top">{children}</td>,
};

export function Markdown({ content }: { content: string }) {
  return (
    <div className="break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

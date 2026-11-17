import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  p: ({ children }) => <p className="mb-2.5 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2.5 ml-5 list-disc space-y-1 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2.5 ml-5 list-decimal space-y-1 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h1 className="mt-5 mb-2.5 text-xl font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-4 mb-2 text-lg font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3.5 mb-1.5 text-base font-semibold first:mt-0">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ children, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--accent)] underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-[var(--accent)] pl-4 text-[var(--secondary)]">
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }) =>
    className?.includes("language-") ? (
      <code className={className} {...props}>{children}</code>
    ) : (
      <code className="rounded bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[0.9em]" {...props}>
        {children}
      </code>
    ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--raised)] p-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-[var(--border)] bg-[var(--subtle)] px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-[var(--border)] px-3 py-2 align-top last:border-b-0">{children}</td>,
  hr: () => <hr className="my-4 border-0 border-t border-[var(--border)]" />,
};

export function RichMarkdown({ children }: { children: string }) {
  return <Markdown remarkPlugins={[remarkGfm]} components={components}>{children}</Markdown>;
}

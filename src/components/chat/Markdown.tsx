// src/components/chat/Markdown.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders an Ask AI answer as actual formatted text instead of raw
 * characters — **bold** shows as bold, not asterisks, and GFM tables (the
 * model reaches for a table whenever it's comparing a few things) render as
 * real <table> markup instead of a wall of pipes. `remark-gfm` is what adds
 * table/strikethrough/task-list support on top of the CommonMark base.
 *
 * Deliberately not memoised beyond React's own reconciliation: answers are
 * capped at 500 output tokens server-side, so re-parsing the whole markdown
 * string on every streamed chunk is cheap.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Tables can run wider than the chat bubble on mobile — scroll the
          // table itself rather than letting it blow out the page.
          table: ({ children }) => <div className="overflow-x-auto">{children}</div>,
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
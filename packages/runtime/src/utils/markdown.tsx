import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders a markdown string into React nodes. Supports the GFM subset
 * (bold, italic, code, links, ordered/unordered lists, autolinks).
 *
 * Used for hotspot labels, callout bodies, and text annotations so demo
 * authors can write rich content without escaping into JSX. Returns
 * `null` for empty input.
 */
export function Markdown({ text }: { text: string | undefined | null }) {
  if (!text) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, ...rest }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            {...rest}
          >
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

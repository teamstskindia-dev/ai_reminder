import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { safeHref, safeImageSrc } from '@/lib/security/safe-url';
import { cn } from '@/lib/utils';

const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Every URL in markdown goes through the allow-list; blocked ones are dropped (links render as text). */
function transformUrl(url: string, key: string): string | null {
  if (key === 'src') return safeImageSrc(url);
  if (key === 'href') return safeHref(url);
  return null;
}

/**
 * Renders user/AI markdown with GitHub-flavoured extensions. Raw HTML is never rendered (no rehype-raw), and
 * root-relative links point at the public website because previews show website content.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('markdown-body', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={transformUrl}
        components={{
          a: ({ href, children: label }) => {
            if (!href) return <span className="underline decoration-dotted">{label}</span>;
            const absolute = href.startsWith('/') ? `${WEB_URL}${href}` : href;
            return (
              <a href={absolute} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

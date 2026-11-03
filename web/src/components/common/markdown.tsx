import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeImageUrl, safeUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";

/** react-markdown passes its AST `node` as a prop; keep it off the DOM element. */
function withoutNode<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const copy = { ...props };
  delete copy.node;
  return copy;
}

// No rehype-raw: raw HTML in markdown is never rendered. Links and images go through the URL allow-list.
const components: Components = {
  a: (allProps) => {
    const { href, children, ...props } = withoutNode(allProps);
    const safe = safeUrl(href);
    if (!safe) return <span>{children}</span>;
    const external = /^https?:/i.test(safe);
    return (
      <a href={safe} {...props} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {children}
      </a>
    );
  },
  img: (allProps) => {
    const { src, alt, ...props } = withoutNode(allProps);
    const safe = typeof src === "string" ? safeImageUrl(src) : null;
    if (!safe) return null;
    // eslint-disable-next-line @next/next/no-img-element -- markdown images come from arbitrary (allow-listed) hosts
    return <img src={safe} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" {...props} />;
  },
};

/** Markdown with GitHub-flavoured extensions and typography styling. Works in server and client components. */
export function Markdown({
  children,
  className,
  size = "base",
}: {
  children: string;
  className?: string;
  size?: "sm" | "base" | "lg";
}) {
  return (
    <div
      className={cn(
        "prose max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-li:marker:text-primary/70",
        size === "sm" && "prose-sm",
        size === "lg" && "prose-lg",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

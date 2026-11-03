import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { safeUrl } from "@/lib/safe-url";

/**
 * Link for config / CMS / notification-provided hrefs. Every href goes through `safeUrl`:
 * unsafe values (javascript:, data:, //host, …) render as plain text. Internal paths use next/link;
 * http(s) URLs open in a new tab with rel="noopener noreferrer"; mailto: renders a plain anchor.
 */
export function SmartLink({
  href,
  external,
  children,
  ...props
}: Omit<ComponentProps<"a">, "href" | "target" | "rel"> & { href: string | null | undefined; external?: boolean; children: ReactNode }) {
  const safe = safeUrl(href);
  if (!safe) return <span className={props.className}>{children}</span>;
  if (/^https?:/i.test(safe)) {
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  }
  if (safe.startsWith("mailto:") || external) {
    return (
      <a href={safe} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={safe} {...props}>
      {children}
    </Link>
  );
}

import { Smartphone } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { checkUrl, safeLinkProps } from '@/lib/security/safe-url';
import { cn } from '@/lib/utils';

type SafeLinkProps = Omit<ComponentProps<'a'>, 'href' | 'target' | 'rel'> & {
  href: string | null | undefined;
  children: ReactNode;
};

/**
 * `<a>` for URLs that come from data. Only allow-listed URLs become links (external ones get
 * `target="_blank" rel="noopener noreferrer"`); `remi://` deep links render as text, and blocked URLs
 * (javascript:, data:, …) render as inert text.
 */
export function SafeLink({ href, children, className, ...rest }: SafeLinkProps) {
  const props = safeLinkProps(href);
  if (props) {
    return (
      <a {...rest} {...props} className={className}>
        {children}
      </a>
    );
  }
  const check = checkUrl(href, 'link');
  const isAppLink = check.ok && check.kind === 'app';
  return (
    <span
      className={cn(className, !isAppLink && 'cursor-not-allowed opacity-70')}
      title={isAppLink ? 'App deep link — opens in the mobile app only' : 'Link disabled: the URL is not allowed'}
    >
      {children}
      {isAppLink ? <Smartphone className="ml-1 inline size-3" aria-hidden /> : null}
    </span>
  );
}

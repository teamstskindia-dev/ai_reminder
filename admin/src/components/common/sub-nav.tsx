'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

interface SubNavItem {
  href: string;
  label: string;
  /** Match nested routes too (default true except for the first/index item). */
  exact?: boolean;
}

/** Tab-style links between sibling pages (e.g. AI settings / prompts / playground). */
export function SubNav({ items, className }: { items: SubNavItem[]; className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Section" className={cn('mb-6 border-b', className)}>
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

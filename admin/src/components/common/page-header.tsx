import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  /** Small line under the title (badges, timestamps). */
  meta?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, back, meta, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0 space-y-1.5">
        {back ? (
          <Button variant="link" size="sm" asChild className="-ml-2.5 h-auto px-2.5 text-muted-foreground">
            <Link href={back.href}>
              <ArrowLeft /> {back.label}
            </Link>
          </Button>
        ) : null}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
        {meta ? <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

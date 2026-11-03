import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface FormSectionProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Stack the heading above the fields instead of the two-column layout. */
  stacked?: boolean;
  actions?: ReactNode;
}

/** A titled group of fields: heading + description on the left, fields on the right (stacked on small screens). */
export function FormSection({ title, description, children, className, stacked = false, actions }: FormSectionProps) {
  return (
    <section
      className={cn(
        'grid gap-x-8 gap-y-5 rounded-xl border bg-card p-5 text-card-foreground shadow-xs sm:p-6',
        !stacked && 'lg:grid-cols-3',
        className,
      )}
    >
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          {actions}
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className={cn('flex min-w-0 flex-col gap-5', !stacked && 'lg:col-span-2')}>{children}</div>
    </section>
  );
}

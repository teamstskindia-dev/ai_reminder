'use client';

import { AlertTriangle, Inbox, Lock, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage, getErrorReference, isApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

import { ErrorReference } from './error-reference';

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <Empty className={cn('border border-dashed', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon ?? <Inbox />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}

export function ErrorState({ error, onRetry, title, className }: ErrorStateProps) {
  const forbidden = isApiError(error) && error.code === 'FORBIDDEN';
  const notFound = isApiError(error) && error.status === 404;
  const reference = getErrorReference(error);
  return (
    <Empty className={cn('border border-dashed border-destructive/30', className)} role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="text-destructive">
          {forbidden ? <Lock /> : <AlertTriangle />}
        </EmptyMedia>
        <EmptyTitle>
          {title ?? (forbidden ? 'You do not have access' : notFound ? 'Not found' : 'Could not load this data')}
        </EmptyTitle>
        <EmptyDescription>
          {forbidden ? "You don't have permission to view this. Ask a super admin if you need access." : getErrorMessage(error)}
        </EmptyDescription>
        {reference ? <ErrorReference reference={reference} className="justify-center" /> : null}
      </EmptyHeader>
      {onRetry && !forbidden && !notFound ? (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw /> Try again
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export function FormSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: Math.ceil(rows / 3) }, (_, s) => (
        <div key={s} className="grid gap-6 rounded-xl border p-6 lg:grid-cols-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="space-y-4 lg:col-span-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

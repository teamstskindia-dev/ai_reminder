import { AlertTriangle, RotateCcw, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getErrorInfo } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      {Icon && (
        <div className={cn("grid place-items-center rounded-full bg-brand-soft text-brand-soft-foreground", compact ? "size-10" : "size-12")}>
          <Icon className={compact ? "size-5" : "size-6"} aria-hidden="true" />
        </div>
      )}
      <div className="space-y-1">
        <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>{title}</p>
        {description && <div className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</div>}
      </div>
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = "Couldn't load this",
  className,
  compact = false,
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
  compact?: boolean;
}) {
  const info = getErrorInfo(error);
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className,
      )}
    >
      <div className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{info.message}</p>
        {info.reference && (
          <p className="text-xs text-muted-foreground">
            Reference: <code className="font-mono">{info.reference}</code>
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw /> Try again
          </Button>
        )}
        {info.action && (
          <Button size="sm" asChild>
            <Link href={info.action.href}>{info.action.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

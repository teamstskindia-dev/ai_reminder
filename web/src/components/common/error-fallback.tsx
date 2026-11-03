"use client";

import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getErrorInfo } from "@/lib/api/errors";
import { reportError } from "@/lib/logger";
import { cn } from "@/lib/utils";

/**
 * Shared UI for route error boundaries: friendly copy (never raw server text), the reference id
 * (API request id or Next's error digest) and "Try again". Reports the error once on mount.
 */
export function ErrorFallback({
  error,
  onRetry,
  where,
  title = "Something went wrong",
  homeHref = "/",
  className,
}: {
  error: unknown;
  onRetry: () => void;
  where: string;
  title?: string;
  homeHref?: string;
  className?: string;
}) {
  useEffect(() => {
    reportError(error, { where });
  }, [error, where]);

  const info = getErrorInfo(error, "An unexpected error occurred while loading this page.");

  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-4 px-4 py-16 text-center", className)}>
      <div className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{info.message}</p>
        {info.reference && (
          <p className="text-xs text-muted-foreground">
            Reference: <code className="rounded bg-muted px-1 py-0.5 font-mono">{info.reference}</code>
          </p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onRetry}>
          <RotateCcw /> Try again
        </Button>
        {info.action ? (
          <Button variant="outline" asChild>
            <Link href={info.action.href}>{info.action.label}</Link>
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link href={homeHref}>
              <Home /> Go home
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Props Next 16 passes to `error.tsx` boundaries. */
export interface BoundaryProps {
  error: unknown;
  reset: () => void;
  retry?: () => void;
}

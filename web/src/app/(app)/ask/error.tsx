"use client";

import { ErrorFallback, type BoundaryProps } from "@/components/common/error-fallback";

export default function AskError({ error, reset, retry }: BoundaryProps) {
  return <ErrorFallback error={error} onRetry={retry ?? reset} where="ask" title="Ask AI ran into a problem" homeHref="/dashboard" className="rounded-xl border bg-card" />;
}

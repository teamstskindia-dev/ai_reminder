"use client";

import { ErrorFallback, type BoundaryProps } from "@/components/common/error-fallback";

export default function AppError({ error, reset, retry }: BoundaryProps) {
  return <ErrorFallback error={error} onRetry={retry ?? reset} where="app" title="This page hit a problem" homeHref="/dashboard" className="rounded-xl border bg-card" />;
}

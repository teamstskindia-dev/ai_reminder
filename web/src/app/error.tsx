"use client";

import { ErrorFallback, type BoundaryProps } from "@/components/common/error-fallback";

export default function RootError({ error, reset, retry }: BoundaryProps) {
  return <ErrorFallback error={error} onRetry={retry ?? reset} where="root" title="Something went wrong" homeHref="/" className="min-h-svh" />;
}

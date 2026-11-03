"use client";

import { ErrorFallback, type BoundaryProps } from "@/components/common/error-fallback";

export default function MarketingError({ error, reset, retry }: BoundaryProps) {
  return <ErrorFallback error={error} onRetry={retry ?? reset} where="marketing" title="Something went wrong" homeHref="/" className="min-h-[60vh]" />;
}

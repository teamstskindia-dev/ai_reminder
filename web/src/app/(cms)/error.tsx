"use client";

import { ErrorFallback, type BoundaryProps } from "@/components/common/error-fallback";

export default function CmsError({ error, reset, retry }: BoundaryProps) {
  return <ErrorFallback error={error} onRetry={retry ?? reset} where="cms" title="We couldn't load this page" homeHref="/" className="min-h-[60vh]" />;
}

"use client";

import { ErrorFallback, type BoundaryProps } from "@/components/common/error-fallback";

export default function ReportError({ error, reset, retry }: BoundaryProps) {
  return <ErrorFallback error={error} onRetry={retry ?? reset} where="report-detail" title="We couldn't show this report" homeHref="/analytics/reports" className="rounded-xl border bg-card" />;
}

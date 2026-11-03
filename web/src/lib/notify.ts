"use client";

import { toast } from "sonner";
import { getErrorInfo } from "@/lib/api/errors";

/** Error toast with the friendly message, the reference id (5xx) and an optional action (e.g. upgrade). */
export function toastError(error: unknown, title?: string) {
  const info = getErrorInfo(error);
  const description = [title ? info.message : null, info.reference ? `Reference: ${info.reference}` : null]
    .filter(Boolean)
    .join(" · ");
  toast.error(title ?? info.message, {
    description: description || undefined,
    action: info.action
      ? {
          label: info.action.label,
          onClick: () => window.location.assign(new URL(info.action!.href, window.location.origin).href),
        }
      : undefined,
  });
}

"use client";

import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  FileCheck2,
  ListChecks,
  Megaphone,
  Newspaper,
  type LucideIcon,
} from "lucide-react";
import type { AppNotification, NotificationType } from "@/lib/api/types";
import { timeAgo } from "@/lib/format";
import { reportHref } from "@/lib/routes";
import { safeUrl } from "@/lib/safe-url";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  meeting_upcoming: { icon: CalendarClock, className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  report_ready: { icon: FileCheck2, className: "bg-brand-soft text-primary" },
  action_item_due: { icon: ListChecks, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  reminder: { icon: BellRing, className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  daily_digest: { icon: Newspaper, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  bot_failed: { icon: AlertTriangle, className: "bg-destructive/10 text-destructive" },
  broadcast: { icon: Megaphone, className: "bg-brand-accent/10 text-brand-accent" },
};

/** In-app destination for a notification. Only same-origin paths are followed (via `safeUrl`). */
export function notificationHref(n: AppNotification): string | null {
  const url = typeof n.data?.url === "string" ? safeUrl(n.data.url) : null;
  if (url && url.startsWith("/")) return url;
  if (typeof n.data?.meetingId === "string" && n.data.meetingId) return reportHref(n.data.meetingId);
  if (typeof n.data?.actionItemId === "string" && n.data.actionItemId) return "/action-items";
  if (typeof n.data?.reminderId === "string" && n.data.reminderId) return "/reminders";
  return null;
}

export function NotificationItem({
  notification,
  onOpen,
  compact = false,
}: {
  notification: AppNotification;
  onOpen: (n: AppNotification) => void;
  compact?: boolean;
}) {
  const meta = TYPE_ICON[notification.type] ?? TYPE_ICON.broadcast;
  const Icon = meta.icon;
  const unread = !notification.readAt;

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={cn(
        "flex w-full items-start gap-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
        compact ? "px-4 py-3" : "px-5 py-4",
        unread && "bg-brand-soft/40",
      )}
    >
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", meta.className)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className={cn("block text-sm", unread ? "font-semibold" : "font-medium text-foreground/90")}>
          {notification.title}
        </span>
        {notification.body && (
          <span className={cn("block text-sm text-muted-foreground", compact && "line-clamp-2")}>{notification.body}</span>
        )}
        <span className="block text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</span>
      </span>
      {unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
    </button>
  );
}

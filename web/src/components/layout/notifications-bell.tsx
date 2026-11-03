"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { notificationHref, NotificationItem } from "@/components/notifications/notification-item";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/hooks/queries/use-notifications";
import type { AppNotification } from "@/lib/api/types";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const unread = useUnreadCount();
  const list = useNotifications({ page: 1, limit: 8 }, { enabled: open });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const count = unread.data?.count ?? 0;

  const openNotification = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    const href = notificationHref(n);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="relative" aria-label={count ? `Notifications, ${count} unread` : "Notifications"}>
          <Bell />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground ring-2 ring-background">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="xs"
            disabled={count === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="max-h-[420px] divide-y overflow-y-auto">
          {list.isPending ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : list.isError ? (
            <ErrorState compact error={list.error} onRetry={() => list.refetch()} />
          ) : list.data.items.length === 0 ? (
            <EmptyState compact icon={Bell} title="You're all caught up" description="New reports, reminders and alerts will show up here." />
          ) : (
            list.data.items.map((n) => <NotificationItem key={n.id} notification={n} onOpen={openNotification} compact />)
          )}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

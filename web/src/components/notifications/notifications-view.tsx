"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/common/page-header";
import { Pager } from "@/components/common/pager";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/hooks/queries/use-notifications";
import type { AppNotification } from "@/lib/api/types";
import { notificationHref, NotificationItem } from "./notification-item";

export function NotificationsView() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const list = useNotifications({ unreadOnly, page, limit: 25 });
  const unread = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const items = list.data?.items ?? [];
  const count = unread.data?.count ?? 0;

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    const href = notificationHref(n);
    if (href) router.push(href);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Reports, reminders and alerts from your meetings."
        actions={
          <Button variant="outline" disabled={count === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
            <CheckCheck /> Mark all as read
          </Button>
        }
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="border-b p-3 sm:px-5">
          <Tabs
            value={unreadOnly ? "unread" : "all"}
            onValueChange={(v) => {
              setUnreadOnly(v === "unread");
              setPage(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="all" className="px-3">
                All
              </TabsTrigger>
              <TabsTrigger value="unread" className="px-3">
                Unread
                {count > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{count}</span>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {list.isPending ? (
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-5 py-4">
                <Skeleton className="size-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} title="Couldn't load notifications" />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={unreadOnly ? "No unread notifications" : "No notifications yet"}
            description={unreadOnly ? "You're all caught up." : "You'll be notified when reports are ready, reminders fire, or the notetaker needs attention."}
          />
        ) : (
          <div className="divide-y">
            {items.map((n) => (
              <NotificationItem key={n.id} notification={n} onOpen={open} />
            ))}
          </div>
        )}
        <Pager meta={list.data?.meta} onPageChange={setPage} disabled={list.isFetching} />
      </div>
    </div>
  );
}

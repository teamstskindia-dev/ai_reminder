"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlarmClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { notificationHref } from "@/components/notifications/notification-item";
import { refreshSession } from "@/lib/api/client";
import type { AppNotification, MeetingUpdatedEvent, Reminder } from "@/lib/api/types";
import { PUBLIC_API_URL } from "@/lib/env";
import { logger } from "@/lib/logger";
import { STATUS_META } from "@/lib/meeting";
import { qk } from "@/lib/query-keys";
import { patchMeetingInCache } from "@/hooks/queries/use-meetings";

const TOAST_WINDOW_MS = 10_000;
const MAX_TOASTS_PER_WINDOW = 3;

/** Lets a burst of events through as at most N toasts per window, then one summary toast. */
function createToastThrottle() {
  let windowStart = 0;
  let shown = 0;
  let suppressed = 0;
  let summaryTimer: ReturnType<typeof setTimeout> | null = null;
  const seen = new Set<string>();

  return {
    allow(id: string): boolean {
      if (seen.has(id)) return false; // never toast the same event twice (e.g. after a reconnect)
      seen.add(id);
      if (seen.size > 200) seen.delete(seen.values().next().value as string);
      const now = performance.now();
      if (now - windowStart > TOAST_WINDOW_MS) {
        windowStart = now;
        shown = 0;
      }
      if (shown < MAX_TOASTS_PER_WINDOW) {
        shown += 1;
        return true;
      }
      suppressed += 1;
      if (!summaryTimer) {
        summaryTimer = setTimeout(() => {
          if (suppressed > 0) toast(`${suppressed} more update${suppressed === 1 ? "" : "s"}`, { description: "Open notifications to see everything." });
          suppressed = 0;
          summaryTimer = null;
        }, TOAST_WINDOW_MS);
      }
      return false;
    },
    dispose() {
      if (summaryTimer) clearTimeout(summaryTimer);
    },
  };
}

const isAuthError = (message: string) => /unauthori[sz]ed|jwt|token|expired|401|forbidden/i.test(message);

/**
 * One Socket.IO connection per signed-in tab (`/realtime` namespace, cookie auth).
 * Server events update the TanStack Query cache and surface (throttled) toasts.
 */
export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const throttle = createToastThrottle();
    const socket: Socket = io(`${PUBLIC_API_URL}/realtime`, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      // Built-in exponential backoff with jitter for non-auth failures.
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
    });
    let refreshedForAuth = false;
    let hadConnection = false;
    let failureStreak = 0;

    const resync = () => {
      // Catch up on anything missed while disconnected.
      void queryClient.invalidateQueries({ queryKey: qk.notifications.all });
      void queryClient.invalidateQueries({ queryKey: qk.meetings.all });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    };

    socket.on("connect", () => {
      logger.debug("realtime connected");
      if (hadConnection) resync();
      hadConnection = true;
      refreshedForAuth = false;
      failureStreak = 0;
    });

    socket.on("connect_error", async (error: Error) => {
      if (isAuthError(error.message) && !refreshedForAuth) {
        // Access cookie expired or dropped: refresh once, then reconnect.
        refreshedForAuth = true;
        logger.info("realtime auth failed; refreshing session");
        if (await refreshSession()) socket.connect();
        return;
      }
      failureStreak += 1;
      // Warn once per outage; further attempts (with backoff) are debug-only to keep logs quiet.
      if (failureStreak === 1) logger.warn("realtime connection failed; retrying with backoff", { reason: error.message });
      else logger.debug("realtime reconnect attempt failed", { attempt: failureStreak });
    });

    socket.on("disconnect", (reason) => {
      logger.debug("realtime disconnected", { reason });
      // A server-side disconnect is not retried automatically (e.g. the session was rejected).
      if (reason === "io server disconnect") {
        void refreshSession().then((ok) => {
          if (ok) socket.connect();
        });
      }
    });

    socket.on("notification:new", (notification: AppNotification) => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications.all });
      if (notification.type === "report_ready" || notification.type === "bot_failed") {
        void queryClient.invalidateQueries({ queryKey: qk.meetings.all });
        void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      }
      if (!throttle.allow(`n:${notification.id}`)) return;
      const href = notificationHref(notification);
      toast(notification.title, {
        description: notification.body ?? undefined,
        action: href ? { label: "Open", onClick: () => router.push(href) } : undefined,
      });
    });

    socket.on("meeting:updated", (event: MeetingUpdatedEvent) => {
      if (!event?.id || !(event.status in STATUS_META)) return;
      patchMeetingInCache(queryClient, event.id, { status: event.status });
      void queryClient.invalidateQueries({ queryKey: qk.meetings.all });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      // Failures also arrive as a `bot_failed` notification, so only toast when that won't happen soon.
      if (event.status === "failed" && throttle.allow(`m:${event.id}:failed`)) {
        toast.error("The notetaker couldn't complete a meeting", {
          description: event.failureReason ?? STATUS_META.failed.description,
        });
      }
    });

    socket.on("reminder:fired", (reminder: Reminder) => {
      void queryClient.invalidateQueries({ queryKey: qk.reminders.all });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      if (!throttle.allow(`r:${reminder.id}:${reminder.remindAt}`)) return;
      toast(reminder.title, {
        description: reminder.body ?? undefined,
        icon: <AlarmClock className="size-4" />,
        duration: 10_000,
        action: reminder.meetingId
          ? { label: "Open meeting", onClick: () => router.push(`/analytics/reports/${encodeURIComponent(reminder.meetingId as string)}`) }
          : undefined,
      });
    });

    return () => {
      throttle.dispose();
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [enabled, queryClient, router]);

  return <>{children}</>;
}

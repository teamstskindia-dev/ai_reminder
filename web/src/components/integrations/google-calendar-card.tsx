"use client";

import { AlertTriangle, CalendarCheck2, Link2Off, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { GoogleMark } from "@/components/auth/google-button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisconnectCalendar, useGoogleCalendarIntegration, useSyncCalendar } from "@/hooks/queries/use-integrations";
import { getErrorMessage } from "@/lib/api/errors";
import { timeAgo } from "@/lib/format";
import { useBranding, useFeature } from "@/providers/config-provider";

export function GoogleCalendarCard() {
  const pathname = usePathname();
  const { appName } = useBranding();
  const enabled = useFeature("calendarSync");
  const { integration, isPending, isError, error, refetch } = useGoogleCalendarIntegration();
  const sync = useSyncCalendar();
  const disconnect = useDisconnectCalendar();
  const reconnectHref = `/auth/google?next=${encodeURIComponent(pathname)}`;
  const connected = Boolean(integration?.connected);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-background shadow-xs">
            <GoogleMark className="size-6" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Google Calendar</p>
              {isPending ? (
                <Skeleton className="h-5 w-20 rounded-full" />
              ) : connected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <CalendarCheck2 className="size-3" aria-hidden="true" /> Connected
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Not connected</span>
              )}
            </div>
            {isError ? (
              <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
            ) : !enabled ? (
              <p className="text-sm text-muted-foreground">Calendar sync is turned off for now.</p>
            ) : connected ? (
              <p className="truncate text-sm text-muted-foreground">
                {integration?.accountEmail ?? "Your Google account"}
                {integration?.lastSyncedAt ? ` · Synced ${timeAgo(integration.lastSyncedAt)}` : " · Waiting for first sync"}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Connect your calendar so {appName} can join your Google Meet calls automatically.
              </p>
            )}
            {integration?.syncError && (
              <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {integration.syncError}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {isError ? (
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw /> Retry
            </Button>
          ) : connected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!enabled || sync.isPending}
                onClick={() =>
                  sync.mutate(undefined, {
                    onSuccess: () => toast.success("Sync started", { description: "New meetings will appear in a moment." }),
                  })
                }
              >
                <RefreshCw className={sync.isPending ? "animate-spin" : undefined} /> Sync now
              </Button>
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={disconnect.isPending}>
                    <Link2Off /> Disconnect
                  </Button>
                }
                title="Disconnect Google Calendar?"
                description={`${appName} will stop syncing your calendar and cancel the notetaker for upcoming meetings. Past reports are kept.`}
                confirmLabel="Disconnect"
                destructive
                onConfirm={() =>
                  disconnect.mutate(undefined, {
                    onSuccess: () => toast.success("Google Calendar disconnected"),
                  })
                }
              />
            </>
          ) : (
            !isPending &&
            enabled && (
              <Button asChild size="sm">
                <a href={reconnectHref}>{integration ? "Reconnect" : "Connect"} Google Calendar</a>
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}

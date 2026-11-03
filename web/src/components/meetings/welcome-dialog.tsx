"use client";

import { CalendarCheck2, Video } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useMeetings } from "@/hooks/queries/use-meetings";
import { formatRelativeDateTime } from "@/lib/format";
import { botSupported } from "@/lib/meeting";
import { reportHref } from "@/lib/routes";
import { useBranding } from "@/providers/config-provider";

/** Shown once after the first Google sign-in (`?action=welcomeCalendarSuccess`). */
export function WelcomeCalendarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { appName } = useBranding();
  const upcoming = useMeetings({ scope: "upcoming", limit: 5, page: 1 }, { enabled: open });
  const meetings = upcoming.data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          <div className="mb-2 grid size-14 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CalendarCheck2 className="size-7" aria-hidden="true" />
          </div>
          <DialogTitle className="text-xl">Calendar connected</DialogTitle>
          <DialogDescription>
            {appName} will join your upcoming Google Meet calls, take notes and send you a report when each one ends.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border">
          <p className="border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">Up next</p>
          {upcoming.isPending ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : meetings.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No upcoming meetings with a Meet link yet. New ones will appear here as soon as they&apos;re synced.
            </p>
          ) : (
            <ul className="divide-y">
              {meetings.map((m) => (
                <li key={m.id}>
                  <Link
                    href={reportHref(m.id)}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50"
                  >
                    <Video className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.title}</span>
                      <span className="block text-xs text-muted-foreground">{formatRelativeDateTime(m.startAt)}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {botSupported(m) ? (m.autoJoin ? "Will join" : "Skipping") : "Not supported"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" asChild>
            <Link href="/calendar" onClick={() => onOpenChange(false)}>
              Review calendar
            </Link>
          </Button>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

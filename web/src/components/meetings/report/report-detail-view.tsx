"use client";

import { FileSearch } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMeeting } from "@/hooks/queries/use-meetings";
import { useSession } from "@/hooks/queries/use-session";
import { isApiError } from "@/lib/api/errors";
import { isLive } from "@/lib/meeting";
import { useFeature } from "@/providers/config-provider";
import { ActionItemsTab } from "./action-items-tab";
import { ParticipantsTab } from "./participants-tab";
import { ReportHeader } from "./report-header";
import { ScoreCards } from "./score-cards";
import { StatusPanel } from "./status-panel";
import { SummaryTab } from "./summary-tab";
import { TranscriptTab } from "./transcript-tab";

type Tab = "summary" | "action-items" | "transcript" | "participants";

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

export function ReportDetailView() {
  const { id } = useParams<{ id: string }>();
  const meeting = useMeeting(id);
  const session = useSession();
  const actionItemsEnabled = useFeature("actionItems");
  const [tab, setTab] = useState<Tab>("summary");
  const [focusMs, setFocusMs] = useState<number | null>(null);

  // Poll as a safety net while the meeting is live or processing (realtime events also update it).
  const status = meeting.data?.status;
  const polling = status && (isLive(status) || status === "processing");
  useMeetingPolling(meeting.refetch, Boolean(polling));

  if (meeting.isPending) return <DetailSkeleton />;
  if (meeting.isError) {
    const notFound = isApiError(meeting.error) && (meeting.error.status === 404 || meeting.error.code === "NOT_FOUND");
    return (
      <div className="rounded-xl border bg-card">
        {notFound ? (
          <EmptyState
            icon={FileSearch}
            title="Report not found"
            description="This meeting may have been deleted, or it belongs to another account."
            action={
              <Button asChild variant="outline">
                <Link href="/analytics/reports">Back to reports</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={meeting.error} onRetry={() => meeting.refetch()} title="Couldn't load this report" />
        )}
      </div>
    );
  }

  const m = meeting.data;
  const report = m.report;
  const botName = session.data?.settings.botName || "The notetaker";
  const openItems = m.actionItems.filter((i) => i.status === "open").length;

  return (
    <div className="space-y-6">
      <ReportHeader meeting={m} />

      {(!report || m.status !== "completed") && <StatusPanel meeting={m} botName={botName} />}

      {report && (
        <>
          <ScoreCards report={report} />
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <TabsList variant="line" className="h-10 w-max justify-start border-b">
                <TabsTrigger value="summary" className="px-3">
                  Summary
                </TabsTrigger>
                {actionItemsEnabled && (
                  <TabsTrigger value="action-items" className="px-3">
                    Action items
                    {openItems > 0 && (
                      <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{openItems}</span>
                    )}
                  </TabsTrigger>
                )}
                <TabsTrigger value="transcript" className="px-3">
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="participants" className="px-3">
                  Participants
                  <span className="ml-1 text-xs text-muted-foreground">{m.participants.length}</span>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="summary">
              <SummaryTab
                report={report}
                onJumpTo={(ms) => {
                  setFocusMs(ms);
                  setTab("transcript");
                }}
              />
            </TabsContent>
            {actionItemsEnabled && (
              <TabsContent value="action-items">
                <ActionItemsTab meetingId={m.id} items={m.actionItems} />
              </TabsContent>
            )}
            <TabsContent value="transcript">
              <TranscriptTab meetingId={m.id} focusMs={focusMs} />
            </TabsContent>
            <TabsContent value="participants">
              <ParticipantsTab participants={m.participants} attendees={m.attendees} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {!report && (isLive(m.status) || m.status === "completed") && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Live transcript</h2>
          <TranscriptTab meetingId={m.id} focusMs={null} live={isLive(m.status)} />
        </section>
      )}
    </div>
  );
}


function useMeetingPolling(refetch: () => unknown, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => void refetch(), 15_000);
    return () => clearInterval(id);
  }, [refetch, active]);
}

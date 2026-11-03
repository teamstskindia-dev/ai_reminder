'use client';

import { AlertTriangle, ExternalLink, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { RoleGate } from '@/components/auth/role-gate';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState, FormSkeleton } from '@/components/common/states';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumb-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import { useDeleteMeeting, useMeeting, useReprocessMeeting } from '@/lib/api/meetings';
import type { AdminMeetingDetail } from '@/lib/api/types';
import { formatDateTime, formatDuration, formatNumber, humanize } from '@/lib/utils';

import { PLATFORM_LABELS } from '../meetings-view';
import { ReportPanel } from './meeting-report';
import { TranscriptPanel } from './meeting-transcript';
import { SafeLink } from '@/components/common/safe-link';

const TABS = ['overview', 'report', 'action-items', 'transcript'] as const;
type TabKey = (typeof TABS)[number];

function InfoList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 truncate">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function OverviewPanel({ meeting }: { meeting: AdminMeetingDetail }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timing & bot</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoList
            items={[
              { label: 'Start', value: formatDateTime(meeting.startAt) },
              { label: 'End', value: formatDateTime(meeting.endAt) },
              { label: 'Duration', value: formatDuration(meeting.durationSeconds) },
              { label: 'Bot joined', value: formatDateTime(meeting.botJoinedAt) },
              { label: 'Bot left', value: formatDateTime(meeting.botLeftAt) },
              { label: 'Source', value: humanize(meeting.source) },
              { label: 'Auto-join', value: meeting.autoJoin ? 'On' : 'Off' },
              { label: 'Organizer', value: meeting.organizerEmail ?? '—' },
              { label: 'Meeting ID', value: <span className="font-mono text-xs">{meeting.id}</span> },
            ]}
          />
          {meeting.description ? (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="mt-1 text-sm whitespace-pre-wrap">{meeting.description}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attendees</CardTitle>
          <CardDescription>{meeting.attendees.length} invited from the calendar event</CardDescription>
        </CardHeader>
        <CardContent>
          {meeting.attendees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendees on the calendar event.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meeting.attendees.map((a) => (
                  <TableRow key={a.email}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {a.name ?? '—'}
                        {a.organizer ? <Badge variant="outline">Organizer</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.email}</TableCell>
                    <TableCell>{a.responseStatus ? humanize(a.responseStatus) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Participants</CardTitle>
          <CardDescription>Speakers detected in the transcript</CardDescription>
        </CardHeader>
        <CardContent>
          {meeting.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No participants detected yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Talk time</TableHead>
                  <TableHead className="text-right">Words</TableHead>
                  <TableHead className="w-48">Talk ratio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...meeting.participants]
                  .sort((a, b) => b.talkTimeSeconds - a.talkTimeSeconds)
                  .map((p) => {
                    const ratio = Math.max(0, Math.min(100, p.talkRatio));
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <p className="font-medium">{p.name}</p>
                          {p.email ? <p className="text-xs text-muted-foreground">{p.email}</p> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatDuration(p.talkTimeSeconds)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(p.wordCount)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                              role="meter"
                              aria-label={`${p.name} talk ratio`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(ratio)}
                            >
                              <div className="h-full rounded-full bg-[var(--viz-series-1)]" style={{ width: `${ratio}%` }} />
                            </div>
                            <span className="w-10 text-right text-xs tabular-nums">{Math.round(ratio)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActionItemsPanel({ meeting }: { meeting: AdminMeetingDetail }) {
  if (meeting.actionItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No action items were captured for this meeting.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Action item</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meeting.actionItems.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-96 whitespace-normal">
                <p className="font-medium">{item.title}</p>
                {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
              </TableCell>
              <TableCell>
                <p>{item.assigneeName ?? '—'}</p>
                {item.assigneeEmail ? <p className="text-xs text-muted-foreground">{item.assigneeEmail}</p> : null}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(item.dueAt, 'No due date')}</TableCell>
              <TableCell>
                <StatusBadge status={item.priority} />
              </TableCell>
              <TableCell>
                <StatusBadge status={item.status} />
              </TableCell>
              <TableCell>
                <Badge variant="outline">{item.source === 'ai' ? 'AI' : 'Manual'}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MeetingDetailContent({ meeting }: { meeting: AdminMeetingDetail }) {
  const router = useRouter();
  const url = useUrlState();
  const reprocess = useReprocessMeeting();
  const remove = useDeleteMeeting();
  const rawTab = url.get('tab');
  const tab: TabKey = TABS.includes(rawTab as TabKey) ? (rawTab as TabKey) : 'overview';

  return (
    <>
      <PageHeader
        back={{ href: '/meetings', label: 'Meetings' }}
        title={meeting.title || 'Untitled meeting'}
        meta={
          <>
            <StatusBadge status={meeting.status} />
            <span>{PLATFORM_LABELS[meeting.platform] ?? humanize(meeting.platform)}</span>
            <span>·</span>
            <Link href={`/users/${meeting.user.id}`} className="hover:underline">
              {meeting.user.name ? `${meeting.user.name} (${meeting.user.email})` : meeting.user.email}
            </Link>
            {meeting.meetingUrl ? (
              <>
                <span>·</span>
                <SafeLink href={meeting.meetingUrl} className="inline-flex items-center gap-1 hover:underline">
                  Meeting link <ExternalLink className="size-3" />
                </SafeLink>
              </>
            ) : null}
          </>
        }
        actions={
          <RoleGate minRole="admin">
            <ConfirmDialog
              title="Reprocess this meeting?"
              description="The AI report, action items and reminders are regenerated from the stored transcript with the current prompt and model."
              confirmLabel="Reprocess"
              onConfirm={() => reprocess.mutateAsync(meeting.id)}
              trigger={
                <Button variant="outline">
                  <RotateCcw /> Reprocess
                </Button>
              }
            />
            <ConfirmDialog
              title="Delete this meeting?"
              description="Deletes the meeting with its transcript, report, action items and reminders for this user. It cannot be undone."
              confirmLabel="Delete meeting"
              destructive
              onConfirm={async () => {
                await remove.mutateAsync(meeting.id);
                router.replace('/meetings');
              }}
              trigger={
                <Button variant="destructive">
                  <Trash2 /> Delete
                </Button>
              }
            />
          </RoleGate>
        }
      />

      {meeting.failureReason ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle />
          <AlertTitle>{meeting.status === 'failed' ? 'Meeting failed' : 'Last failure'}</AlertTitle>
          <AlertDescription>{meeting.failureReason}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'overview' ? null : v }, { resetPage: false })}>
        <TabsList className="mb-4 max-w-full overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="action-items">
            Action items
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 tabular-nums">
              {meeting.actionItems.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewPanel meeting={meeting} />
        </TabsContent>
        <TabsContent value="report">
          <ReportPanel report={meeting.report} status={meeting.status} />
        </TabsContent>
        <TabsContent value="action-items">
          <ActionItemsPanel meeting={meeting} />
        </TabsContent>
        <TabsContent value="transcript">
          <TranscriptPanel meetingId={meeting.id} enabled={tab === 'transcript'} />
        </TabsContent>
      </Tabs>
    </>
  );
}

export function MeetingDetailView() {
  const { id } = useParams<{ id: string }>();
  const meeting = useMeeting(id);
  useBreadcrumbLabel(`/meetings/${id}`, meeting.data?.title);

  if (meeting.isPending) return <FormSkeleton />;
  if (meeting.isError) return <ErrorState error={meeting.error} onRetry={() => void meeting.refetch()} />;
  return <MeetingDetailContent meeting={meeting.data} />;
}

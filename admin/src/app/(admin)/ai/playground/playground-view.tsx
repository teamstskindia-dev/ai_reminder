'use client';

import { AlarmClock, FlaskConical, Play, Sparkles, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { Markdown } from '@/components/common/markdown';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { EmptyState, ErrorState } from '@/components/common/states';
import { TextField, TextareaField } from '@/components/forms/fields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAiTest } from '@/lib/api/ai';
import type { AiTestResult } from '@/lib/api/types';
import { useZodForm } from '@/lib/forms';
import { formatDateTime, formatTimestamp } from '@/lib/utils';

import { AiNav } from '../ai-nav';
import { optionalTitleText, PAGE_MAX } from '@/lib/schemas/common';

const SAMPLE_TRANSCRIPT = `[00:00] Priya: Thanks for joining. Agenda today: the Q4 launch plan and the onboarding redesign.
[00:12] Daniel: Quick update — the Android beta has 340 testers and crash-free sessions are at 99.2%.
[00:31] Priya: Great. Are we still on track to ship the onboarding redesign before the launch?
[00:40] Mei: Mostly. Design is done; engineering needs one more sprint for the calendar step.
[01:05] Daniel: Could we cut the calendar step and connect calendars after sign-up instead?
[01:18] Priya: Let's do that. Decision: calendar connection moves to after sign-up.
[01:30] Mei: I'll update the Figma flows by Wednesday.
[01:42] Priya: And I'll send the deck to leadership by Friday.
[01:55] Daniel: I will book the design review for next Monday at 10am.
[02:10] Priya: Perfect. Thanks everyone.`;

const playgroundSchema = z.object({
  title: optionalTitleText('Title'),
  transcript: z
    .string()
    .trim()
    .min(20, 'Paste a transcript of at least a few lines')
    .max(PAGE_MAX, 'Transcript must be 200,000 characters or fewer'),
});

function Score({ label, value, extra }: { label: string; value: number | null; extra?: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
        {value ?? '—'}
        {value !== null ? <span className="text-xs font-normal text-muted-foreground">/ 100</span> : null}
      </p>
      {extra}
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None</p>
      )}
    </div>
  );
}

function Result({ result }: { result: AiTestResult }) {
  const { report } = result;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Timer className="size-3.5" aria-hidden /> {(result.latencyMs / 1000).toFixed(2)} s
            </span>
            <span>Model: {report.model ?? 'unknown'}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Score label="Meeting score" value={report.meetingScore} />
            <Score label="Engagement" value={report.engagementScore} />
            <Score
              label="Sentiment"
              value={report.sentimentScore}
              extra={report.sentimentLabel ? <StatusBadge status={report.sentimentLabel} className="mt-1" /> : null}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Summary</h3>
            <Markdown>{report.summary || '_Empty summary_'}</Markdown>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <ListBlock title="Key points" items={report.keyPoints} />
            <ListBlock title="Decisions" items={report.decisions} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Chapters</h3>
            {report.chapters.length ? (
              <ol className="space-y-2">
                {report.chapters.map((c, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      {formatTimestamp(c.startMs)}
                    </span>
                    <span>
                      <span className="font-medium">{c.title}</span>
                      <span className="block text-muted-foreground">{c.summary}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">None</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Key questions</h3>
            {report.keyQuestions.length ? (
              <ul className="space-y-2 text-sm">
                {report.keyQuestions.map((q, i) => (
                  <li key={i} className="rounded-lg border p-3">
                    <p className="font-medium">{q.question}</p>
                    <p className="text-muted-foreground">{q.answer ?? 'No answer given'}</p>
                    {q.askedBy ? <p className="mt-1 text-xs text-muted-foreground">Asked by {q.askedBy}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None</p>
            )}
          </div>
          {report.topics.length ? (
            <div className="flex flex-wrap gap-1.5">
              {report.topics.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Action items ({result.actionItems.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {result.actionItems.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.actionItems.map((item, i) => (
                  <TableRow key={item.id ?? i}>
                    <TableCell className="max-w-80 whitespace-normal">
                      <p className="font-medium">{item.title ?? '—'}</p>
                      {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
                    </TableCell>
                    <TableCell>
                      {item.assigneeName ?? '—'}
                      {item.isMine ? (
                        <Badge variant="outline" className="ml-2">
                          Mine
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(item.dueAt ?? null, 'No due date')}</TableCell>
                    <TableCell>{item.priority ? <StatusBadge status={item.priority} /> : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No action items extracted.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reminders ({result.reminders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {result.reminders.length ? (
            <ul className="space-y-2">
              {result.reminders.map((r, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <AlarmClock className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(r.remindAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No reminders proposed.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">Generating report…</span>
      <Skeleton className="h-6 w-40" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
    </div>
  );
}

export function PlaygroundView() {
  const { can } = useAdminSession();
  const canRun = can('admin');
  const test = useAiTest();
  const form = useZodForm(playgroundSchema, {
    defaultValues: { title: 'Q4 launch sync', transcript: SAMPLE_TRANSCRIPT },
  });

  const onSubmit = form.handleSubmit((values) => {
    test.mutate({ transcript: values.transcript, title: values.title.trim() || undefined });
  });

  return (
    <>
      <PageHeader
        title="AI"
        description="Run the meeting_report prompt against any transcript with the current AI settings. Nothing is saved."
      />
      <AiNav />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-base">Input</CardTitle>
            <CardDescription>Lines of “[mm:ss] Speaker: text”, like the notetaker produces.</CardDescription>
            <CardAction>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => form.reset({ title: 'Q4 launch sync', transcript: SAMPLE_TRANSCRIPT })}
              >
                Reset sample
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <TextField control={form.control} name="title" label="Meeting title" placeholder="Optional" />
              <TextareaField control={form.control} name="transcript" label="Transcript" rows={16} monospace />
              <Button type="submit" disabled={!canRun || test.isPending} className="w-full">
                {test.isPending ? <Spinner /> : <Play />}
                {test.isPending ? 'Generating…' : 'Run meeting report'}
              </Button>
              {!canRun ? (
                <p className="text-xs text-muted-foreground">Running the playground requires the Admin role.</p>
              ) : null}
            </form>
          </CardContent>
        </Card>
        <div className="min-w-0">
          {test.isPending ? (
            <ResultSkeleton />
          ) : test.isError ? (
            <ErrorState error={test.error} title="The test run failed" onRetry={() => void onSubmit()} />
          ) : test.data ? (
            <Result result={test.data} />
          ) : (
            <EmptyState
              icon={<FlaskConical />}
              title="No run yet"
              description={
                <>
                  Run the sample or paste your own transcript. The output uses the saved prompt and the current model
                  settings <Sparkles className="inline size-3.5" aria-hidden />.
                </>
              }
              className="h-full min-h-80"
            />
          )}
        </div>
      </div>
    </>
  );
}

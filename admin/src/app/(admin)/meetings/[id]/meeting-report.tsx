'use client';

import { FileText } from 'lucide-react';

import { Markdown } from '@/components/common/markdown';
import { EmptyState } from '@/components/common/states';
import { StatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { MeetingReport, MeetingStatus } from '@/lib/api/types';
import { cn, formatDateTime, formatTimestamp } from '@/lib/utils';

function ScoreCard({ label, score, extra }: { label: string; score: number | null; extra?: React.ReactNode }) {
  const value = score === null ? null : Math.max(0, Math.min(100, Math.round(score)));
  return (
    <Card className="gap-2 py-4">
      <CardContent className="space-y-2 px-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          {extra}
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {value === null ? '—' : value}
          {value !== null ? <span className="text-sm font-normal text-muted-foreground"> / 100</span> : null}
        </p>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value ?? undefined}
        >
          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${value ?? 0}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function ListCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{empty}</p>
        )}
      </CardContent>
    </Card>
  );
}

const PENDING_MESSAGES: Partial<Record<MeetingStatus, string>> = {
  scheduled: 'The meeting has not happened yet. The report is generated after the bot leaves the call.',
  joining: 'The bot is joining the call. The report is generated after the meeting ends.',
  waiting_room: 'The bot is waiting to be admitted. The report is generated after the meeting ends.',
  in_progress: 'The meeting is in progress. The report is generated after it ends.',
  processing: 'The AI is generating the report. This usually takes a few minutes.',
  failed: 'No report was produced because processing failed. Use Reprocess to run the AI again.',
  cancelled: 'The meeting was cancelled, so there is no report.',
  skipped: 'The bot skipped this meeting, so there is no report.',
};

export function ReportPanel({ report, status }: { report: MeetingReport | null; status: MeetingStatus }) {
  if (!report) {
    return (
      <EmptyState
        icon={<FileText />}
        title="No report yet"
        description={PENDING_MESSAGES[status] ?? 'This meeting has no AI report.'}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <ScoreCard label="Meeting score" score={report.meetingScore} />
        <ScoreCard label="Engagement" score={report.engagementScore} />
        <ScoreCard
          label="Sentiment"
          score={report.sentimentScore}
          extra={report.sentimentLabel ? <StatusBadge status={report.sentimentLabel} /> : null}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
          <CardDescription>
            Generated {formatDateTime(report.createdAt)}
            {report.model ? <> · model <span className="font-mono">{report.model}</span></> : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {report.summary ? <Markdown>{report.summary}</Markdown> : <p className="text-sm text-muted-foreground">No summary.</p>}
          {report.topics.length ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Topics">
              {report.topics.map((topic) => (
                <Badge key={topic} variant="secondary">
                  {topic}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="Key points" items={report.keyPoints} empty="No key points." />
        <ListCard title="Decisions" items={report.decisions} empty="No decisions were recorded." />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chapters</CardTitle>
        </CardHeader>
        <CardContent>
          {report.chapters.length ? (
            <ol className="space-y-3">
              {report.chapters.map((chapter, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">
                    {formatTimestamp(chapter.startMs)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{chapter.title}</p>
                    <p className="text-sm text-muted-foreground">{chapter.summary}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No chapters.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Key questions</CardTitle>
        </CardHeader>
        <CardContent>
          {report.keyQuestions.length ? (
            <ul className="divide-y">
              {report.keyQuestions.map((kq, i) => (
                <li key={i} className={cn('space-y-1 py-3', i === 0 && 'pt-0')}>
                  <p className="text-sm font-medium">
                    {kq.question}
                    {kq.askedBy ? <span className="font-normal text-muted-foreground"> — {kq.askedBy}</span> : null}
                  </p>
                  <p className={cn('text-sm', kq.answer ? 'text-muted-foreground' : 'text-muted-foreground italic')}>
                    {kq.answer ?? 'Not answered in the meeting'}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No key questions.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

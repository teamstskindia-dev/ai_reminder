import { CircleQuestionMark, FileText, Gavel, Lightbulb, ListTree, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { MeetingDetail } from '@/api/types';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Markdown } from '@/components/markdown/Markdown';
import { EmptyState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { formatTimestamp } from '@/utils/format';

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: theme.colors.primarySoft }]}>
          <Icon size={16} color={theme.colors.primaryText} />
        </View>
        <Text variant="subheading" accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

function Bullets({ items }: { items: string[] }) {
  const theme = useTheme();
  return (
    <View style={styles.bullets}>
      {items.map((item, i) => (
        <View key={`${i}-${item.slice(0, 12)}`} style={styles.bullet}>
          <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
          <Text variant="body" style={styles.flex}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function SummaryTab({ meeting, onReprocess }: { meeting: MeetingDetail; onReprocess: () => void }) {
  const theme = useTheme();
  const report = meeting.report;

  if (!report) {
    if (meeting.status === 'processing') {
      return (
        <Card muted>
          <View style={styles.pending}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text variant="subheading" align="center">
              Writing your report…
            </Text>
            <Text variant="callout" tone="secondary" align="center">
              Summary, chapters and action items usually land a few minutes after the call ends.
            </Text>
          </View>
        </Card>
      );
    }
    if (meeting.status === 'failed' || meeting.status === 'completed') {
      return (
        <EmptyState
          compact
          icon={RefreshCw}
          title="No report available"
          message={meeting.failureReason ?? 'The report could not be generated for this meeting.'}
          action={{ label: 'Try again', onPress: onReprocess }}
        />
      );
    }
    return (
      <EmptyState
        compact
        icon={FileText}
        title="Report not ready yet"
        message="Once the notetaker has captured the meeting, your summary appears here."
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Section icon={Sparkles} title="Summary">
        <Markdown>{report.summary}</Markdown>
        {report.topics.length ? (
          <View style={styles.topics}>
            {report.topics.map((topic) => (
              <Chip key={topic} label={topic} tone="brand" />
            ))}
          </View>
        ) : null}
      </Section>

      {report.keyPoints.length ? (
        <Section icon={Lightbulb} title="Key points">
          <Bullets items={report.keyPoints} />
        </Section>
      ) : null}

      {report.chapters.length ? (
        <Section icon={ListTree} title="Chapters">
          <View style={styles.chapters}>
            {report.chapters.map((chapter, i) => (
              <View key={`${chapter.startMs}-${i}`} style={styles.chapter}>
                <View style={styles.timeline}>
                  <Chip label={formatTimestamp(chapter.startMs)} tone="neutral" />
                  {i < report.chapters.length - 1 ? <View style={[styles.line, { backgroundColor: theme.colors.border }]} /> : null}
                </View>
                <View style={[styles.flex, styles.chapterBody]}>
                  <Text variant="bodyStrong">{chapter.title}</Text>
                  <Text variant="callout" tone="secondary">
                    {chapter.summary}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {report.decisions.length ? (
        <Section icon={Gavel} title="Decisions">
          <Bullets items={report.decisions} />
        </Section>
      ) : null}

      {report.keyQuestions.length ? (
        <Section icon={CircleQuestionMark} title="Key questions">
          <View style={styles.questions}>
            {report.keyQuestions.map((q, i) => (
              <View key={`${i}-${q.question.slice(0, 12)}`} style={[styles.question, { borderLeftColor: theme.colors.primarySoft }]}>
                <Text variant="bodyStrong">{q.question}</Text>
                {q.askedBy ? (
                  <Text variant="caption" tone="muted">
                    Asked by {q.askedBy}
                  </Text>
                ) : null}
                <Text variant="callout" tone={q.answer ? 'secondary' : 'muted'} style={!q.answer ? styles.italic : null}>
                  {q.answer ?? 'No answer captured in the meeting.'}
                </Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {report.model ? (
        <Text variant="caption" tone="muted" align="center">
          Generated by {report.model}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBody: {
    marginTop: 12,
    gap: 12,
  },
  topics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  bullets: {
    gap: 8,
  },
  bullet: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
  },
  flex: {
    flex: 1,
  },
  chapters: {
    gap: 0,
  },
  chapter: {
    flexDirection: 'row',
    gap: 12,
  },
  timeline: {
    alignItems: 'center',
    width: 64,
  },
  line: {
    flex: 1,
    width: 2,
    marginVertical: 4,
  },
  chapterBody: {
    gap: 2,
    paddingBottom: 16,
  },
  questions: {
    gap: 14,
  },
  question: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    gap: 3,
  },
  italic: {
    fontStyle: 'italic',
  },
  pending: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
});

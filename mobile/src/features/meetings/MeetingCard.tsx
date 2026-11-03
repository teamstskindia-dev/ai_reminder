import { router } from 'expo-router';
import { Bot, ListChecks, Users } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import type { MeetingListItem } from '@/api/types';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDayLabel, formatDuration, formatTimeRange } from '@/utils/format';

import { meetingStatusMeta } from './status';

export interface MeetingCardProps {
  meeting: MeetingListItem;
  /** Shows the bot auto-join toggle (upcoming meetings). */
  onToggleAutoJoin?: (meeting: MeetingListItem, value: boolean) => void;
  showDate?: boolean;
}

function MeetingCardBase({ meeting, onToggleAutoJoin, showDate = true }: MeetingCardProps) {
  const theme = useTheme();
  const status = meetingStatusMeta(meeting.status);
  const duration = formatDuration(meeting.durationSeconds);
  const report = meeting.report;
  const topics = report?.topics.slice(0, 3) ?? [];
  const when = `${showDate ? `${formatDayLabel(meeting.startAt)} · ` : ''}${formatTimeRange(meeting.startAt, meeting.endAt)}`;
  const toggleable = onToggleAutoJoin && meeting.status === 'scheduled';

  return (
    <Card onPress={() => router.push(`/meeting/${meeting.id}`)} accessibilityLabel={`${meeting.title}, ${when}, ${status.label}`}>
      <View style={styles.row}>
        <View style={styles.main}>
          <Text variant="subheading" numberOfLines={2}>
            {meeting.title || 'Untitled meeting'}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {when}
            {duration ? ` · ${duration}` : ''}
          </Text>
        </View>
        {report ? <ScoreRing score={report.meetingScore} size={44} label="Meeting score" /> : null}
      </View>

      <View style={styles.meta}>
        {meeting.status !== 'completed' || !report ? <Chip label={status.label} tone={status.tone} dot={status.live} /> : null}
        {meeting.attendeeCount > 0 ? <Chip label={String(meeting.attendeeCount)} icon={Users} /> : null}
        {meeting.actionItemCount > 0 ? <Chip label={`${meeting.actionItemCount} action items`} icon={ListChecks} tone="accent" /> : null}
        {topics.map((topic) => (
          <Chip key={topic} label={topic} tone="brand" />
        ))}
      </View>

      {report?.summaryPreview ? (
        <Text variant="callout" tone="secondary" numberOfLines={2} style={styles.preview}>
          {report.summaryPreview}
        </Text>
      ) : null}

      {toggleable ? (
        <View style={[styles.botRow, { borderTopColor: theme.colors.border }]}>
          <Bot size={18} color={meeting.autoJoin ? theme.colors.primaryText : theme.colors.textMuted} />
          <Text variant="callout" tone={meeting.autoJoin ? 'default' : 'secondary'} style={styles.botText}>
            {meeting.autoJoin ? 'Notetaker will join' : 'Notetaker off'}
          </Text>
          <Switch
            accessibilityLabel="Notetaker auto-join"
            value={meeting.autoJoin}
            onValueChange={(value) => onToggleAutoJoin(meeting, value)}
            trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
            thumbColor={meeting.autoJoin ? theme.colors.primaryForeground : theme.colors.surface}
          />
        </View>
      ) : null}
    </Card>
  );
}

export const MeetingCard = memo(MeetingCardBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  main: {
    flex: 1,
    gap: 4,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  preview: {
    marginTop: 10,
  },
  botRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  botText: {
    flex: 1,
  },
});

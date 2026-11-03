import { Bot, CalendarDays, ExternalLink, LogOut, Send, Users } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';

import type { MeetingDetail } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { canRecallBot, canSendBot, meetingStatusMeta } from '@/features/meetings/status';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDayLabel, formatDuration, formatTimeRange, pluralize } from '@/utils/format';

export interface MeetingHeaderProps {
  meeting: MeetingDetail;
  onOpenMeet: () => void;
  onBot: (action: 'join' | 'leave') => void;
  botPending: boolean;
  onToggleAutoJoin: (value: boolean) => void;
}

export function MeetingHeader({ meeting, onOpenMeet, onBot, botPending, onToggleAutoJoin }: MeetingHeaderProps) {
  const theme = useTheme();
  const status = meetingStatusMeta(meeting.status);
  const duration = formatDuration(meeting.durationSeconds);
  const attendees = Math.max(meeting.attendeeCount, meeting.attendees.length);

  return (
    <View style={styles.wrap}>
      <Text variant="title">{meeting.title || 'Untitled meeting'}</Text>
      <View style={styles.metaRow}>
        <CalendarDays size={14} color={theme.colors.textSecondary} />
        <Text variant="callout" tone="secondary">
          {formatDayLabel(meeting.startAt)} · {formatTimeRange(meeting.startAt, meeting.endAt)}
          {duration ? ` · ${duration}` : ''}
        </Text>
      </View>
      {attendees > 0 ? (
        <View style={styles.metaRow}>
          <Users size={14} color={theme.colors.textSecondary} />
          <Text variant="callout" tone="secondary">
            {pluralize(attendees, 'attendee')}
          </Text>
        </View>
      ) : null}

      <Card muted style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Chip label={status.label} tone={status.tone} dot={status.live} size="md" />
          {status.live ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
        </View>
        <Text variant="callout" tone="secondary">
          {meeting.status === 'failed' && meeting.failureReason ? meeting.failureReason : status.description}
        </Text>

        {meeting.status === 'scheduled' ? (
          <View style={styles.autoJoin}>
            <Bot size={18} color={meeting.autoJoin ? theme.colors.primaryText : theme.colors.textMuted} />
            <Text variant="body" style={styles.flex}>
              Notetaker joins automatically
            </Text>
            <Switch
              accessibilityLabel="Notetaker joins automatically"
              value={meeting.autoJoin}
              onValueChange={onToggleAutoJoin}
              trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
              thumbColor={meeting.autoJoin ? theme.colors.primaryForeground : theme.colors.surface}
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          {canSendBot(meeting.status, meeting.meetingUrl) ? (
            <Button label="Send notetaker now" icon={Send} size="sm" onPress={() => onBot('join')} loading={botPending} />
          ) : null}
          {canRecallBot(meeting.status) ? (
            <Button label="Remove notetaker" icon={LogOut} size="sm" variant="danger" onPress={() => onBot('leave')} loading={botPending} />
          ) : null}
          {meeting.meetingUrl ? (
            <Button label="Open Meet" icon={ExternalLink} size="sm" variant="outline" onPress={onOpenMeet} />
          ) : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusCard: {
    marginTop: 10,
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  autoJoin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

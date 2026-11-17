import { router } from 'expo-router';
import { CalendarClock, Lightbulb, MessagesSquare, Mic, TriangleAlert, Users } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useMeetingPrep } from '@/api/hooks/meetings';
import type { ActionItem, MeetingDetail } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useNow } from '@/hooks/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDayLabel, formatTime } from '@/utils/format';

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.row}>
        {icon}
        <Text variant="label">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Promise({ item, who }: { item: ActionItem; who: string }) {
  return (
    <Text variant="callout">
      • {item.title}
      <Text variant="caption" tone="muted">{`  ${who}${item.dueAt ? ` · due ${formatDayLabel(item.dueAt)}` : ''}`}</Text>
    </Text>
  );
}

/**
 * The pre-meeting brief (user-flow §06) for upcoming meetings: who is coming, what you last discussed, open
 * promises both ways, talking points, double-bookings and the next back-to-back meeting, plus a record button.
 * After a recorded meeting it links to the recording.
 */
export function MeetingPrepCard({ meeting }: { meeting: MeetingDetail }) {
  const theme = useTheme();
  const now = useNow();
  const upcoming =
    (meeting.status === 'scheduled' || meeting.status === 'skipped') &&
    new Date(meeting.endAt ?? meeting.startAt).getTime() > now - 3600_000;
  const prep = useMeetingPrep(meeting.id, upcoming);
  const record = () => router.push(`/capture/record?meetingId=${meeting.id}`);
  const openRecording = (id: string) => router.push({ pathname: '/capture/[id]', params: { id } });

  if (!upcoming) {
    return meeting.recordingId ? (
      <Card onPress={() => openRecording(meeting.recordingId as string)} accessibilityLabel="Open the recording of this meeting">
        <View style={styles.row}>
          <Mic size={18} color={theme.colors.primaryText} />
          <Text variant="callout" style={styles.flex}>Recorded on your phone: summary, to-dos and follow-up</Text>
          <Text variant="label" tone="brand">Open</Text>
        </View>
      </Card>
    ) : null;
  }

  const p = prep.data;
  return (
    <Card>
      <View style={styles.body}>
        <View style={styles.row}>
          <CalendarClock size={18} color={theme.colors.primaryText} />
          <Text variant="subheading" style={styles.flex}>Prep for this meeting</Text>
        </View>

        {prep.isPending ? (
          <View style={styles.section}>
            <Skeleton width="70%" height={14} />
            <Skeleton width="90%" height={14} />
            <Skeleton width="50%" height={14} />
          </View>
        ) : p ? (
          <>
            {p.conflicts.length ? (
              <View style={[styles.warn, { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radii.md }]}>
                <TriangleAlert size={16} color={theme.colors.warning} />
                <Text variant="caption" style={styles.flex}>
                  Double-booked with {p.conflicts.map((c) => `${c.title} (${formatTime(c.startAt)})`).join(', ')}. Decide which one to move.
                </Text>
              </View>
            ) : null}

            {p.attendees.length ? (
              <Section icon={<Users size={15} color={theme.colors.textSecondary} />} title="Who's coming">
                <Text variant="callout">{p.attendees.map((a) => a.name ?? a.email).join(', ')}</Text>
              </Section>
            ) : null}

            {p.lastDiscussed.length ? (
              <Section icon={<MessagesSquare size={15} color={theme.colors.textSecondary} />} title="What you last discussed">
                {p.lastDiscussed.map((d) => (
                  <Touchable
                    key={d.id}
                    accessibilityRole="button"
                    onPress={() => (d.isCapture ? openRecording(d.id) : router.push(`/meeting/${d.id}`))}
                    style={styles.lastItem}
                  >
                    <Text variant="label">
                      {d.title} <Text variant="caption" tone="muted">· {formatDayLabel(d.startAt)}</Text>
                    </Text>
                    {d.summaryPreview ? (
                      <Text variant="caption" tone="secondary" numberOfLines={3}>
                        {d.summaryPreview}
                      </Text>
                    ) : null}
                  </Touchable>
                ))}
              </Section>
            ) : null}

            {p.promises.mine.length || p.promises.theirs.length ? (
              <Section icon={<CalendarClock size={15} color={theme.colors.textSecondary} />} title="Open promises">
                {p.promises.mine.map((i) => (
                  <Promise key={i.id} item={i} who="you" />
                ))}
                {p.promises.theirs.map((i) => (
                  <Promise key={i.id} item={i} who={i.assigneeName ?? 'them'} />
                ))}
              </Section>
            ) : null}

            {p.talkingPoints.length ? (
              <Section icon={<Lightbulb size={15} color={theme.colors.textSecondary} />} title="Talking points">
                {p.talkingPoints.map((t, i) => (
                  <Text key={i} variant="callout">
                    • {t}
                  </Text>
                ))}
              </Section>
            ) : null}

            {!p.attendees.length && !p.lastDiscussed.length && !p.talkingPoints.length ? (
              <Text variant="caption" tone="muted">
                {"Nothing recorded with these people yet. Record this one and next time I'll have notes for you."}
              </Text>
            ) : null}

            {p.nextUp ? (
              <Text variant="caption" tone="secondary">
                Right after: {p.nextUp.title} at {formatTime(p.nextUp.startAt)}
              </Text>
            ) : null}
          </>
        ) : null}

        {p?.recordingId ? (
          <Button label="Open the recording" icon={Mic} variant="secondary" onPress={() => openRecording(p.recordingId as string)} />
        ) : (
          <Button label="Record this meeting" icon={Mic} onPress={record} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  section: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  lastItem: { gap: 2, paddingVertical: 4 },
});

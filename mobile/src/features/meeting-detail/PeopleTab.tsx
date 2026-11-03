import { Users } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { MeetingDetail } from '@/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { EmptyState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { formatDuration } from '@/utils/format';

export function PeopleTab({ meeting }: { meeting: MeetingDetail }) {
  const participants = [...meeting.participants].sort((a, b) => b.talkTimeSeconds - a.talkTimeSeconds);
  const maxRatio = Math.max(1, ...participants.map((p) => p.talkRatio));

  if (!participants.length && !meeting.attendees.length) {
    return <EmptyState compact icon={Users} title="No participant data" message="Talk time appears once the meeting has been processed." />;
  }

  return (
    <View style={styles.wrap}>
      {participants.length ? (
        <Card>
          <Text variant="subheading">Talk time</Text>
          <View style={styles.list}>
            {participants.map((p) => (
              <View key={p.id} style={styles.person}>
                <Avatar name={p.name} size={36} />
                <View style={styles.flex}>
                  <View style={styles.personTop}>
                    <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                      {p.name}
                    </Text>
                    <Text variant="label" tone="brand">
                      {Math.round(p.talkRatio)}%
                    </Text>
                  </View>
                  <ProgressBar value={p.talkRatio / maxRatio} />
                  <Text variant="caption" tone="muted">
                    {formatDuration(p.talkTimeSeconds) ?? '0 min'} · {p.wordCount.toLocaleString()} words
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {meeting.attendees.length ? (
        <Card>
          <Text variant="subheading">Invited</Text>
          <View style={styles.list}>
            {meeting.attendees.map((a) => (
              <View key={a.email} style={styles.attendee}>
                <Avatar name={a.name ?? a.email} size={32} />
                <View style={styles.flex}>
                  <Text variant="body" numberOfLines={1}>
                    {a.name ?? a.email}
                  </Text>
                  {a.name ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {a.email}
                    </Text>
                  ) : null}
                </View>
                {a.organizer ? <Chip label="Organizer" tone="brand" /> : null}
                {!a.organizer && a.responseStatus === 'declined' ? (
                  <Chip label="Declined" tone="danger" />
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  list: {
    marginTop: 12,
    gap: 14,
  },
  person: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  personTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  attendee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
});

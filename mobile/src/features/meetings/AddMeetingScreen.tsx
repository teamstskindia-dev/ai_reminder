import { router } from 'expo-router';
import { Bot, Link2, Type } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fieldErrors, getErrorMessage } from '@/api/errors';
import { useCreateMeeting } from '@/api/hooks/meetings';
import { FormScreen } from '@/components/layout/FormScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { SwitchRow } from '@/components/ui/ListRow';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/utils/toast';
import { isMeetUrl, normalizeMeetUrl } from '@/utils/validation';

const DURATIONS = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '90 min' },
] as const;

type Duration = (typeof DURATIONS)[number]['value'];

function nextQuarterHour(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15);
  return d;
}

export function AddMeetingScreen() {
  const create = useCreateMeeting();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState<Date | null>(() => nextQuarterHour());
  const [duration, setDuration] = useState<Duration>('30');
  const [autoJoin, setAutoJoin] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const meetingUrl = normalizeMeetUrl(url);
    const next: Record<string, string> = {};
    if (!isMeetUrl(meetingUrl)) next.meetingUrl = 'Paste a Google Meet link, e.g. https://meet.google.com/abc-defg-hij';
    if (!title.trim()) next.title = 'Give the meeting a name.';
    if (!startAt) next.startAt = 'Pick a start time.';
    setErrors(next);
    if (Object.keys(next).length || !startAt) return;

    const endAt = new Date(startAt.getTime() + Number(duration) * 60_000);
    create.mutate(
      { title: title.trim(), meetingUrl, startAt: startAt.toISOString(), endAt: endAt.toISOString(), autoJoin },
      {
        onSuccess: (meeting) => {
          toast('Meeting added');
          router.replace(`/meeting/${meeting.id}`);
        },
        onError: (error) => {
          const fields = fieldErrors(error);
          if (Object.keys(fields).length) setErrors(fields);
          else toast(getErrorMessage(error, "Couldn't add the meeting."));
        },
      },
    );
  };

  return (
    <FormScreen footer={<Button label="Add meeting" onPress={submit} loading={create.isPending} fullWidth />}>
      <Text variant="callout" tone="secondary">
        Add a Google Meet call that isn&apos;t on your calendar. The notetaker joins at the start time.
      </Text>
      <TextField
        label="Google Meet link"
        icon={Link2}
        placeholder="https://meet.google.com/abc-defg-hij"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={errors.meetingUrl}
      />
      <TextField
        label="Title"
        icon={Type}
        placeholder="Weekly sync"
        value={title}
        onChangeText={setTitle}
        maxLength={200}
        error={errors.title}
      />
      <DateTimeField label="Starts" value={startAt} onChange={setStartAt} minimumDate={new Date()} error={errors.startAt} />
      <View style={styles.field}>
        <Text variant="label" tone="secondary">
          Duration
        </Text>
        <SegmentedControl options={DURATIONS} value={duration} onChange={setDuration} />
      </View>
      <Card padded={false}>
        <SwitchRow
          icon={Bot}
          title="Send the notetaker"
          subtitle="Joins automatically and writes the report"
          value={autoJoin}
          onValueChange={setAutoJoin}
        />
      </Card>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
});

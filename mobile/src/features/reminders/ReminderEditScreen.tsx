import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Bell, Link2, Mail, MessageSquare, SearchX, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { findCachedEntity } from '@/api/cache';
import { fieldErrors, getErrorMessage } from '@/api/errors';
import { useSaveReminder } from '@/api/hooks/reminders';
import { qk } from '@/api/queryKeys';
import type { Reminder, ReminderChannel } from '@/api/types';
import { FeatureGate } from '@/components/FeatureGate';
import { FormScreen } from '@/components/layout/FormScreen';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { EmptyState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/utils/toast';

const CHANNELS: { value: ReminderChannel; label: string; icon: LucideIcon }[] = [
  { value: 'push', label: 'Push', icon: Bell },
  { value: 'in_app', label: 'In-app', icon: MessageSquare },
  { value: 'email', label: 'Email', icon: Mail },
];

function defaultTime(): Date {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  return d;
}

type Params = { id?: string; title?: string; actionItemId?: string; meetingId?: string; remindAt?: string };

function ReminderForm({ existing, params }: { existing: Reminder | null; params: Params }) {
  const theme = useTheme();
  const save = useSaveReminder();
  const [title, setTitle] = useState(existing?.title ?? params.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [remindAt, setRemindAt] = useState<Date | null>(() => {
    const source = existing?.remindAt ?? params.remindAt;
    const parsed = source ? new Date(source) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : defaultTime();
  });
  const [channels, setChannels] = useState<ReminderChannel[]>(existing?.channels ?? ['push', 'in_app']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const linkedTitle = existing?.meetingTitle ?? null;

  const toggleChannel = (channel: ReminderChannel) =>
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));

  const submit = () => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'What should we remind you about?';
    if (!remindAt) next.remindAt = 'Pick a time.';
    else if (remindAt.getTime() <= Date.now()) next.remindAt = 'Pick a time in the future.';
    if (!channels.length) next.channels = 'Choose at least one way to be reminded.';
    setErrors(next);
    if (Object.keys(next).length || !remindAt) return;

    const payload = { title: title.trim(), body: body.trim() || undefined, remindAt: remindAt.toISOString(), channels };
    save.mutate(
      existing
        ? { id: existing.id, update: { ...payload, body: body.trim() || null } }
        : { create: { ...payload, actionItemId: params.actionItemId, meetingId: params.meetingId } },
      {
        onSuccess: () => {
          toast(existing ? 'Reminder updated' : 'Reminder set');
          router.back();
        },
        onError: (error) => {
          const fields = fieldErrors(error);
          if (Object.keys(fields).length) setErrors(fields);
          else toast(getErrorMessage(error, "Couldn't save the reminder."));
        },
      },
    );
  };

  return (
    <FormScreen footer={<Button label={existing ? 'Save changes' : 'Set reminder'} onPress={submit} loading={save.isPending} fullWidth />}>
      <TextField label="Remind me to" placeholder="Send the proposal to Acme" value={title} onChangeText={setTitle} maxLength={200} error={errors.title} />
      <TextField label="Note (optional)" placeholder="Add details" value={body} onChangeText={setBody} multiline maxLength={1000} />
      <DateTimeField label="When" value={remindAt} onChange={setRemindAt} minimumDate={new Date()} error={errors.remindAt} />
      <View style={styles.field}>
        <Text variant="label" tone="secondary">
          Notify me by
        </Text>
        <View style={styles.chips}>
          {CHANNELS.map((c) => (
            <Chip key={c.value} label={c.label} icon={c.icon} size="md" selected={channels.includes(c.value)} onPress={() => toggleChannel(c.value)} />
          ))}
        </View>
        {errors.channels ? (
          <Text variant="caption" tone="danger">
            {errors.channels}
          </Text>
        ) : null}
      </View>
      {linkedTitle ? (
        <View style={[styles.linked, { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.md }]}>
          <Link2 size={16} color={theme.colors.textSecondary} />
          <Text variant="callout" tone="secondary" numberOfLines={1} style={styles.flex}>
            From “{linkedTitle}”
          </Text>
        </View>
      ) : null}
    </FormScreen>
  );
}

export function ReminderEditScreen() {
  const qc = useQueryClient();
  const params = useLocalSearchParams<Params>();
  const id = typeof params.id === 'string' && params.id ? params.id : null;
  const [existing] = useState(() =>
    id ? findCachedEntity<Reminder>(qc, [qk.reminders.all, qk.dashboard], id, (c) => 'remindAt' in c && 'channels' in c) : null,
  );

  return (
    <FeatureGate feature="reminders">
      <Stack.Screen options={{ title: id ? 'Edit reminder' : 'New reminder' }} />
      {id && !existing ? (
        <EmptyState icon={SearchX} title="Reminder not found" message="It may have been sent or deleted." action={{ label: 'Close', onPress: () => router.back() }} />
      ) : (
        <ReminderForm existing={existing} params={params} />
      )}
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  linked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  flex: {
    flex: 1,
  },
});

import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { AlarmClock, CircleCheck, SearchX, Trash } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { findCachedEntity } from '@/api/cache';
import { fieldErrors, getErrorMessage } from '@/api/errors';
import { useDeleteActionItem, useSaveActionItem } from '@/api/hooks/actionItems';
import { qk } from '@/api/queryKeys';
import type { ActionItem, Priority } from '@/api/types';
import { FeatureGate } from '@/components/FeatureGate';
import { FormScreen } from '@/components/layout/FormScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { SwitchRow } from '@/components/ui/ListRow';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useConfig } from '@/providers/config/ConfigProvider';
import { toast } from '@/utils/toast';

import { openReminderFor } from './useActionItemMenu';

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

function ActionItemForm({ existing, meetingId }: { existing: ActionItem | null; meetingId: string | null }) {
  const { isEnabled } = useConfig();
  const save = useSaveActionItem();
  const remove = useDeleteActionItem();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [dueAt, setDueAt] = useState<Date | null>(existing?.dueAt ? new Date(existing.dueAt) : null);
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium');
  const [done, setDone] = useState(existing?.status === 'done');
  const [remind, setRemind] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canRemind = isEnabled('reminders');

  const submit = () => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Describe the task.';
    if (remind && !dueAt) next.dueAt = 'Set a due date to get a reminder.';
    if (remind && dueAt && dueAt.getTime() <= Date.now()) next.dueAt = 'Reminders need a due date in the future.';
    setErrors(next);
    if (Object.keys(next).length) return;

    save.mutate(
      existing
        ? {
            id: existing.id,
            update: {
              title: title.trim(),
              description: description.trim() || null,
              dueAt: dueAt ? dueAt.toISOString() : null,
              priority,
              status: done ? 'done' : 'open',
            },
          }
        : {
            create: {
              title: title.trim(),
              description: description.trim() || undefined,
              dueAt: dueAt?.toISOString(),
              priority,
              meetingId: meetingId ?? undefined,
              remind: remind || undefined,
            },
          },
      {
        onSuccess: () => {
          toast(existing ? 'Action item updated' : 'Action item added');
          router.back();
        },
        onError: (error) => {
          const fields = fieldErrors(error);
          if (Object.keys(fields).length) setErrors(fields);
          else toast(getErrorMessage(error, "Couldn't save the action item."));
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert('Delete action item?', `"${existing.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(existing, {
            onSuccess: () => router.back(),
          }),
      },
    ]);
  };

  return (
    <FormScreen
      footer={
        <>
          <Button label={existing ? 'Save changes' : 'Add action item'} onPress={submit} loading={save.isPending} fullWidth />
          {existing ? <Button label="Delete" icon={Trash} variant="ghost" onPress={confirmDelete} fullWidth /> : null}
        </>
      }
    >
      {existing?.meetingTitle ? (
        <Text variant="callout" tone="secondary">
          From “{existing.meetingTitle}”
        </Text>
      ) : null}
      <TextField label="Task" placeholder="Share the Q3 deck with the team" value={title} onChangeText={setTitle} maxLength={300} error={errors.title} />
      <TextField label="Details (optional)" placeholder="Anything to remember" value={description} onChangeText={setDescription} multiline maxLength={2000} />
      <DateTimeField label="Due" value={dueAt} onChange={setDueAt} placeholder="No due date" clearable error={errors.dueAt} />
      <View style={styles.field}>
        <Text variant="label" tone="secondary">
          Priority
        </Text>
        <SegmentedControl options={PRIORITIES} value={priority} onChange={setPriority} />
      </View>
      {existing ? (
        <Card padded={false}>
          <SwitchRow icon={CircleCheck} title="Done" value={done} onValueChange={setDone} />
        </Card>
      ) : canRemind ? (
        <Card padded={false}>
          <SwitchRow
            icon={AlarmClock}
            title="Remind me when it's due"
            subtitle="Creates a reminder at the due time"
            value={remind}
            onValueChange={setRemind}
          />
        </Card>
      ) : null}
      {existing && canRemind && !done ? (
        <Button label="Set a reminder" icon={AlarmClock} variant="secondary" onPress={() => openReminderFor(existing)} />
      ) : null}
    </FormScreen>
  );
}

export function ActionItemEditScreen() {
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string; meetingId?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : null;
  const meetingId = typeof params.meetingId === 'string' && params.meetingId ? params.meetingId : null;
  const [existing] = useState(() =>
    id
      ? findCachedEntity<ActionItem>(qc, [qk.actionItems.all, qk.dashboard, qk.meetings.details], id, (c) => 'priority' in c && 'isMine' in c)
      : null,
  );

  return (
    <FeatureGate feature="actionItems">
      <Stack.Screen options={{ title: id ? 'Edit action item' : 'New action item' }} />
      {id && !existing ? (
        <EmptyState icon={SearchX} title="Action item not found" message="It may have been deleted." action={{ label: 'Close', onPress: () => router.back() }} />
      ) : (
        <ActionItemForm existing={existing} meetingId={meetingId} />
      )}
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
});

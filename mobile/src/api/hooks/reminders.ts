import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { patchEntity, removeEntity, restoreSnapshot } from '../cache';
import { qk } from '../queryKeys';
import {
  createReminder,
  deleteReminder,
  listReminders,
  snoozeReminder,
  updateReminder,
} from '../resources/reminders';
import type { CreateReminderInput, Reminder, ReminderListQuery, UpdateReminderInput } from '../types';

import { nextPageParam } from './pagination';

const AFFECTED = [qk.reminders.all, qk.dashboard] as const;

export function useRemindersInfinite(status: NonNullable<ReminderListQuery['status']>) {
  const query = { status, limit: 50 };
  return useInfiniteQuery({
    queryKey: qk.reminders.list(query),
    queryFn: ({ pageParam }) => listReminders({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
  });
}

function useInvalidateReminders() {
  const qc = useQueryClient();
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: qk.reminders.all }), qc.invalidateQueries({ queryKey: qk.dashboard })]);
}

export function useSaveReminder() {
  const invalidate = useInvalidateReminders();
  return useMutation({
    meta: { handlesErrors: true },
    mutationFn: (input: { id?: string; create?: CreateReminderInput; update?: UpdateReminderInput }) => {
      if (input.id && input.update) return updateReminder(input.id, input.update);
      if (input.create) return createReminder(input.create);
      return Promise.reject(new Error('Nothing to save'));
    },
    onSuccess: () => invalidate(),
  });
}

export type SnoozeChoice = { kind: 'minutes'; minutes: number } | { kind: 'until'; date: Date };

/** Snooze by minutes (POST /snooze, 5..1440) or to an absolute time (PATCH remindAt). */
export function useSnoozeReminder() {
  const qc = useQueryClient();
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: ({ reminder, choice }: { reminder: Reminder; choice: SnoozeChoice }) =>
      choice.kind === 'minutes'
        ? snoozeReminder(reminder.id, Math.min(1440, Math.max(5, choice.minutes)))
        : updateReminder(reminder.id, { remindAt: choice.date.toISOString() }),
    onMutate: ({ reminder, choice }) => {
      const base = Math.max(Date.now(), new Date(reminder.remindAt).getTime());
      const next = choice.kind === 'minutes' ? new Date(base + choice.minutes * 60_000) : choice.date;
      return patchEntity(qc, AFFECTED, reminder.id, { remindAt: next.toISOString() });
    },
    onError: (_error, _vars, snapshot) => restoreSnapshot(qc, snapshot),
    onSettled: () => invalidate(),
  });
}

export function useCancelReminder() {
  const qc = useQueryClient();
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: (reminder: Reminder) => updateReminder(reminder.id, { status: 'cancelled' }),
    onMutate: (reminder) => removeEntity(qc, AFFECTED, reminder.id),
    onError: (_error, _vars, snapshot) => restoreSnapshot(qc, snapshot),
    onSettled: () => invalidate(),
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: (reminder: Reminder) => deleteReminder(reminder.id),
    onMutate: (reminder) => removeEntity(qc, AFFECTED, reminder.id),
    onError: (_error, _vars, snapshot) => restoreSnapshot(qc, snapshot),
    onSettled: () => invalidate(),
  });
}

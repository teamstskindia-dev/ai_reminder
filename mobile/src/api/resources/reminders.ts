import { api, apiPage } from '../client';
import type {
  CreateReminderInput,
  Reminder,
  ReminderListQuery,
  UpdateReminderInput,
} from '../types';

export function listReminders(query: ReminderListQuery) {
  return apiPage<Reminder>('/reminders', { query: { ...query } });
}

export function createReminder(input: CreateReminderInput): Promise<Reminder> {
  return api<Reminder>('/reminders', { method: 'POST', body: input });
}

export function updateReminder(id: string, input: UpdateReminderInput): Promise<Reminder> {
  return api<Reminder>(`/reminders/${id}`, { method: 'PATCH', body: input });
}

export function deleteReminder(id: string): Promise<void> {
  return api<void>(`/reminders/${id}`, { method: 'DELETE' });
}

export function snoozeReminder(id: string, minutes: number): Promise<Reminder> {
  return api<Reminder>(`/reminders/${id}/snooze`, { method: 'POST', body: { minutes } });
}

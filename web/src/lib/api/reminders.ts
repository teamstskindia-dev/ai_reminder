import { api } from "./client";
import type { CreateReminderInput, Reminder, ReminderListParams, UpdateReminderInput } from "./types";

export const remindersApi = {
  list: (params: ReminderListParams = {}) => api.page<Reminder>("/reminders", { ...params }),
  create: (input: CreateReminderInput) => api.post<Reminder>("/reminders", input),
  update: (id: string, input: UpdateReminderInput) => api.patch<Reminder>(`/reminders/${id}`, input),
  remove: (id: string) => api.delete(`/reminders/${id}`),
  snooze: (id: string, minutes: number) => api.post<Reminder>(`/reminders/${id}/snooze`, { minutes }),
};

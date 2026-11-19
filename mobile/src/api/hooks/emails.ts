import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '../queryKeys';
import {
  draftEmailReply,
  emailFeedback,
  fetchEmail,
  listEmails,
  remindAboutEmail,
  resolveDetected,
  sendEmailReply,
  setEmailStatus,
  syncEmails,
} from '../resources/emails';
import type { EmailDetail, EmailFilter } from '../types';

import { nextPageParam, PAGE_SIZE } from './pagination';

export function useEmailsInfinite(filter: EmailFilter) {
  return useInfiniteQuery({
    queryKey: qk.emails.list(filter),
    queryFn: ({ pageParam }) => listEmails({ filter, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
  });
}

export function useEmail(id: string) {
  return useQuery({ queryKey: qk.emails.detail(id), queryFn: () => fetchEmail(id), enabled: Boolean(id) });
}

/** After any change to an email: the detail, the lists and Today (which shows what needs you). */
function useEmailUpdated() {
  const qc = useQueryClient();
  return (detail: EmailDetail) => {
    qc.setQueryData(qk.emails.detail(detail.id), detail);
    void qc.invalidateQueries({ queryKey: ['emails', 'list'] });
    void qc.invalidateQueries({ queryKey: qk.today });
  };
}

export function useEmailFeedback() {
  const updated = useEmailUpdated();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; kind: 'not_important' | 'always_alert' }) => emailFeedback(input.id, input.kind),
    onSuccess: (detail) => {
      updated(detail);
      // VIP / muted lists live in the settings.
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useEmailStatus() {
  const updated = useEmailUpdated();
  return useMutation({
    mutationFn: (input: { id: string; status: 'done' | 'new' }) => setEmailStatus(input.id, input.status),
    onSuccess: updated,
  });
}

export function useRemindAboutEmail() {
  const updated = useEmailUpdated();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; remindAt: string; title?: string }) => remindAboutEmail(input.id, input.remindAt, input.title),
    onSuccess: (detail) => {
      updated(detail);
      void qc.invalidateQueries({ queryKey: qk.reminders.all });
    },
  });
}

export function useResolveDetected() {
  const updated = useEmailUpdated();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; detectedId: string; action: 'reminder' | 'calendar' | 'dismiss'; remindAt?: string }) =>
      resolveDetected(input.id, input.detectedId, input.action, input.remindAt),
    onSuccess: (detail, input) => {
      updated(detail);
      if (input.action === 'reminder') void qc.invalidateQueries({ queryKey: qk.reminders.all });
      if (input.action === 'calendar') void qc.invalidateQueries({ queryKey: qk.meetings.all });
    },
  });
}

export function useDraftEmailReply() {
  return useMutation({
    mutationFn: (input: { id: string; instructions?: string }) => draftEmailReply(input.id, input.instructions),
  });
}

export function useSendEmailReply() {
  const updated = useEmailUpdated();
  return useMutation({
    mutationFn: (input: { id: string; to: string; subject: string; body: string }) =>
      sendEmailReply(input.id, { to: input.to, subject: input.subject, body: input.body }),
    onSuccess: updated,
  });
}

export function useSyncEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: syncEmails,
    onSuccess: () => {
      // Sorting new mail takes a few seconds.
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: qk.emails.all });
        void qc.invalidateQueries({ queryKey: qk.today });
      }, 6_000);
    },
  });
}

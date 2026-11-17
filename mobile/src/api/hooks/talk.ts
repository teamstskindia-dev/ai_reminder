import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '../queryKeys';
import {
  deleteTalkThread,
  fetchTalkMessages,
  fetchTalkThreads,
  scheduleMeeting,
  sendTalk,
  setTalkActionStatus,
  type ScheduleInput,
  type TalkSendInput,
} from '../resources/talk';
import type { TalkMessage } from '../types';

export function useTalkMessages(threadId: string | null) {
  return useQuery({
    queryKey: qk.talk.messages(threadId ?? ''),
    queryFn: () => fetchTalkMessages(threadId as string),
    enabled: Boolean(threadId),
  });
}

export function useTalkThreads(enabled: boolean) {
  return useQuery({ queryKey: qk.talk.threads, queryFn: () => fetchTalkThreads(1), enabled });
}

export function useSendTalk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TalkSendInput) => sendTalk(input),
    onSuccess: (res) => {
      if (res.threadId) {
        qc.setQueryData<TalkMessage[]>(qk.talk.messages(res.threadId), (prev) => [...(prev ?? []), res.userMessage, res.reply]);
        void qc.invalidateQueries({ queryKey: qk.talk.threads });
      }
      // A reminder or to-do may have been created.
      if (res.reply.actions.length) {
        void qc.invalidateQueries({ queryKey: qk.reminders.all });
        void qc.invalidateQueries({ queryKey: qk.actionItems.all });
        void qc.invalidateQueries({ queryKey: qk.today });
      }
    },
  });
}

/** Replaces one message in a cached conversation (after an action changed). */
function useReplaceMessage() {
  const qc = useQueryClient();
  return (threadId: string | null, message: TalkMessage | null) => {
    if (!threadId || !message) return;
    qc.setQueryData<TalkMessage[]>(qk.talk.messages(threadId), (prev) => prev?.map((m) => (m.id === message.id ? message : m)));
  };
}

export function useScheduleMeeting(threadId: string | null) {
  const replace = useReplaceMessage();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ScheduleInput) => scheduleMeeting(input),
    onSuccess: (res) => {
      replace(threadId, res.message);
      void qc.invalidateQueries({ queryKey: qk.meetings.all });
      void qc.invalidateQueries({ queryKey: qk.today });
    },
  });
}

export function useTalkActionStatus(threadId: string | null) {
  const replace = useReplaceMessage();
  return useMutation({
    mutationFn: (input: { messageId: string; actionId: string; status: 'sent' | 'cancelled' }) => setTalkActionStatus(input),
    onSuccess: (message) => replace(threadId, message),
  });
}

export function useDeleteTalkThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => deleteTalkThread(threadId),
    onSuccess: (_, threadId) => {
      qc.removeQueries({ queryKey: qk.talk.messages(threadId) });
      void qc.invalidateQueries({ queryKey: qk.talk.threads });
    },
  });
}

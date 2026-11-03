import { api, apiPage } from '../client';
import type {
  AskInput,
  AskResult,
  AssistantMessage,
  AssistantThread,
  PageQuery,
} from '../types';

export function askAssistant(input: AskInput): Promise<AskResult> {
  return api<AskResult>('/assistant/ask', { method: 'POST', body: input, timeoutMs: 60_000 });
}

export function listThreads(query: PageQuery) {
  return apiPage<AssistantThread>('/assistant/threads', { query: { ...query } });
}

export function listThreadMessages(threadId: string): Promise<AssistantMessage[]> {
  return api<AssistantMessage[]>(`/assistant/threads/${threadId}/messages`);
}

export function deleteThread(threadId: string): Promise<void> {
  return api<void>(`/assistant/threads/${threadId}`, { method: 'DELETE' });
}

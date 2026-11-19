import { api } from '../client';
import type { ToolProvider, ToolTask, ToolTaskResult, ToolTaskSource } from '../types';

export interface CreateToolTaskInput {
  provider?: ToolProvider;
  actionItemId?: string;
  title?: string;
  details?: string;
  dueAt?: string;
  ownerName?: string;
  source?: ToolTaskSource;
  /** Create even though a similar task exists. */
  force?: boolean;
  /** Merge into the similar task the API found. */
  mergeWithExternalId?: string;
}

export function createToolTask(input: CreateToolTaskInput): Promise<ToolTaskResult> {
  return api<ToolTaskResult>('/tools/tasks', { method: 'POST', body: input, timeoutMs: 45_000 });
}

export function listToolTasks(actionItemId?: string): Promise<ToolTask[]> {
  return api<ToolTask[]>('/tools/tasks', { query: { actionItemId } });
}

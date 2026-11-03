import { api, apiPage } from '../client';
import type {
  ActionItem,
  ActionItemListQuery,
  CreateActionItemInput,
  UpdateActionItemInput,
} from '../types';

export function listActionItems(query: ActionItemListQuery) {
  return apiPage<ActionItem>('/action-items', { query: { ...query } });
}

export function createActionItem(input: CreateActionItemInput): Promise<ActionItem> {
  return api<ActionItem>('/action-items', { method: 'POST', body: input });
}

export function updateActionItem(id: string, input: UpdateActionItemInput): Promise<ActionItem> {
  return api<ActionItem>(`/action-items/${id}`, { method: 'PATCH', body: input });
}

export function deleteActionItem(id: string): Promise<void> {
  return api<void>(`/action-items/${id}`, { method: 'DELETE' });
}

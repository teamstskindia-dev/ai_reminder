import { api } from "./client";
import type { ActionItem, ActionItemListParams, CreateActionItemInput, UpdateActionItemInput } from "./types";

export const actionItemsApi = {
  list: (params: ActionItemListParams = {}) =>
    api.page<ActionItem>("/action-items", {
      ...params,
      mine: params.mine ? true : undefined,
    }),
  create: (input: CreateActionItemInput) => api.post<ActionItem>("/action-items", input),
  update: (id: string, input: UpdateActionItemInput) => api.patch<ActionItem>(`/action-items/${id}`, input),
  remove: (id: string) => api.delete(`/action-items/${id}`),
};

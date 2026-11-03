'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { AdminPlan, Plan } from './types';

/** POST body: "Plan fields minus id". `isActive` is accepted as an admin extension (AdminPlan). */
export type PlanInput = Omit<Plan, 'id'> & { isActive?: boolean };

export const plansApi = {
  list: (signal?: AbortSignal) => api.get<AdminPlan[]>('/admin/plans', undefined, signal),
  create: (body: PlanInput) => api.post<AdminPlan>('/admin/plans', body),
  update: (id: string, body: Partial<PlanInput>) => api.patch<AdminPlan>(`/admin/plans/${id}`, body),
  remove: (id: string) => api.delete(`/admin/plans/${id}`),
};

export function usePlans() {
  return useQuery({
    queryKey: queryKeys.plans.list(),
    queryFn: ({ signal }) => plansApi.list(signal),
  });
}

export function useCreatePlan() {
  return useApiMutation({
    mutationFn: plansApi.create,
    invalidate: [queryKeys.plans.all],
    success: 'Plan created',
  });
}

export function useUpdatePlan(options?: { silent?: boolean }) {
  return useApiMutation({
    mutationFn: ({ id, ...body }: Partial<PlanInput> & { id: string }) => plansApi.update(id, body),
    invalidate: [queryKeys.plans.all],
    success: options?.silent ? false : 'Plan saved',
  });
}

/** Errors (e.g. 409 when users are on the plan) are surfaced by the caller, so no toast here. */
export function useDeletePlan() {
  return useApiMutation({
    mutationFn: (id: string) => plansApi.remove(id),
    invalidate: [queryKeys.plans.all],
    success: 'Plan deleted',
    errorToast: false,
  });
}

'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api, type QueryParams } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { AdminUserDetail, AdminUserListItem, UserStatus } from './types';

export interface UserListParams extends QueryParams {
  q?: string;
  status?: UserStatus;
  planId?: string;
  page?: number;
  limit?: number;
  sort?: string;
}

export interface UpdateUserInput {
  name?: string;
  status?: UserStatus;
  planId?: string | null;
}

export const usersApi = {
  list: (params: UserListParams, signal?: AbortSignal) =>
    api.list<AdminUserListItem>('/admin/users', params, signal),
  get: (id: string, signal?: AbortSignal) => api.get<AdminUserDetail>(`/admin/users/${id}`, undefined, signal),
  update: (id: string, body: UpdateUserInput) => api.patch<AdminUserDetail>(`/admin/users/${id}`, body),
  remove: (id: string) => api.delete(`/admin/users/${id}`),
};

export function useUsers(params: UserListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: ({ signal }) => usersApi.list(params, signal),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  });
}

export function useUser(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.users.detail(id ?? ''),
    queryFn: ({ signal }) => usersApi.get(id as string, signal),
    enabled: Boolean(id),
  });
}

export function useUpdateUser(id: string) {
  return useApiMutation({
    mutationFn: (body: UpdateUserInput) => usersApi.update(id, body),
    invalidate: [queryKeys.users.all, queryKeys.dashboard.all],
    success: (_d, vars) =>
      vars.status === 'suspended'
        ? 'User suspended'
        : vars.status === 'active'
          ? 'User activated'
          : 'User updated',
  });
}

export function useDeleteUser() {
  return useApiMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    invalidate: [queryKeys.users.all, queryKeys.meetings.all, queryKeys.dashboard.all],
    success: 'User deleted',
  });
}

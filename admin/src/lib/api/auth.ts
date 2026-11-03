'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { AdminUser, AuthTokens } from './types';

export interface LoginInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

export const authApi = {
  login: (body: LoginInput) =>
    api.post<{ admin: AdminUser; tokens: AuthTokens }>('/admin/auth/login', body, { skipAuthRetry: true }),
  logout: () => api.post<void>('/admin/auth/logout', undefined, { skipAuthRetry: true }),
  me: (signal?: AbortSignal) => api.get<AdminUser>('/admin/auth/me', undefined, signal),
  updateMe: (body: UpdateProfileInput) => api.patch<AdminUser>('/admin/auth/me', body),
};

export function useMeQuery() {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: ({ signal }) => authApi.me(signal),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useUpdateMe() {
  return useApiMutation({
    mutationFn: authApi.updateMe,
    invalidate: [queryKeys.auth.all, queryKeys.admins.all],
    success: (_data, vars) => (vars.newPassword ? 'Password changed' : 'Profile updated'),
  });
}

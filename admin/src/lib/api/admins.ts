'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { AdminRole, AdminStatus, AdminUser } from './types';

export interface CreateAdminInput {
  email: string;
  name: string;
  role: AdminRole;
  password: string;
}

export interface UpdateAdminInput {
  name?: string;
  role?: AdminRole;
  status?: AdminStatus;
  password?: string;
}

export const adminsApi = {
  list: (signal?: AbortSignal) => api.get<AdminUser[]>('/admin/admins', undefined, signal),
  create: (body: CreateAdminInput) => api.post<AdminUser>('/admin/admins', body),
  update: (id: string, body: UpdateAdminInput) => api.patch<AdminUser>(`/admin/admins/${id}`, body),
  remove: (id: string) => api.delete(`/admin/admins/${id}`),
};

export function useAdmins(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.admins.list(),
    queryFn: ({ signal }) => adminsApi.list(signal),
    enabled: options?.enabled,
  });
}

export function useCreateAdmin() {
  return useApiMutation({
    mutationFn: adminsApi.create,
    invalidate: [queryKeys.admins.all],
    success: (a) => `${a.name} added as ${a.role.replace('_', ' ')}`,
  });
}

export function useUpdateAdmin() {
  return useApiMutation({
    mutationFn: ({ id, ...body }: UpdateAdminInput & { id: string }) => adminsApi.update(id, body),
    invalidate: [queryKeys.admins.all],
    success: (_a, vars) => (vars.password ? 'Password reset' : 'Admin updated'),
  });
}

export function useDeleteAdmin() {
  return useApiMutation({
    mutationFn: (id: string) => adminsApi.remove(id),
    invalidate: [queryKeys.admins.all],
    success: 'Admin deleted',
  });
}

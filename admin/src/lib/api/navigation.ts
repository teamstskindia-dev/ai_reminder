'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { AdminNavItem, Features, IconKey, NavLocation } from './types';

export interface NavItemInput {
  location: NavLocation;
  label: string;
  href: string;
  icon?: IconKey | null;
  groupLabel?: string | null;
  requiredFeature?: keyof Features | null;
  isExternal?: boolean;
  isActive?: boolean;
}

export const navigationApi = {
  list: (location?: NavLocation, signal?: AbortSignal) =>
    api.get<AdminNavItem[]>('/admin/navigation', { location }, signal),
  create: (body: NavItemInput) => api.post<AdminNavItem>('/admin/navigation', body),
  update: (id: string, body: Partial<NavItemInput>) => api.patch<AdminNavItem>(`/admin/navigation/${id}`, body),
  remove: (id: string) => api.delete(`/admin/navigation/${id}`),
  reorder: (ids: string[]) => api.post<AdminNavItem[]>('/admin/navigation/reorder', { ids }),
};

export function useNavigation(location?: NavLocation) {
  return useQuery({
    queryKey: queryKeys.navigation.list(location),
    queryFn: ({ signal }) => navigationApi.list(location, signal),
  });
}

export function useCreateNavItem() {
  return useApiMutation({
    mutationFn: navigationApi.create,
    invalidate: [queryKeys.navigation.all],
    success: 'Navigation item created',
  });
}

export function useUpdateNavItem(options?: { silent?: boolean }) {
  return useApiMutation({
    mutationFn: ({ id, ...body }: Partial<NavItemInput> & { id: string }) => navigationApi.update(id, body),
    invalidate: [queryKeys.navigation.all],
    success: options?.silent ? false : 'Navigation item saved',
  });
}

export function useDeleteNavItem() {
  return useApiMutation({
    mutationFn: (id: string) => navigationApi.remove(id),
    invalidate: [queryKeys.navigation.all],
    success: 'Navigation item deleted',
  });
}

export function useReorderNavItems() {
  return useApiMutation({
    mutationFn: (ids: string[]) => navigationApi.reorder(ids),
    invalidate: [queryKeys.navigation.all],
    success: 'Order saved',
  });
}

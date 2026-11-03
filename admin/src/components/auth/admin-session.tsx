'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';

import { authApi, useMeQuery } from '@/lib/api/auth';
import { isApiError, type ApiError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import type { AdminRole, AdminUser, SettingKey } from '@/lib/api/types';
import { hasRole, settingEditRole } from '@/lib/roles';

interface AdminSessionValue {
  admin: AdminUser | null;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => void;
  /** True when the signed-in admin has at least `min`. False while the session is loading. */
  can: (min: AdminRole) => boolean;
  canEditSetting: (key: SettingKey) => boolean;
  logout: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const query = useMeQuery();
  const queryClient = useQueryClient();
  const router = useRouter();
  const admin = query.data ?? null;
  const { refetch } = query;

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
      logger.info('admin signed out');
    } catch (error) {
      // Even if the API is unreachable, drop local state and go to the login screen.
      logger.warn('logout request failed', { code: isApiError(error) ? error.code : 'UNKNOWN' });
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    router.replace('/login');
  }, [queryClient, router]);

  const value = useMemo<AdminSessionValue>(
    () => ({
      admin,
      isLoading: query.isPending,
      error: (query.error as ApiError | null) ?? null,
      refetch: () => void refetch(),
      can: (min) => hasRole(admin?.role, min),
      canEditSetting: (key) => hasRole(admin?.role, settingEditRole(key)),
      logout,
    }),
    [admin, query.isPending, query.error, refetch, logout],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error('useAdminSession must be used inside <AdminSessionProvider>');
  return ctx;
}

export function useCan(): (min: AdminRole) => boolean {
  return useAdminSession().can;
}

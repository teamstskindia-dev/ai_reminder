'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { api, type QueryParams } from './client';
import { queryKeys } from './query-keys';
import type { AuditLog } from './types';

export interface AuditLogParams extends QueryParams {
  entity?: string;
  adminId?: string;
  page?: number;
  limit?: number;
}

export const auditLogsApi = {
  list: (params: AuditLogParams, signal?: AbortSignal) => api.list<AuditLog>('/admin/audit-logs', params, signal),
};

export function useAuditLogs(params: AuditLogParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.auditLogs.list(params),
    queryFn: ({ signal }) => auditLogsApi.list(params, signal),
    placeholderData: keepPreviousData,
    enabled: options?.enabled,
  });
}

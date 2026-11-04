import type { QueryParams } from './client';
import type { NavLocation, QueueName, SettingKey } from './types';

/**
 * Query-key factory. Every key starts with its resource name so a whole resource can be invalidated with
 * `queryClient.invalidateQueries({ queryKey: queryKeys.users.all })`.
 */
export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    me: () => ['auth', 'me'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    stats: () => ['dashboard', 'stats'] as const,
  },
  users: {
    all: ['users'] as const,
    list: (params: QueryParams) => ['users', 'list', params] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },
  meetings: {
    all: ['meetings'] as const,
    list: (params: QueryParams) => ['meetings', 'list', params] as const,
    detail: (id: string) => ['meetings', 'detail', id] as const,
    transcript: (id: string) => ['meetings', 'transcript', id] as const,
  },
  settings: {
    all: ['settings'] as const,
    list: () => ['settings', 'list'] as const,
    detail: (key: SettingKey) => ['settings', 'detail', key] as const,
  },
  sections: {
    all: ['sections'] as const,
    list: (params: QueryParams) => ['sections', 'list', params] as const,
  },
  pages: {
    all: ['pages'] as const,
    list: (params: QueryParams) => ['pages', 'list', params] as const,
    detail: (id: string) => ['pages', 'detail', id] as const,
  },
  navigation: {
    all: ['navigation'] as const,
    list: (location?: NavLocation) => ['navigation', 'list', location ?? 'all'] as const,
  },
  banners: {
    all: ['banners'] as const,
    list: (params: QueryParams) => ['banners', 'list', params] as const,
  },
  plans: {
    all: ['plans'] as const,
    list: () => ['plans', 'list'] as const,
  },
  media: {
    all: ['media'] as const,
    list: (params: QueryParams) => ['media', 'list', params] as const,
  },
  ai: {
    all: ['ai'] as const,
    prompts: () => ['ai', 'prompts'] as const,
  },
  templates: {
    all: ['notification-templates'] as const,
    list: () => ['notification-templates', 'list'] as const,
  },
  broadcasts: {
    all: ['broadcasts'] as const,
    list: (params: QueryParams) => ['broadcasts', 'list', params] as const,
  },
  admins: {
    all: ['admins'] as const,
    list: () => ['admins', 'list'] as const,
  },
  auditLogs: {
    all: ['audit-logs'] as const,
    list: (params: QueryParams) => ['audit-logs', 'list', params] as const,
  },
  bot: {
    all: ['bot'] as const,
    providers: () => ['bot', 'providers'] as const,
  },
  system: {
    all: ['system'] as const,
    queues: () => ['system', 'queues'] as const,
    failed: (name: QueueName, params: QueryParams) => ['system', 'queues', name, 'failed', params] as const,
  },
} as const;

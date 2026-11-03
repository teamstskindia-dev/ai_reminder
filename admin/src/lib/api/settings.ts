'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import { useApiMutation } from './mutation';
import { queryKeys } from './query-keys';
import type { AppSettingRecord, SettingKey, SettingValue } from './types';

export const settingsApi = {
  list: (signal?: AbortSignal) => api.get<AppSettingRecord[]>('/admin/settings', undefined, signal),
  get: <K extends SettingKey>(key: K, signal?: AbortSignal) =>
    api.get<AppSettingRecord<K>>(`/admin/settings/${key}`, undefined, signal),
  put: <K extends SettingKey>(key: K, value: SettingValue[K]) =>
    api.put<AppSettingRecord<K>>(`/admin/settings/${key}`, { value }),
};

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.list(),
    queryFn: ({ signal }) => settingsApi.list(signal),
  });
}

export function useSetting<K extends SettingKey>(key: K) {
  return useQuery({
    queryKey: queryKeys.settings.detail(key),
    queryFn: ({ signal }) => settingsApi.get(key, signal),
  });
}

export const SETTING_LABELS: Record<SettingKey, string> = {
  branding: 'Branding',
  theme: 'Theme',
  features: 'Features & app',
  app: 'App & maintenance',
  seo: 'SEO',
  ai: 'AI',
  bot: 'Meeting bot',
  notifications: 'Notifications',
};

export function useUpdateSetting<K extends SettingKey>(key: K) {
  return useApiMutation({
    mutationFn: (value: SettingValue[K]) => settingsApi.put(key, value),
    invalidate: [queryKeys.settings.all],
    success: `${SETTING_LABELS[key]} saved`,
  });
}

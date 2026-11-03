import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '../queryKeys';
import { deleteAccount, updateSettings } from '../resources/auth';
import { disconnectGoogleCalendar, listIntegrations, syncGoogleCalendar } from '../resources/integrations';
import type { AuthMe, UserSettings } from '../types';

/** PATCH /me/settings with an optimistic update of the cached `/auth/me` settings. */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<UserSettings>) => updateSettings(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.me });
      const previous = qc.getQueryData<AuthMe>(qk.me);
      if (previous) qc.setQueryData<AuthMe>(qk.me, { ...previous, settings: { ...previous.settings, ...patch } });
      return previous;
    },
    onError: (_error, _patch, previous) => {
      if (previous) qc.setQueryData(qk.me, previous);
    },
    onSuccess: (settings) => {
      qc.setQueryData<AuthMe>(qk.me, (prev) => (prev ? { ...prev, settings } : prev));
    },
  });
}

export function useIntegrations(enabled = true) {
  return useQuery({ queryKey: qk.integrations, queryFn: listIntegrations, enabled });
}

export function useSyncCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: syncGoogleCalendar,
    onSuccess: () => {
      // The sync runs in the background; refresh status and meetings shortly after.
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: qk.integrations });
        void qc.invalidateQueries({ queryKey: qk.meetings.all });
        void qc.invalidateQueries({ queryKey: qk.dashboard });
      }, 4_000);
    },
  });
}

export function useDisconnectCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: disconnectGoogleCalendar,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.integrations });
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.meetings.all });
    },
  });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: deleteAccount });
}

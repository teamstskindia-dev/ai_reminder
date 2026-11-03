"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { devicesApi } from "@/lib/api/devices";
import { integrationsApi } from "@/lib/api/integrations";
import type { Integration } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";

export function useIntegrations() {
  return useQuery({ queryKey: qk.integrations, queryFn: () => integrationsApi.list() });
}

export function useGoogleCalendarIntegration() {
  const query = useIntegrations();
  const integration: Integration | undefined = query.data?.find((i) => i.provider === "google_calendar");
  return { ...query, integration };
}

export function useSyncCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => integrationsApi.syncGoogleCalendar(),
    onSuccess: () => {
      // The sync runs in the background; refresh a little later so new meetings appear.
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: qk.integrations });
        void queryClient.invalidateQueries({ queryKey: qk.meetings.all });
        void queryClient.invalidateQueries({ queryKey: qk.dashboard });
      }, 4000);
    },
  });
}

export function useDisconnectCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => integrationsApi.disconnectGoogleCalendar(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.integrations });
      void queryClient.invalidateQueries({ queryKey: qk.session });
      void queryClient.invalidateQueries({ queryKey: qk.meetings.all });
      void queryClient.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useDevices() {
  return useQuery({ queryKey: qk.devices, queryFn: () => devicesApi.list() });
}

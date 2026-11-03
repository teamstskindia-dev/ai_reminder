"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meApi } from "@/lib/api/me";
import type { Session, UserSettings } from "@/lib/api/types";
import { qk } from "@/lib/query-keys";

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: () => meApi.getSettings() });
}

/** Optimistically patch user settings (rolls back on error). */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<UserSettings>) => meApi.updateSettings(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: qk.settings });
      const previous = queryClient.getQueryData<UserSettings>(qk.settings);
      if (previous) queryClient.setQueryData<UserSettings>(qk.settings, { ...previous, ...input });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk.settings, context.previous);
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(qk.settings, settings);
      queryClient.setQueryData<Session>(qk.session, (prev) => (prev ? { ...prev, settings } : prev));
    },
  });
}

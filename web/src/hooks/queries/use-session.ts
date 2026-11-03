"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { meApi, type UpdateMeInput } from "@/lib/api/me";
import type { Session, User } from "@/lib/api/types";
import { hardNavigate } from "@/lib/navigation";
import { qk } from "@/lib/query-keys";

/** The signed-in user + their settings (`GET /auth/me`). */
export function useSession() {
  return useQuery({
    queryKey: qk.session,
    queryFn: ({ signal }) => authApi.me(signal),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useCurrentUser(): User | undefined {
  return useSession().data?.user;
}

/** Sign out: revoke the session, drop all cached data and go to the landing page. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout().catch(() => undefined),
    onSettled: () => {
      queryClient.clear();
      hardNavigate("/");
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeInput) => meApi.update(input),
    onSuccess: (user) => {
      queryClient.setQueryData<Session>(qk.session, (prev) => (prev ? { ...prev, user } : prev));
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => meApi.remove(),
    onSuccess: () => {
      queryClient.clear();
      hardNavigate("/");
    },
  });
}

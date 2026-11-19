import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '../queryKeys';
import { disconnectIntegration, fetchToolTargets, updateIntegration } from '../resources/integrations';
import { createToolTask, listToolTasks, type CreateToolTaskInput } from '../resources/tools';
import type { ConnectedProvider, ToolProvider } from '../types';

export function useToolTargets(provider: ToolProvider | null) {
  return useQuery({
    queryKey: qk.toolTargets(provider ?? ''),
    queryFn: () => fetchToolTargets(provider as ToolProvider),
    enabled: Boolean(provider),
    staleTime: 60_000,
  });
}

export function useUpdateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: ConnectedProvider; targetId?: string | null; targetName?: string | null; autoSend?: boolean }) => {
      const { provider, ...patch } = input;
      return updateIntegration(provider, patch);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.integrations }),
  });
}

export function useDisconnectIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: ConnectedProvider) => disconnectIntegration(provider),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.integrations });
      void qc.invalidateQueries({ queryKey: qk.emails.all });
      void qc.invalidateQueries({ queryKey: qk.today });
    },
  });
}

export function useToolTasks(actionItemId?: string) {
  return useQuery({
    queryKey: actionItemId ? qk.toolTasks.forItem(actionItemId) : qk.toolTasks.all,
    queryFn: () => listToolTasks(actionItemId),
  });
}

export function useCreateToolTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateToolTaskInput) => createToolTask(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.toolTasks.all });
      void qc.invalidateQueries({ queryKey: qk.actionItems.all });
      void qc.invalidateQueries({ queryKey: qk.today });
    },
  });
}

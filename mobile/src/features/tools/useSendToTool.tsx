import { useState } from 'react';
import { Alert } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useIntegrations } from '@/api/hooks/profile';
import { useCreateToolTask } from '@/api/hooks/tools';
import type { CreateToolTaskInput } from '@/api/resources/tools';
import type { ToolProvider, ToolTaskResult } from '@/api/types';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { providerName } from '@/features/integrations/connect';
import { haptics } from '@/utils/haptics';
import { openExternal } from '@/utils/links';
import { toast } from '@/utils/toast';

type Input = Omit<CreateToolTaskInput, 'provider' | 'force' | 'mergeWithExternalId'>;

/**
 * Sends a to-do to Notion, Jira, Linear or Todoist (user-flow §08). With several tools connected the user
 * picks one; a similar open task in the tool asks "merge or create new"; a tool that is down keeps the to-do
 * in the app and retries. Nothing is created without the user's tap.
 */
export function useSendToTool() {
  const integrations = useIntegrations();
  const create = useCreateToolTask();
  const [picking, setPicking] = useState<Input | null>(null);
  const tools = (integrations.data ?? [])
    .filter((i) => i.kind === 'tasks' && i.connected)
    .map((i) => i.provider as ToolProvider);

  const report = (provider: ToolProvider, res: ToolTaskResult, input: Input) => {
    const name = providerName(provider);
    if (res.outcome === 'created') {
      haptics.success();
      toast(`Created in ${name}${res.task?.externalKey ? ` · ${res.task.externalKey}` : ''}`);
    } else if (res.outcome === 'linked') {
      toast(`Linked to the ${name} task`);
    } else if (res.outcome === 'queued') {
      toast(`${name} isn't reachable right now. It's in your to-dos and I'll send it soon.`);
    } else if (res.outcome === 'duplicate' && res.duplicate) {
      const dup = res.duplicate;
      Alert.alert(
        `Similar task in ${name}`,
        `“${dup.title}”${dup.externalKey ? ` (${dup.externalKey})` : ''} is already open.`,
        [
          { text: 'Cancel', style: 'cancel' },
          ...(dup.url ? [{ text: 'Open it', onPress: () => void openExternal(dup.url as string) }] : []),
          { text: 'Merge', onPress: () => run(provider, { ...input }, { mergeWithExternalId: dup.externalId }) },
          { text: 'Create new', onPress: () => run(provider, { ...input }, { force: true }) },
        ],
      );
    }
  };

  const run = (provider: ToolProvider, input: Input, extra: { force?: boolean; mergeWithExternalId?: string } = {}) => {
    create.mutate(
      { ...input, provider, ...extra },
      {
        onSuccess: (res) => report(provider, res, input),
        onError: (error) => toast(getErrorMessage(error, `Couldn't send it to ${providerName(provider)}.`)),
      },
    );
  };

  const send = (input: Input) => {
    if (!tools.length) {
      toast('Connect Notion, Jira, Linear or Todoist in Profile → Connected apps first.');
      return;
    }
    if (tools.length === 1) run(tools[0], input);
    else setPicking(input);
  };

  const sheet = (
    <ActionSheet
      visible={picking !== null}
      title="Send to"
      options={tools.map((t) => ({
        key: t,
        label: providerName(t),
        onPress: () => {
          if (picking) run(t, picking);
        },
      }))}
      onClose={() => setPicking(null)}
    />
  );

  return { send, sheet, tools, pending: create.isPending };
}

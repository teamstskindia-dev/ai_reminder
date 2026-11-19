import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';
import { useState } from 'react';

import { getErrorMessage } from '@/api/errors';
import { useIntegrations } from '@/api/hooks/profile';
import { qk } from '@/api/queryKeys';
import { createToolTask } from '@/api/resources/tools';
import type { ActionItem, LanguageStyle, ToolProvider } from '@/api/types';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { Button } from '@/components/ui/Button';
import { providerName } from '@/features/integrations/connect';
import { pick } from '@/features/setup/shared';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

/**
 * "Send tasks to Notion or Jira" on a recorded meeting's review card (user-flow §04, §08). Only the user's
 * open to-dos go; ones that look like an existing task are skipped and reported, never duplicated.
 */
export function SendAllToTool({ items, lang }: { items: ActionItem[]; lang: LanguageStyle }) {
  const qc = useQueryClient();
  const integrations = useIntegrations();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const tools = (integrations.data ?? []).filter((i) => i.kind === 'tasks' && i.connected).map((i) => i.provider as ToolProvider);
  const open = items.filter((i) => i.status === 'open');
  if (!tools.length || !open.length) return null;

  const run = async (provider: ToolProvider) => {
    setBusy(true);
    let created = 0;
    let similar = 0;
    let queued = 0;
    try {
      for (const item of open) {
        const res = await createToolTask({ provider, actionItemId: item.id, source: 'meeting' });
        if (res.outcome === 'created') created++;
        else if (res.outcome === 'duplicate') similar++;
        else if (res.outcome === 'queued') queued++;
      }
      haptics.success();
      const name = providerName(provider);
      const parts = [
        created ? pick(lang, `${created} sent to ${name}`, `${created} ${name} mein bheje`) : null,
        similar ? pick(lang, `${similar} already there (long-press to merge)`, `${similar} pehle se hain (merge ke liye long-press)`) : null,
        queued ? pick(lang, `${queued} will go when ${name} is back`, `${queued} ${name} wapas aane par jayenge`) : null,
      ].filter(Boolean);
      toast(parts.join(' · ') || pick(lang, 'Already sent', 'Pehle hi bhej diye'));
    } catch (error) {
      toast(getErrorMessage(error, `Couldn't send to ${providerName(provider)}.`));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: qk.toolTasks.all });
    }
  };

  return (
    <>
      <Button
        label={
          tools.length === 1
            ? pick(lang, `Send to-dos to ${providerName(tools[0])}`, `To-dos ${providerName(tools[0])} mein bhejo`)
            : pick(lang, 'Send to-dos to a tool', 'To-dos tool mein bhejo')
        }
        icon={Send}
        size="sm"
        variant="secondary"
        loading={busy}
        onPress={() => (tools.length === 1 ? void run(tools[0]) : setPicking(true))}
      />
      <ActionSheet
        visible={picking}
        title={pick(lang, 'Send to', 'Kahan bhejein')}
        options={tools.map((t) => ({ key: t, label: providerName(t), onPress: () => void run(t) }))}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

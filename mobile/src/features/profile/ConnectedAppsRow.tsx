import { router } from 'expo-router';
import { Plug } from 'lucide-react-native';

import { useIntegrations } from '@/api/hooks/profile';
import { ListGroup, ListRow } from '@/components/ui/ListRow';
import { providerName } from '@/features/integrations/connect';

/** Profile → Connected apps: calendar, email and task tools, with a hint when one needs a reconnect. */
export function ConnectedAppsRow() {
  const integrations = useIntegrations();
  const list = integrations.data ?? [];
  const broken = list.filter((i) => i.status === 'needs_reconnect');
  const connected = list.filter((i) => i.connected).map((i) => providerName(i.provider));
  const subtitle = broken.length
    ? `Reconnect ${broken.map((i) => providerName(i.provider)).join(', ')}`
    : connected.length
      ? connected.join(', ')
      : 'Calendar, Gmail, Outlook, Notion, Jira and more';
  return (
    <ListGroup title="Integrations">
      <ListRow
        icon={Plug}
        title="Connected apps"
        subtitle={subtitle}
        value={broken.length ? '!' : connected.length ? String(connected.length) : null}
        onPress={() => router.push('/connected-apps')}
      />
    </ListGroup>
  );
}

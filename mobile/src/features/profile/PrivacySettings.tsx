import { router } from 'expo-router';
import { BrainCog, Download, HatGlasses, LoaderCircle } from 'lucide-react-native';
import { Linking, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useDataExport, useRequestExport } from '@/api/hooks/memory';
import type { UserSettings } from '@/api/types';
import { ListGroup, ListRow, SwitchRow } from '@/components/ui/ListRow';
import { formatDayLabel } from '@/utils/format';
import { openExternal } from '@/utils/links';
import { toast } from '@/utils/toast';

/** The export link is https in production; a development API on localhost opens in the phone's browser. */
async function openDownload(url: string): Promise<void> {
  if (url.startsWith('https://')) return openExternal(url);
  if (__DEV__) await Linking.openURL(url).catch(() => toast('Couldn’t open the download link.'));
}

/**
 * Privacy (user-flow §10): pause learning, incognito chats, export everything. Deleting the account lives at
 * the bottom of the You screen.
 */
export function PrivacySettings({ settings, onChange }: { settings: UserSettings; onChange: (patch: Partial<UserSettings>) => void }) {
  const exportStatus = useDataExport();
  const requestExport = useRequestExport();
  const status = exportStatus.data;

  const exportRow =
    status?.status === 'ready' && status.url ? (
      <ListRow
        icon={Download}
        title="Download my data"
        subtitle={`Ready. Link works until ${status.expiresAt ? formatDayLabel(status.expiresAt) : 'in 3 days'}. Also sent to your email.`}
        onPress={() => void openDownload(status.url as string)}
      />
    ) : status?.status === 'preparing' ? (
      <ListRow icon={LoaderCircle} title="Preparing your export…" subtitle="I’ll email you the link in a few minutes." chevron={false} />
    ) : (
      <ListRow
        icon={Download}
        title="Export my data"
        subtitle="Conversations, transcripts, reminders, people and what I know about you, as one file"
        disabled={requestExport.isPending}
        onPress={() =>
          requestExport.mutate(undefined, {
            onSuccess: () => toast('Preparing your export. I’ll email you the link.'),
            onError: (e) => toast(getErrorMessage(e)),
          })
        }
      />
    );

  return (
    <View>
      <ListGroup title="Privacy">
        <SwitchRow
          icon={BrainCog}
          title="Pause learning"
          subtitle={
            settings.learningPaused
              ? 'I keep your memories and reminders, but learn nothing new about you.'
              : 'Stop me from learning new things about you (facts, mood, timing)'
          }
          value={settings.learningPaused}
          onValueChange={(learningPaused) => {
            onChange({ learningPaused });
            toast(learningPaused ? 'Learning paused.' : 'I’ll keep learning about you again.');
          }}
        />
        <ListRow
          icon={HatGlasses}
          title="Incognito chat"
          subtitle="A Talk chat that is never saved or learned from"
          onPress={() => router.push({ pathname: '/ask', params: { incognito: '1' } })}
        />
        {exportRow}
      </ListGroup>
    </View>
  );
}

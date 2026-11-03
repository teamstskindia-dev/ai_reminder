import { CalendarCheck, CalendarX, RefreshCw } from 'lucide-react-native';
import { Alert, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useDisconnectCalendar, useIntegrations, useSyncCalendar } from '@/api/hooks/profile';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { useGoogleReconnect } from '@/features/auth/useGoogleReconnect';
import { useTheme } from '@/theme/ThemeProvider';
import { formatRelative } from '@/utils/format';
import { toast } from '@/utils/toast';

export function CalendarIntegration() {
  const theme = useTheme();
  const integrations = useIntegrations();
  const sync = useSyncCalendar();
  const disconnect = useDisconnectCalendar();
  const { reconnect, pending: reconnecting } = useGoogleReconnect();
  const calendar = integrations.data?.find((i) => i.provider === 'google_calendar') ?? null;
  const connected = Boolean(calendar?.connected);
  const hasError = Boolean(calendar?.syncError);

  const confirmDisconnect = () => {
    Alert.alert(
      'Disconnect Google Calendar?',
      'The notetaker will stop joining your calendar meetings until you reconnect.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () =>
            disconnect.mutate(undefined, {
              onSuccess: () => toast('Google Calendar disconnected'),
            }),
        },
      ],
    );
  };

  return (
    <View style={styles.group}>
      <Text variant="micro" tone="muted" style={styles.title}>
        INTEGRATIONS
      </Text>
      <Card>
        <View style={styles.head}>
          <View style={[styles.icon, { backgroundColor: connected && !hasError ? theme.colors.successSoft : theme.colors.warningSoft }]}>
            {connected ? (
              <CalendarCheck size={20} color={hasError ? theme.colors.warning : theme.colors.success} />
            ) : (
              <CalendarX size={20} color={theme.colors.warning} />
            )}
          </View>
          <View style={styles.flex}>
            <Text variant="subheading">Google Calendar</Text>
            {integrations.isPending ? (
              <Skeleton width="60%" height={12} />
            ) : (
              <Text variant="caption" tone="secondary" numberOfLines={2}>
                {connected
                  ? `${calendar?.accountEmail ?? 'Connected'}${calendar?.lastSyncedAt ? ` · synced ${formatRelative(calendar.lastSyncedAt)}` : ''}`
                  : integrations.isError
                    ? getErrorMessage(integrations.error)
                    : 'Not connected — the notetaker can’t see your meetings.'}
              </Text>
            )}
          </View>
          {!integrations.isPending ? (
            <Chip label={connected ? (hasError ? 'Needs attention' : 'Connected') : 'Off'} tone={connected && !hasError ? 'success' : 'warning'} />
          ) : null}
        </View>

        {calendar?.syncError ? (
          <Text variant="caption" tone="warning" style={styles.error}>
            {calendar.syncError}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {connected ? (
            <Button
              label="Sync now"
              icon={RefreshCw}
              size="sm"
              variant="secondary"
              loading={sync.isPending}
              onPress={() =>
                sync.mutate(undefined, {
                  onSuccess: () => toast('Sync started. New meetings will appear shortly.'),
                })
              }
            />
          ) : null}
          <Button
            label={connected ? 'Reconnect' : 'Connect'}
            size="sm"
            variant={connected ? 'outline' : 'primary'}
            loading={reconnecting}
            onPress={() => void reconnect()}
          />
          {connected ? <Button label="Disconnect" size="sm" variant="ghost" onPress={confirmDisconnect} loading={disconnect.isPending} /> : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  title: {
    paddingHorizontal: 4,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  error: {
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
});

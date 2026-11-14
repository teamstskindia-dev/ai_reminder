import { CalendarCheck, CalendarDays, Mail, Plug } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useIntegrations } from '@/api/hooks/profile';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { useGoogleReconnect } from '@/features/auth/useGoogleReconnect';
import { useTheme } from '@/theme/ThemeProvider';

import { StepLayout, type StepProps } from '../shared';

/** D1 — signed in with Google: offer Calendar now or later (Gmail arrives in MVP+). */
export function ConnectStep({ onNext }: StepProps) {
  const theme = useTheme();
  const integrations = useIntegrations();
  const { reconnect, pending } = useGoogleReconnect();
  const calendar = integrations.data?.find((i) => i.provider === 'google_calendar');
  const connected = Boolean(calendar?.connected);

  return (
    <StepLayout
      icon={Plug}
      title="Connect your day"
      body="With your calendar I can prep you before meetings and remind you about what you promised. You can do this later too."
      footer={
        <>
          <Button label="Continue" onPress={onNext} size="lg" fullWidth />
          {!connected ? <Button label="Maybe later" variant="ghost" onPress={onNext} fullWidth /> : null}
        </>
      }
    >
      <Card>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: connected ? theme.colors.successSoft : theme.colors.primarySoft }]}>
            {connected ? <CalendarCheck size={20} color={theme.colors.success} /> : <CalendarDays size={20} color={theme.colors.primaryText} />}
          </View>
          <View style={styles.flex}>
            <Text variant="subheading">Google Calendar</Text>
            <Text variant="caption" tone="secondary" numberOfLines={2}>
              {connected ? (calendar?.accountEmail ?? 'Connected') : 'Meeting prep, reminders and a daily plan'}
            </Text>
          </View>
          {connected ? (
            <Chip label="Connected" tone="success" />
          ) : (
            <Button label="Connect" size="sm" loading={pending} onPress={() => void reconnect()} />
          )}
        </View>
      </Card>
      <Card muted>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: theme.colors.surfaceMuted }]}>
            <Mail size={20} color={theme.colors.textMuted} />
          </View>
          <View style={styles.flex}>
            <Text variant="subheading">Gmail</Text>
            <Text variant="caption" tone="secondary">
              Important emails and reply drafts
            </Text>
          </View>
          <Chip label="Coming soon" tone="neutral" />
        </View>
      </Card>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  row: {
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
});

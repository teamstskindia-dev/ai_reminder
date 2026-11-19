import { CircleDot, Mail, NotebookText, SquareCheck, SquareKanban, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useIntegrations } from '@/api/hooks/profile';
import { useDisconnectIntegration, useToolTargets, useUpdateIntegration } from '@/api/hooks/tools';
import type { ConnectedProvider, Integration, ToolProvider } from '@/api/types';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { CalendarIntegration } from '@/features/profile/CalendarIntegration';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatRelative } from '@/utils/format';
import { toast } from '@/utils/toast';

import { providerName, useConnectApp } from './connect';

const ICON: Record<ConnectedProvider, LucideIcon> = {
  gmail: Mail,
  outlook: Mail,
  notion: NotebookText,
  jira: SquareKanban,
  linear: CircleDot,
  todoist: SquareCheck,
};

const BLURB: Record<ConnectedProvider, string> = {
  gmail: 'Alerts for what matters, a digest for the rest, reply drafts',
  outlook: 'Alerts for what matters, a digest for the rest, reply drafts',
  notion: 'Send to-dos to a database, save summaries as pages',
  jira: 'Turn action items into issues, see what is pending',
  linear: 'Turn action items into issues, see what is assigned to you',
  todoist: 'Send to-dos to a project and keep them in sync',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="micro" tone="muted" style={styles.groupTitle}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function statusChip(i: Integration) {
  if (!i.available) return <Chip label="Coming soon" />;
  if (i.status === 'needs_reconnect') return <Chip label="Reconnect" tone="warning" />;
  if (i.connected) return <Chip label="Connected" tone="success" />;
  return null;
}

function AppCard({ integration }: { integration: Integration }) {
  const theme = useTheme();
  const provider = integration.provider as ConnectedProvider;
  const Icon = ICON[provider];
  const isEmail = integration.kind === 'email';
  const { connect, pending } = useConnectApp();
  const disconnect = useDisconnectIntegration();
  const update = useUpdateIntegration();
  const [choosingMode, setChoosingMode] = useState(false);
  const [pickingTarget, setPickingTarget] = useState(false);
  const targets = useToolTargets(pickingTarget && !isEmail ? (provider as ToolProvider) : null);
  const name = providerName(provider);
  const linked = integration.status !== 'not_connected';

  const startConnect = () => {
    if (isEmail) setChoosingMode(true);
    else void connect(provider);
  };

  const confirmDisconnect = () =>
    Alert.alert(
      `Disconnect ${name}?`,
      isEmail
        ? 'I stop reading your inbox and forget the email summaries I kept.'
        : 'New tasks stay in the app as to-dos. Tasks already in the tool stay there.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnect.mutate(provider, { onSuccess: () => toast(`${name} disconnected`) }),
        },
      ],
    );

  const s = integration.settings;
  return (
    <Card style={!integration.available ? styles.dim : undefined}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: integration.connected ? theme.colors.successSoft : theme.colors.primarySoft }]}>
          <Icon size={20} color={integration.connected ? theme.colors.success : theme.colors.primaryText} />
        </View>
        <View style={styles.flex}>
          <Text variant="subheading">{name}</Text>
          <Text variant="caption" tone="secondary" numberOfLines={2}>
            {linked && integration.accountEmail
              ? `${integration.accountEmail}${integration.lastSyncedAt ? ` · checked ${formatRelative(integration.lastSyncedAt)}` : ''}`
              : BLURB[provider]}
          </Text>
        </View>
        {statusChip(integration)}
      </View>

      {integration.syncError ? (
        <Text variant="caption" tone="warning" style={styles.note}>
          {integration.syncError}
        </Text>
      ) : null}

      {integration.connected && isEmail ? (
        <Text variant="caption" tone="muted" style={styles.note}>
          {s?.canSend
            ? 'Read + send: replies go out only after you approve them.'
            : 'Read only: replies open in your email app.'}{' '}
          OTPs, passwords and statements are never kept.
        </Text>
      ) : null}

      {integration.connected && !isEmail ? (
        <View style={styles.settings}>
          <Button
            label={s?.targetName ? `Default: ${s.targetName}` : 'Choose default project'}
            size="sm"
            variant="secondary"
            onPress={() => setPickingTarget(true)}
          />
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text variant="callout">Send without asking</Text>
              <Text variant="caption" tone="secondary">
                Off: I show each task first and you tap Send.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Send tasks without asking"
              value={Boolean(s?.autoSend)}
              onValueChange={(autoSend) => update.mutate({ provider, autoSend })}
              trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
              thumbColor={s?.autoSend ? theme.colors.primaryForeground : theme.colors.surface}
            />
          </View>
        </View>
      ) : null}

      {integration.available ? (
        <View style={styles.actions}>
          {integration.status === 'not_connected' ? (
            <Button label="Connect" size="sm" loading={pending === provider} onPress={startConnect} />
          ) : (
            <>
              <Button
                label="Reconnect"
                size="sm"
                variant={integration.status === 'needs_reconnect' ? 'primary' : 'outline'}
                loading={pending === provider}
                onPress={startConnect}
              />
              <Button label="Disconnect" size="sm" variant="ghost" loading={disconnect.isPending} onPress={confirmDisconnect} />
            </>
          )}
        </View>
      ) : null}

      <ActionSheet
        visible={choosingMode}
        title={`Connect ${name}`}
        message="Nothing is ever sent without your approval."
        options={[
          { key: 'send', label: 'Read and send replies I approve', onPress: () => void connect(provider, 'send') },
          { key: 'read', label: 'Read only', onPress: () => void connect(provider, 'read') },
        ]}
        onClose={() => setChoosingMode(false)}
      />
      <ActionSheet
        visible={pickingTarget && Boolean(targets.data)}
        title={provider === 'notion' ? 'Default Notion database' : 'Default project'}
        message={
          targets.data && !targets.data.length
            ? provider === 'notion'
              ? 'Share a database with the app in Notion (… → Connections) first.'
              : 'No projects found.'
            : undefined
        }
        options={(targets.data ?? []).map((t) => ({
          key: t.id,
          label: t.name + (t.id === s?.targetId ? '  ✓' : ''),
          onPress: () => update.mutate({ provider, targetId: t.id, targetName: t.name }),
        }))}
        onClose={() => setPickingTarget(false)}
      />
      {pickingTarget && targets.isError ? (
        <Text variant="caption" tone="danger" style={styles.note}>
          {getErrorMessage(targets.error)}
        </Text>
      ) : null}
    </Card>
  );
}

/** Connected apps (user-flow §07, §08): calendar, email and task tools in one place. */
export function ConnectedAppsScreen() {
  const theme = useTheme();
  const { isEnabled } = useConfig();
  const integrations = useIntegrations();
  const refreshControl = useRefreshControl(() => integrations.refetch());
  const list = integrations.data ?? [];
  const email = list.filter((i) => i.kind === 'email');
  const tools = list.filter((i) => i.kind === 'tasks');

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={refreshControl}
    >
      {isEnabled('calendarSync') ? <CalendarIntegration /> : null}
      {integrations.isPending ? (
        <View style={styles.group}>
          <Skeleton height={110} radius={16} />
          <Skeleton height={110} radius={16} />
        </View>
      ) : integrations.isError ? (
        <ErrorState error={integrations.error} onRetry={() => void integrations.refetch()} retrying={integrations.isFetching} />
      ) : (
        <>
          <Section title="Email">
            {email.map((i) => (
              <AppCard key={i.provider} integration={i} />
            ))}
          </Section>
          <Section title="Tasks and notes">
            {tools.map((i) => (
              <AppCard key={i.provider} integration={i} />
            ))}
          </Section>
          <Text variant="caption" tone="muted" align="center">
            I never send, post or share anything without showing you first.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },
  group: { gap: 10 },
  groupTitle: { paddingHorizontal: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  note: { marginTop: 10 },
  settings: { marginTop: 12, gap: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  dim: { opacity: 0.7 },
});

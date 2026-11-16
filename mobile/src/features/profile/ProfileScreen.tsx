import { router } from 'expo-router';
import { FileText, Info, LifeBuoy, LogOut, Shield, Trash, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useDeleteAccount, useUpdateSettings } from '@/api/hooks/profile';
import type { NavItem, UserSettings } from '@/api/types';
import { TabHeader } from '@/components/layout/TabHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { ListGroup, ListRow } from '@/components/ui/ListRow';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { useTabLabel } from '@/features/navigation/tabs';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useAuth, useMeQuery } from '@/providers/AuthProvider';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { getAppVersion, getBuildNumber } from '@/utils/env';
import { openMail } from '@/utils/links';
import { safeUrl } from '@/utils/safeUrl';
import { toast } from '@/utils/toast';

import { AboutYou, DailyRhythmSettings } from './AboutYou';
import { CalendarIntegration } from './CalendarIntegration';
import { NotetakerSettings } from './NotetakerSettings';
import { NotificationSettings } from './NotificationSettings';

const DEFAULT_PAGES = [
  { slug: 'about', label: 'About' },
  { slug: 'privacy', label: 'Privacy policy' },
  { slug: 'terms', label: 'Terms of service' },
];

/** CMS page links from the footer navigation (`/p/:slug`), falling back to the standard pages. */
function legalPages(footer: NavItem[]): { slug: string; label: string }[] {
  const fromConfig = footer
    .map((item) => {
      const target = safeUrl(item.href);
      const match = target?.kind === 'internal' ? /^\/page\/([^/?]+)$/.exec(target.path) : null;
      return match ? { slug: match[1], label: item.label } : null;
    })
    .filter((p): p is { slug: string; label: string } => p !== null);
  return fromConfig.length ? fromConfig : DEFAULT_PAGES;
}

function pageIcon(slug: string): LucideIcon {
  if (slug.includes('privacy')) return Shield;
  if (slug.includes('term')) return FileText;
  return Info;
}

export function ProfileScreen() {
  const theme = useTheme();
  const { config, isEnabled } = useConfig();
  const title = useTabLabel('profile', 'Profile');
  const { signOut } = useAuth();
  const me = useMeQuery();
  const updateSettings = useUpdateSettings();
  const deleteAccount = useDeleteAccount();
  const [signingOut, setSigningOut] = useState(false);
  const refreshControl = useRefreshControl(() => me.refetch());

  const user = me.data?.user;
  const settings = me.data?.settings;
  const version = getAppVersion();
  const build = getBuildNumber();

  const onChange = (patch: Partial<UserSettings>) => {
    updateSettings.mutate(patch);
  };

  const doSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void doSignOut() },
    ]);

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      `This permanently deletes your meetings, transcripts, reports and reminders, and disconnects Google. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () =>
            deleteAccount.mutate(undefined, {
              onSuccess: () => {
                toast('Your account has been deleted.');
                void signOut({ localOnly: true });
              },
            }),
        },
      ],
    );

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TabHeader title={title} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
        {me.isPending ? (
          <View style={styles.sections}>
            <SkeletonCard lines={1} />
            <Skeleton height={140} radius={16} />
            <Skeleton height={220} radius={16} />
          </View>
        ) : me.isError || !user || !settings ? (
          <ErrorState error={me.error} onRetry={() => void me.refetch()} retrying={me.isFetching} />
        ) : (
          <View style={styles.sections}>
            <Card>
              <View style={styles.account}>
                <Avatar name={user.name ?? user.email} uri={user.avatarUrl} size={60} />
                <View style={styles.flex}>
                  <Text variant="heading" numberOfLines={1}>
                    {user.name || user.email.split('@')[0]}
                  </Text>
                  <Text variant="callout" tone="secondary" numberOfLines={1}>
                    {user.email}
                  </Text>
                  {user.plan ? <Chip label={`${user.plan.name} plan`} tone="brand" style={styles.plan} /> : null}
                </View>
              </View>
            </Card>

            <AboutYou />
            <DailyRhythmSettings settings={settings} onChange={onChange} />
            <NotetakerSettings settings={settings} onChange={onChange} />
            <NotificationSettings settings={settings} onChange={onChange} />
            {isEnabled('calendarSync') ? <CalendarIntegration /> : null}

            <ListGroup title="About">
              {legalPages(config.navigation.footer).map((page) => (
                <ListRow key={page.slug} icon={pageIcon(page.slug)} title={page.label} onPress={() => router.push(`/page/${page.slug}`)} />
              ))}
              {config.branding.supportEmail ? (
                <ListRow
                  icon={LifeBuoy}
                  title="Contact support"
                  subtitle={config.branding.supportEmail}
                  onPress={() => void openMail(config.branding.supportEmail)}
                />
              ) : null}
            </ListGroup>

            <View style={styles.danger}>
              <Button label="Sign out" icon={LogOut} variant="outline" onPress={confirmSignOut} loading={signingOut} fullWidth />
              <Button label="Delete account" icon={Trash} variant="ghost" onPress={confirmDelete} loading={deleteAccount.isPending} fullWidth />
            </View>

            <Text variant="caption" tone="muted" align="center">
              {config.branding.appName} {version}
              {build ? ` (${build})` : ''} · {config.branding.companyName}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 40,
  },
  sections: {
    gap: 20,
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  plan: {
    marginTop: 6,
  },
  danger: {
    gap: 8,
  },
});

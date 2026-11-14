import { router } from 'expo-router';
import { AlarmClock, Bell, CalendarPlus, ChartColumn, Clock, ListChecks, Plus, TrendingUp, Video } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useDashboard } from '@/api/hooks/dashboard';
import { useProfile } from '@/api/hooks/onboarding';
import { useToggleAutoJoin } from '@/api/hooks/meetings';
import { useUnreadCount } from '@/api/hooks/notifications';
import type { MeetingListItem } from '@/api/types';
import { TabHeader } from '@/components/layout/TabHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { ListGroup } from '@/components/ui/ListRow';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { ActionItemRow } from '@/features/action-items/ActionItemRow';
import { openActionItemEditor, useActionItemActions } from '@/features/action-items/useActionItemMenu';
import { MeetingCard } from '@/features/meetings/MeetingCard';
import { ReminderRow } from '@/features/reminders/ReminderRow';
import { openReminderEditor, useReminderMenu } from '@/features/reminders/useReminderMenu';
import { useNow } from '@/hooks/useNow';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useAuth } from '@/providers/AuthProvider';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { firstName, greetingFor } from '@/utils/format';
import { toast } from '@/utils/toast';

import { BannerCard } from './BannerCard';
import { useDismissedBanners } from './useDismissedBanners';

function HomeSkeleton() {
  return (
    <View style={styles.sections}>
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.skeletonTile}>
            <Skeleton height={86} radius={14} />
          </View>
        ))}
      </View>
      <Skeleton width="40%" height={18} />
      <SkeletonCard lines={2} />
      <SkeletonCard lines={2} />
    </View>
  );
}

export function HomeScreen() {
  const theme = useTheme();
  const now = useNow();
  const { config, isEnabled } = useConfig();
  const { user } = useAuth();
  const dashboard = useDashboard();
  const unread = useUnreadCount();
  const toggleAutoJoin = useToggleAutoJoin();
  const actionItems = useActionItemActions();
  const reminderMenu = useReminderMenu();
  const { dismissed, dismiss } = useDismissedBanners();
  const refreshControl = useRefreshControl(() => Promise.all([dashboard.refetch(), unread.refetch()]));

  const data = dashboard.data;
  const profile = useProfile();
  // The name the user asked to be called in the get-to-know-you chat wins over the account name.
  const name = profile.data?.preferredName || firstName(user?.name, user?.email);
  const banners = (data?.banners ?? config.banners.filter((b) => b.placement === 'mobile_home')).filter(
    (b) => !dismissed.has(b.id),
  );
  const showActionItems = isEnabled('actionItems');
  const showReminders = isEnabled('reminders');

  const onToggleAutoJoin = (meeting: MeetingListItem, value: boolean) => {
    toggleAutoJoin.mutate(
      { id: meeting.id, autoJoin: value },
      {
        onSuccess: () => toast(value ? 'The notetaker will join this meeting.' : "The notetaker won't join this meeting."),
      },
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TabHeader
        subtitle={greetingFor(new Date(now))}
        title={name || config.branding.appName}
        right={
          <>
            <IconButton
              icon={Bell}
              accessibilityLabel={unread.data ? `Notifications, ${unread.data} unread` : 'Notifications'}
              badge={unread.data ?? 0}
              onPress={() => router.push('/notifications')}
            />
            <Touchable
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => router.push('/profile')}
              rippleBorderless
              style={styles.avatarButton}
            >
              <Avatar name={user?.name ?? user?.email} uri={user?.avatarUrl} size={36} />
            </Touchable>
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.content} refreshControl={refreshControl}>
        {banners.length ? (
          <View style={styles.banners}>
            {banners.map((banner) => (
              <BannerCard key={banner.id} banner={banner} onDismiss={dismiss} />
            ))}
          </View>
        ) : null}

        {dashboard.isPending ? (
          <HomeSkeleton />
        ) : dashboard.isError && !data ? (
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} retrying={dashboard.isFetching} />
        ) : data ? (
          <View style={styles.sections}>
            <View style={styles.grid}>
              <StatTile icon={Video} label="Meetings this week" value={String(data.stats.meetingsThisWeek)} onPress={() => router.push('/meetings')} />
              <StatTile icon={Clock} label="Hours in meetings" value={`${data.stats.hoursThisWeek}h`} tint={theme.colors.accentText} />
              {showActionItems ? (
                <StatTile
                  icon={ListChecks}
                  label="Open action items"
                  value={String(data.stats.openActionItems)}
                  tint={theme.colors.warning}
                  onPress={() => router.push('/reminders?segment=action-items')}
                />
              ) : null}
              {showReminders ? (
                <StatTile
                  icon={AlarmClock}
                  label="Pending reminders"
                  value={String(data.stats.pendingReminders)}
                  tint={theme.colors.info}
                  onPress={() => router.push('/reminders')}
                />
              ) : null}
            </View>

            {isEnabled('analytics') ? (
              <Card onPress={() => router.push('/analytics')} accessibilityLabel="Open insights">
                <View style={styles.insights}>
                  <ScoreRing score={data.stats.avgMeetingScore} size={56} label="Average meeting score" />
                  <View style={styles.flex}>
                    <Text variant="subheading">Insights</Text>
                    <Text variant="caption" tone="secondary">
                      {data.stats.avgMeetingScore !== null
                        ? 'Your average meeting score. See trends, sentiment and talk time.'
                        : 'Meeting scores, sentiment and talk-time trends appear after your first report.'}
                    </Text>
                  </View>
                  <View style={[styles.insightsIcon, { backgroundColor: theme.colors.primarySoft }]}>
                    <ChartColumn size={18} color={theme.colors.primaryText} />
                  </View>
                </View>
              </Card>
            ) : null}

            <View style={styles.section}>
              <SectionHeader title="Up next" actionLabel="All meetings" onAction={() => router.push('/meetings')} />
              {data.upcomingMeetings.length ? (
                data.upcomingMeetings.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} onToggleAutoJoin={onToggleAutoJoin} />
                ))
              ) : (
                <Card muted>
                  <EmptyState
                    compact
                    icon={CalendarPlus}
                    title="No upcoming meetings"
                    message={
                      user && !user.calendarConnected
                        ? 'Connect Google Calendar in Profile so the notetaker can join automatically.'
                        : 'Meetings with a Google Meet link on your calendar show up here.'
                    }
                    action={{ label: 'Add a meeting', onPress: () => router.push('/meeting/new') }}
                  />
                </Card>
              )}
            </View>

            {showActionItems ? (
              <View style={styles.section}>
                <SectionHeader title="Due soon" actionLabel="See all" onAction={() => router.push('/reminders?segment=action-items')} />
                {data.openActionItems.length ? (
                  <ListGroup>
                    {data.openActionItems.map((item) => (
                      <ActionItemRow
                        key={item.id}
                        item={item}
                        onToggle={actionItems.onToggle}
                        onPress={() => openActionItemEditor(item)}
                        onMenu={actionItems.openMenu}
                      />
                    ))}
                  </ListGroup>
                ) : (
                  <Card muted>
                    <EmptyState compact icon={ListChecks} title="You're all caught up" message="Action items from your meetings will land here." />
                  </Card>
                )}
              </View>
            ) : null}

            {showReminders ? (
              <View style={styles.section}>
                <SectionHeader title="Reminders" actionLabel="See all" onAction={() => router.push('/reminders')} />
                {data.upcomingReminders.length ? (
                  <ListGroup>
                    {data.upcomingReminders.map((reminder) => (
                      <ReminderRow
                        key={reminder.id}
                        reminder={reminder}
                        showDay
                        onPress={() => openReminderEditor(reminder)}
                        onMenu={reminderMenu.openMenu}
                      />
                    ))}
                  </ListGroup>
                ) : (
                  <Card muted>
                    <EmptyState
                      compact
                      icon={AlarmClock}
                      title="No reminders scheduled"
                      action={{ label: 'New reminder', onPress: () => openReminderEditor() }}
                    />
                  </Card>
                )}
              </View>
            ) : null}

            <View style={styles.section}>
              <SectionHeader title="Recent reports" actionLabel="See all" onAction={() => router.push('/meetings?scope=past')} />
              {data.recentReports.length ? (
                data.recentReports.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} />)
              ) : (
                <Card muted>
                  <EmptyState
                    compact
                    icon={TrendingUp}
                    title="No reports yet"
                    message="After your next meeting, the summary, action items and scores appear here."
                  />
                </Card>
              )}
            </View>

            {data.upcomingMeetings.length ? (
              <Button label="Add a meeting" icon={Plus} variant="secondary" onPress={() => router.push('/meeting/new')} />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      {actionItems.sheet}
      {reminderMenu.sheet}
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
    paddingBottom: 32,
    gap: 20,
  },
  banners: {
    gap: 12,
  },
  sections: {
    gap: 24,
  },
  section: {
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  skeletonTile: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  insights: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  insightsIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  avatarButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

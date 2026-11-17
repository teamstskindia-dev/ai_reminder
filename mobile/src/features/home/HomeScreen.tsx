import { router } from 'expo-router';
import {
  AlarmClock,
  Bell,
  CalendarPlus,
  ChartColumn,
  CheckCircle2,
  Clock,
  HeartHandshake,
  ListChecks,
  MoonStar,
  Plus,
  Sparkles,
  TrendingUp,
  Video,
} from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useCaptures } from '@/api/hooks/captures';
import { useDismissNudge, useToday } from '@/api/hooks/companion';
import { useDashboard } from '@/api/hooks/dashboard';
import { useToggleAutoJoin } from '@/api/hooks/meetings';
import { useUnreadCount } from '@/api/hooks/notifications';
import { useProfile } from '@/api/hooks/onboarding';
import type { LanguageStyle, MeetingListItem, TodayBrief } from '@/api/types';
import { TabHeader } from '@/components/layout/TabHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
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
import { CaptureCards } from '@/features/capture/CaptureCards';
import { openActionItemEditor, useActionItemActions } from '@/features/action-items/useActionItemMenu';
import { moodEmoji } from '@/features/companion/mood';
import { MeetingCard } from '@/features/meetings/MeetingCard';
import { ReminderRow } from '@/features/reminders/ReminderRow';
import { openReminderEditor, useReminderMenu } from '@/features/reminders/useReminderMenu';
import { pick } from '@/features/setup/shared';
import { useNow } from '@/hooks/useNow';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useAuth } from '@/providers/AuthProvider';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { firstName, formatTime, greetingFor } from '@/utils/format';
import { toast } from '@/utils/toast';

import { BannerCard } from './BannerCard';
import { useDismissedBanners } from './useDismissedBanners';

function HomeSkeleton() {
  return (
    <View style={styles.sections}>
      <Skeleton height={96} radius={16} />
      <Skeleton width="40%" height={18} />
      <SkeletonCard lines={2} />
      <SkeletonCard lines={2} />
    </View>
  );
}

/** "HH:MM" → local display time ("9:00 PM"). */
function displayTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return formatTime(d);
}

function BriefCard({ today }: { today: TodayBrief }) {
  const theme = useTheme();
  const lang = today.languageStyle;
  return (
    <Card style={{ backgroundColor: theme.colors.primarySoft }}>
      <View style={styles.brief}>
        <Text variant="micro" tone="brand">
          {pick(lang, 'TODAY’S BRIEF', 'AAJ KA BRIEF')}
        </Text>
        <Text variant="subheading">{today.headline}</Text>
        <View style={styles.chips}>
          <Chip icon={Video} label={`${today.counts.meetings} ${pick(lang, 'meetings', 'meetings')}`} size="sm" />
          <Chip icon={AlarmClock} label={`${today.counts.reminders} ${pick(lang, 'reminders', 'reminders')}`} size="sm" />
          <Chip icon={ListChecks} label={`${today.counts.openItems} ${pick(lang, 'open', 'open')}`} size="sm" />
        </View>
      </View>
    </Card>
  );
}

function NudgeCard({ today, lang }: { today: TodayBrief; lang: LanguageStyle }) {
  const theme = useTheme();
  const dismiss = useDismissNudge();
  const nudge = today.nudge;
  if (!nudge) return null;
  return (
    <Card onPress={() => router.push(`/nudge/${nudge.id}`)} accessibilityLabel="Open message from your friend">
      <View style={styles.row}>
        <View style={[styles.roundIcon, { backgroundColor: theme.colors.accentSoft }]}>
          <HeartHandshake size={18} color={theme.colors.accentText} />
        </View>
        <View style={styles.flex}>
          <Text variant="callout">{nudge.text}</Text>
          <View style={styles.inlineActions}>
            <Button label={pick(lang, 'Reply', 'Reply karo')} size="sm" onPress={() => router.push(`/nudge/${nudge.id}`)} />
            <Button label={pick(lang, 'Not now', 'Abhi nahi')} size="sm" variant="ghost" onPress={() => dismiss.mutate(nudge.id)} />
          </View>
        </View>
      </View>
    </Card>
  );
}

function CheckinCard({ today, lang }: { today: TodayBrief; lang: LanguageStyle }) {
  const theme = useTheme();
  const { status, time, mood } = today.checkin;
  const open = () => router.push('/checkin');
  if (status === 'off' || status === 'missed') return null;
  if (status === 'completed') {
    return (
      <Card muted onPress={open} accessibilityLabel="Open today's check-in">
        <View style={styles.row}>
          <CheckCircle2 size={20} color={theme.colors.success} />
          <Text variant="callout" style={styles.flex}>
            {pick(lang, 'Today’s check-in done', 'Aaj ka check-in ho gaya')} {mood ? moodEmoji(mood) : ''}
          </Text>
        </View>
      </Card>
    );
  }
  if (status === 'upcoming') {
    return (
      <Touchable accessibilityRole="button" onPress={open} style={styles.upcoming}>
        <MoonStar size={16} color={theme.colors.textMuted} />
        <Text variant="caption" tone="muted">
          {pick(lang, `Evening check-in at ${displayTime(time)}`, `Evening check-in ${displayTime(time)} pe`)}
        </Text>
      </Touchable>
    );
  }
  return (
    <Card onPress={open} accessibilityLabel="Start the evening check-in">
      <View style={styles.row}>
        <View style={[styles.roundIcon, { backgroundColor: theme.colors.primarySoft }]}>
          <MoonStar size={18} color={theme.colors.primaryText} />
        </View>
        <View style={styles.flex}>
          <Text variant="subheading">{pick(lang, 'How did today go?', 'Aaj ka din kaisa raha?')}</Text>
          <Text variant="caption" tone="secondary">
            {status === 'replied'
              ? pick(lang, 'Pick up where we left off.', 'Jahan chhoda tha wahin se.')
              : pick(lang, 'A minute to reflect, by voice or text.', 'Ek minute, bolo ya likho.')}
          </Text>
        </View>
        <Button label={pick(lang, 'Check in', 'Check in')} size="sm" onPress={open} />
      </View>
    </Card>
  );
}

/** Today (user-flow §03): brief, nudge, evening check-in, today's meetings, reminders and open promises. */
export function HomeScreen() {
  const theme = useTheme();
  const now = useNow();
  const { config, isEnabled } = useConfig();
  const { user } = useAuth();
  const today = useToday();
  const dashboard = useDashboard();
  const unread = useUnreadCount();
  const toggleAutoJoin = useToggleAutoJoin();
  const actionItems = useActionItemActions();
  const reminderMenu = useReminderMenu();
  const { dismissed, dismiss } = useDismissedBanners();
  const captures = useCaptures();
  const refreshControl = useRefreshControl(() =>
    Promise.all([today.refetch(), dashboard.refetch(), unread.refetch(), captures.refetch()]),
  );

  const t = today.data;
  const data = dashboard.data;
  const profile = useProfile();
  const lang = t?.languageStyle ?? profile.data?.languageStyle ?? 'english';
  // The name the user asked to be called in the get-to-know-you chat wins over the account name.
  const name = profile.data?.preferredName || firstName(user?.name, user?.email);
  const banners = (data?.banners ?? config.banners.filter((b) => b.placement === 'mobile_home')).filter((b) => !dismissed.has(b.id));
  const showActionItems = isEnabled('actionItems');
  const showReminders = isEnabled('reminders');

  const onToggleAutoJoin = (meeting: MeetingListItem, value: boolean) => {
    toggleAutoJoin.mutate(
      { id: meeting.id, autoJoin: value },
      { onSuccess: () => toast(value ? 'The notetaker will join this meeting.' : "The notetaker won't join this meeting.") },
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
            <Touchable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push('/profile')} rippleBorderless style={styles.avatarButton}>
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

        {today.isPending ? (
          <HomeSkeleton />
        ) : today.isError && !t ? (
          <ErrorState error={today.error} onRetry={() => void today.refetch()} retrying={today.isFetching} />
        ) : t ? (
          <View style={styles.sections}>
            <BriefCard today={t} />
            <CaptureCards lang={lang} />
            <NudgeCard today={t} lang={lang} />
            <CheckinCard today={t} lang={lang} />

            <View style={styles.section}>
              <SectionHeader title={pick(lang, 'Today’s meetings', 'Aaj ki meetings')} actionLabel={pick(lang, 'All meetings', 'Sab meetings')} onAction={() => router.push('/meetings')} />
              {t.meetings.length ? (
                t.meetings.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} onToggleAutoJoin={onToggleAutoJoin} overlapping={(t.overlapIds ?? []).includes(meeting.id)} />
                ))
              ) : (
                <Card muted>
                  <EmptyState
                    compact
                    icon={CalendarPlus}
                    title={pick(lang, 'No meetings today', 'Aaj koi meeting nahi')}
                    message={
                      user && !user.calendarConnected
                        ? 'Connect Google Calendar in Profile so your meetings show up here.'
                        : 'Meetings on your calendar for today show up here.'
                    }
                    action={{ label: 'Add a meeting', onPress: () => router.push('/meeting/new') }}
                  />
                </Card>
              )}
            </View>

            {showReminders ? (
              <View style={styles.section}>
                <SectionHeader title={pick(lang, 'Reminders today', 'Aaj ke reminders')} actionLabel="See all" onAction={() => router.push('/reminders')} />
                {t.reminders.length ? (
                  <ListGroup>
                    {t.reminders.map((reminder) => (
                      <ReminderRow
                        key={reminder.id}
                        reminder={reminder}
                        onPress={() => router.push(`/reminder/${reminder.id}`)}
                        onMenu={reminderMenu.openMenu}
                        onDone={reminderMenu.markDone}
                      />
                    ))}
                  </ListGroup>
                ) : (
                  <Card muted>
                    <EmptyState
                      compact
                      icon={AlarmClock}
                      title={pick(lang, 'Nothing due today', 'Aaj kuch due nahi')}
                      action={{ label: 'New reminder', onPress: () => openReminderEditor() }}
                    />
                  </Card>
                )}
              </View>
            ) : null}

            {showActionItems ? (
              <View style={styles.section}>
                <SectionHeader
                  title={pick(lang, 'Open to-dos & promises', 'Pending to-dos aur promises')}
                  actionLabel="See all"
                  onAction={() => router.push('/reminders?segment=action-items')}
                />
                {t.openItems.length ? (
                  <ListGroup>
                    {t.openItems.map((item) => (
                      <ActionItemRow key={item.id} item={item} onToggle={actionItems.onToggle} onPress={() => openActionItemEditor(item)} onMenu={actionItems.openMenu} />
                    ))}
                  </ListGroup>
                ) : (
                  <Card muted>
                    <EmptyState compact icon={ListChecks} title={pick(lang, "You're all caught up", 'Sab kuch ho gaya')} message="To-dos and promises from your conversations land here." />
                  </Card>
                )}
              </View>
            ) : null}

            <View style={styles.section}>
              <SectionHeader title="Recent reports" actionLabel="See all" onAction={() => router.push('/meetings?scope=past')} />
              {data?.recentReports.length ? (
                data.recentReports.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} />)
              ) : (
                <Card muted>
                  <EmptyState compact icon={TrendingUp} title="No reports yet" message="After your next meeting, the summary, action items and scores appear here." />
                </Card>
              )}
            </View>

            <View style={styles.section}>
              <SectionHeader title={pick(lang, 'This week', 'Is hafte')} />
              {data ? (
                <View style={styles.grid}>
                  <StatTile icon={Video} label="Meetings this week" value={String(data.stats.meetingsThisWeek)} onPress={() => router.push('/meetings')} />
                  <StatTile icon={Clock} label="Hours in meetings" value={`${data.stats.hoursThisWeek}h`} tint={theme.colors.accentText} />
                </View>
              ) : null}
              <Card onPress={() => router.push('/recap')} accessibilityLabel="Open your weekly recap">
                <View style={styles.row}>
                  <View style={[styles.roundIcon, { backgroundColor: theme.colors.primarySoft }]}>
                    <Sparkles size={18} color={theme.colors.primaryText} />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="subheading">Weekly recap</Text>
                    <Text variant="caption" tone="secondary">
                      Highlights, promises kept, your mood and the people you met. Every Sunday evening.
                    </Text>
                  </View>
                </View>
              </Card>
              {isEnabled('analytics') && data ? (
                <Card onPress={() => router.push('/analytics')} accessibilityLabel="Open insights">
                  <View style={styles.row}>
                    <ScoreRing score={data.stats.avgMeetingScore} size={56} label="Average meeting score" />
                    <View style={styles.flex}>
                      <Text variant="subheading">Insights</Text>
                      <Text variant="caption" tone="secondary">
                        {data.stats.avgMeetingScore !== null
                          ? 'Your average meeting score. See trends, sentiment and talk time.'
                          : 'Meeting scores, sentiment and talk-time trends appear after your first report.'}
                      </Text>
                    </View>
                    <View style={[styles.roundIcon, { backgroundColor: theme.colors.primarySoft }]}>
                      <ChartColumn size={18} color={theme.colors.primaryText} />
                    </View>
                  </View>
                </Card>
              ) : null}
            </View>

            <Button label="Add a meeting" icon={Plus} variant="secondary" onPress={() => router.push('/meeting/new')} />
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
    gap: 20,
  },
  section: {
    gap: 12,
  },
  brief: {
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  upcoming: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  roundIcon: {
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

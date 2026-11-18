import { router } from 'expo-router';
import { AlarmClock, CalendarCheck2, CalendarPlus, CheckCircle2, Info, ListChecks, Mail, Send } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useRetryTalkAction, useScheduleMeeting, useTalkActionStatus } from '@/api/hooks/talk';
import type { LanguageStyle, TalkAction } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { pick } from '@/features/setup/shared';
import { useNow } from '@/hooks/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDayLabel, formatTime } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DURATIONS = [15, 30, 60];

function when(iso: string | null): string {
  return iso ? `${formatDayLabel(iso)} · ${formatTime(iso)}` : '';
}

function Shell({ icon, tint, bg, children }: { icon: React.ReactNode; tint?: string; bg: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: tint ?? theme.colors.border, borderRadius: theme.radii.lg }]}>
      <View style={[styles.icon, { backgroundColor: bg }]}>{icon}</View>
      <View style={styles.flex}>{children}</View>
    </View>
  );
}

type Props = { action: TalkAction; messageId: string | null; threadId: string | null; lang: LanguageStyle };

/** One action from the friend: done things show as confirmations; things affecting others need approval. */
export function TalkActionCard({ action, messageId, threadId, lang }: Props) {
  const theme = useTheme();
  switch (action.type) {
    case 'reminder':
      return (
        <Shell icon={<AlarmClock size={18} color={action.status === 'done' ? theme.colors.success : theme.colors.warning} />} bg={action.status === 'done' ? theme.colors.successSoft : theme.colors.warningSoft}>
          <Text variant="label">{action.status === 'done' ? pick(lang, 'Reminder set', 'Reminder set hai') : pick(lang, 'Reminder not set', 'Reminder set nahi hua')}</Text>
          <Text variant="callout">{action.title}</Text>
          {action.remindAt ? <Text variant="caption" tone="secondary">{when(action.remindAt)}</Text> : null}
          {action.note ? <Text variant="caption" tone="muted">{action.note}</Text> : null}
          {action.reminderId ? (
            <View style={styles.row}>
              <Button label={pick(lang, 'Open', 'Kholo')} size="sm" variant="secondary" onPress={() => router.push(`/reminder/${action.reminderId}`)} />
            </View>
          ) : null}
        </Shell>
      );
    case 'task':
      return (
        <Shell icon={<ListChecks size={18} color={theme.colors.success} />} bg={theme.colors.successSoft}>
          <Text variant="label">{pick(lang, 'Added to your to-dos', 'To-dos mein add kiya')}</Text>
          <Text variant="callout">{action.title}</Text>
          {action.note ? <Text variant="caption" tone="muted">{action.note}</Text> : null}
        </Shell>
      );
    case 'unavailable':
      return (
        <Shell icon={<Info size={18} color={theme.colors.info} />} bg={theme.colors.infoSoft}>
          <Text variant="callout">{action.note}</Text>
        </Shell>
      );
    case 'email':
      return <EmailCard action={action} messageId={messageId} threadId={threadId} lang={lang} />;
    case 'meeting':
      // Keyed by status so a retried card (needs_connection → proposed) starts from the new slot.
      return <MeetingCard key={`${action.id}:${action.status}`} action={action} messageId={messageId} threadId={threadId} lang={lang} />;
    default:
      return null;
  }
}

function MeetingCard({ action, messageId, threadId, lang }: Props & { action: Extract<TalkAction, { type: 'meeting' }> }) {
  const theme = useTheme();
  const schedule = useScheduleMeeting(threadId);
  const status = useTalkActionStatus(threadId);
  const retry = useRetryTalkAction(threadId);
  const now = useNow();
  const [title, setTitle] = useState(action.title);
  const [start, setStart] = useState<Date | null>(action.startAt ? new Date(action.startAt) : null);
  const initialMinutes = action.startAt && action.endAt ? Math.round((new Date(action.endAt).getTime() - new Date(action.startAt).getTime()) / 60_000) : 30;
  const [minutes, setMinutes] = useState(initialMinutes);
  const [guests, setGuests] = useState(action.attendees.map((a) => ({ name: a.name, email: a.email ?? '' })));
  const [local, setLocal] = useState<'scheduled' | 'cancelled' | null>(null);
  const state = local ?? action.status;

  if (state === 'scheduled') {
    return (
      <Shell icon={<CalendarCheck2 size={18} color={theme.colors.success} />} bg={theme.colors.successSoft}>
        <Text variant="label">{pick(lang, 'Invite sent', 'Invite bhej diya')}</Text>
        <Text variant="callout">{action.title}</Text>
        <Text variant="caption" tone="secondary">{when(action.startAt ?? start?.toISOString() ?? null)}</Text>
      </Shell>
    );
  }
  if (state === 'cancelled') {
    return (
      <Shell icon={<CalendarPlus size={18} color={theme.colors.textMuted} />} bg={theme.colors.surfaceMuted}>
        <Text variant="callout" tone="muted">{pick(lang, `Not scheduled: ${action.title}`, `Schedule nahi kiya: ${action.title}`)}</Text>
      </Shell>
    );
  }
  if (state === 'needs_connection' || state === 'failed') {
    return (
      <Shell icon={<CalendarPlus size={18} color={theme.colors.warning} />} bg={theme.colors.warningSoft}>
        <Text variant="label">{action.title}</Text>
        {action.note ? <Text variant="caption" tone="secondary">{action.note}</Text> : null}
        <View style={styles.row}>
          <Button label={pick(lang, 'Open Profile', 'Profile kholo')} size="sm" variant="secondary" onPress={() => router.push('/profile')} />
          {state === 'needs_connection' && messageId ? (
            <Button
              label={pick(lang, 'Try again', 'Phir se try karo')}
              size="sm"
              loading={retry.isPending}
              onPress={() =>
                retry.mutate(
                  { messageId, actionId: action.id },
                  {
                    onSuccess: (m) => {
                      const next = m.actions.find((a) => a.id === action.id);
                      if (next?.status === 'needs_connection') toast(next.note ?? pick(lang, 'Calendar still not connected', 'Calendar abhi bhi connect nahi hai'));
                    },
                    onError: (e) => toast(getErrorMessage(e)),
                  },
                )
              }
            />
          ) : null}
        </View>
      </Shell>
    );
  }

  const valid = Boolean(start && start.getTime() > now && title.trim() && guests.every((g) => !g.email || EMAIL_RE.test(g.email)));
  const send = () => {
    if (!start) return;
    haptics.light();
    schedule.mutate(
      {
        messageId: messageId ?? undefined,
        actionId: messageId ? action.id : undefined,
        title: title.trim(),
        startAt: start.toISOString(),
        endAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
        attendees: guests.filter((g) => EMAIL_RE.test(g.email)).map((g) => ({ name: g.name, email: g.email })),
      },
      {
        onSuccess: () => {
          haptics.success();
          setLocal('scheduled');
          toast(pick(lang, 'Invite sent', 'Invite bhej diya'));
        },
        onError: (e) => toast(getErrorMessage(e)),
      },
    );
  };
  const cancel = () => {
    setLocal('cancelled');
    if (messageId) status.mutate({ messageId, actionId: action.id, status: 'cancelled' });
  };

  return (
    <Shell icon={<CalendarPlus size={18} color={theme.colors.primaryText} />} tint={theme.colors.primary} bg={theme.colors.primarySoft}>
      <Text variant="label" tone="brand">{pick(lang, 'Invite preview: nothing is sent until you approve', 'Invite preview: approve karne tak kuch nahi jayega')}</Text>
      <TextField label={pick(lang, 'Title', 'Title')} value={title} onChangeText={setTitle} maxLength={300} />
      <DateTimeField label={pick(lang, 'When', 'Kab')} value={start} minimumDate={new Date()} onChange={setStart} placeholder={pick(lang, 'Pick a time', 'Time chuno')} />
      <View style={styles.chips}>
        {DURATIONS.map((d) => (
          <Chip key={d} label={`${d} min`} size="sm" selected={minutes === d} onPress={() => setMinutes(d)} />
        ))}
      </View>
      {guests.map((g, i) => (
        <TextField
          key={i}
          label={g.name ? `${g.name} · email` : pick(lang, 'Guest email', 'Guest ka email')}
          value={g.email}
          autoCapitalize="none"
          keyboardType="email-address"
          error={g.email && !EMAIL_RE.test(g.email) ? pick(lang, 'Check the email', 'Email check karo') : null}
          onChangeText={(email) => setGuests((prev) => prev.map((x, j) => (j === i ? { ...x, email: email.trim() } : x)))}
        />
      ))}
      {action.note ? <Text variant="caption" tone="muted">{action.note}</Text> : null}
      <View style={styles.row}>
        <Button label={pick(lang, 'Send invite', 'Invite bhejo')} icon={Send} size="sm" disabled={!valid} loading={schedule.isPending} onPress={send} />
        <Button label={pick(lang, 'Not now', 'Abhi nahi')} size="sm" variant="ghost" onPress={cancel} />
      </View>
    </Shell>
  );
}

function EmailCard({ action, messageId, threadId, lang }: Props & { action: Extract<TalkAction, { type: 'email' }> }) {
  const theme = useTheme();
  const status = useTalkActionStatus(threadId);
  const [to, setTo] = useState(action.to ?? '');
  const [subject, setSubject] = useState(action.subject);
  const [body, setBody] = useState(action.body);
  const [local, setLocal] = useState<'sent' | 'cancelled' | null>(null);
  const state = local ?? action.status;

  if (state !== 'proposed') {
    return (
      <Shell icon={state === 'sent' ? <CheckCircle2 size={18} color={theme.colors.success} /> : <Mail size={18} color={theme.colors.textMuted} />} bg={state === 'sent' ? theme.colors.successSoft : theme.colors.surfaceMuted}>
        <Text variant="callout" tone={state === 'sent' ? 'default' : 'muted'}>
          {state === 'sent' ? pick(lang, `Opened in your email: ${action.subject}`, `Email app mein khola: ${action.subject}`) : pick(lang, 'Draft discarded', 'Draft hata diya')}
        </Text>
      </Shell>
    );
  }

  const open = async () => {
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      setLocal('sent');
      if (messageId) status.mutate({ messageId, actionId: action.id, status: 'sent' });
    } catch {
      toast(pick(lang, 'No email app found on this phone.', 'Is phone par koi email app nahi mila.'));
    }
  };
  const discard = () => {
    setLocal('cancelled');
    if (messageId) status.mutate({ messageId, actionId: action.id, status: 'cancelled' });
  };

  return (
    <Shell icon={<Mail size={18} color={theme.colors.primaryText} />} tint={theme.colors.primary} bg={theme.colors.primarySoft}>
      <Text variant="label" tone="brand">{pick(lang, 'Email draft: sent only from your own email', 'Email draft: sirf tumhare email se jayega')}</Text>
      <TextField label={pick(lang, 'To', 'Kisko')} value={to} onChangeText={setTo} autoCapitalize="none" keyboardType="email-address" />
      <TextField label={pick(lang, 'Subject', 'Subject')} value={subject} onChangeText={setSubject} maxLength={300} />
      <TextField label={pick(lang, 'Message', 'Message')} value={body} onChangeText={setBody} multiline maxLength={5000} />
      <View style={styles.row}>
        <Button label={pick(lang, 'Open in email app', 'Email app mein kholo')} icon={Send} size="sm" disabled={!subject.trim() && !body.trim()} onPress={() => void open()} />
        <Button label={pick(lang, 'Discard', 'Hatao')} size="sm" variant="ghost" onPress={discard} />
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
  },
});

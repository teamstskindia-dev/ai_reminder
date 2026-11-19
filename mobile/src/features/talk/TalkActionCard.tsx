import { router } from 'expo-router';
import {
  AlarmClock,
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  Coffee,
  ExternalLink,
  Inbox,
  Info,
  ListChecks,
  Mail,
  NotebookText,
  Send,
  SquareKanban,
} from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useUpdateSettings } from '@/api/hooks/profile';
import {
  useRetryTalkAction,
  useSaveTalkNote,
  useScheduleMeeting,
  useSendTalkEmail,
  useSendTalkTask,
  useTalkActionStatus,
} from '@/api/hooks/talk';
import type { LanguageStyle, TalkAction } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { senderName } from '@/features/email/EmailRow';
import { providerName } from '@/features/integrations/connect';
import { pick } from '@/features/setup/shared';
import { useNow } from '@/hooks/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDayLabel, formatRelative, formatTime } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { openExternal } from '@/utils/links';
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
      return <TaskCard key={`${action.id}:${action.status}`} action={action} messageId={messageId} threadId={threadId} lang={lang} />;
    case 'unavailable':
      return (
        <Shell icon={<Info size={18} color={theme.colors.info} />} bg={theme.colors.infoSoft}>
          <Text variant="callout">{action.note}</Text>
          <View style={styles.row}>
            <Button label={pick(lang, 'Connected apps', 'Connected apps')} size="sm" variant="secondary" onPress={() => router.push('/connected-apps')} />
          </View>
        </Shell>
      );
    case 'email':
      return <EmailCard action={action} messageId={messageId} threadId={threadId} lang={lang} />;
    case 'email_summary':
      return <EmailSummaryCard action={action} lang={lang} />;
    case 'tool_list':
      return <ToolListCard action={action} lang={lang} />;
    case 'note':
      return <NoteCard key={`${action.id}:${action.status}`} action={action} messageId={messageId} threadId={threadId} lang={lang} />;
    case 'pause':
      return <PauseCard action={action} lang={lang} />;
    case 'meeting':
      // Keyed by status so a retried card (needs_connection → proposed) starts from the new slot.
      return <MeetingCard key={`${action.id}:${action.status}`} action={action} messageId={messageId} threadId={threadId} lang={lang} />;
    default:
      return null;
  }
}

function TaskCard({ action, messageId, threadId, lang }: Props & { action: Extract<TalkAction, { type: 'task' }> }) {
  const theme = useTheme();
  const send = useSendTalkTask(threadId);
  const status = useTalkActionStatus(threadId);
  const tool = providerName(action.tool);
  const run = (mode: 'send' | 'merge' | 'new') => {
    if (!messageId) return;
    haptics.light();
    send.mutate(
      { messageId, actionId: action.id, mode },
      {
        onSuccess: (m) => {
          const next = m.actions.find((a) => a.id === action.id);
          if (next?.type === 'task' && next.status === 'done') haptics.success();
        },
        onError: (e) => toast(getErrorMessage(e)),
      },
    );
  };

  if (action.status === 'proposed' || action.status === 'duplicate') {
    const dup = action.duplicate;
    return (
      <Shell icon={<SquareKanban size={18} color={theme.colors.primaryText} />} tint={theme.colors.primary} bg={theme.colors.primarySoft}>
        <Text variant="label" tone="brand">
          {action.status === 'duplicate'
            ? pick(lang, `Similar task already in ${tool}`, `${tool} mein aisa task pehle se hai`)
            : pick(lang, `Task for ${tool}: sent only when you tap Send`, `${tool} ke liye task: Send dabane par hi jayega`)}
        </Text>
        <Text variant="callout">{action.title}</Text>
        {action.details ? <Text variant="caption" tone="secondary">{action.details}</Text> : null}
        {dup ? (
          <Touchable accessibilityRole="link" onPress={() => dup.url && void openExternal(dup.url)}>
            <Text variant="caption" tone="secondary">
              {pick(lang, 'Existing: ', 'Pehle wala: ')}
              {dup.externalKey ? `${dup.externalKey} · ` : ''}
              {dup.title}
            </Text>
          </Touchable>
        ) : null}
        <View style={styles.row}>
          {action.status === 'duplicate' ? (
            <>
              <Button label={pick(lang, 'Merge', 'Merge karo')} size="sm" loading={send.isPending && send.variables?.mode === 'merge'} onPress={() => run('merge')} />
              <Button label={pick(lang, 'Create new', 'Naya banao')} size="sm" variant="secondary" loading={send.isPending && send.variables?.mode === 'new'} onPress={() => run('new')} />
            </>
          ) : (
            <Button label={pick(lang, `Send to ${tool}`, `${tool} mein bhejo`)} icon={Send} size="sm" loading={send.isPending} onPress={() => run('send')} />
          )}
          <Button
            label={pick(lang, 'Not now', 'Abhi nahi')}
            size="sm"
            variant="ghost"
            onPress={() => messageId && status.mutate({ messageId, actionId: action.id, status: 'cancelled' })}
          />
        </View>
      </Shell>
    );
  }

  const inTool = Boolean(action.toolTaskId);
  return (
    <Shell icon={<ListChecks size={18} color={action.status === 'failed' ? theme.colors.textMuted : theme.colors.success} />} bg={action.status === 'failed' ? theme.colors.surfaceMuted : theme.colors.successSoft}>
      <Text variant="label">
        {action.status === 'failed'
          ? pick(lang, 'Not sent', 'Nahi bheja')
          : inTool
            ? pick(lang, `Created in ${tool}`, `${tool} mein bana diya`)
            : pick(lang, 'Added to your to-dos', 'To-dos mein add kiya')}
        {action.externalKey ? ` · ${action.externalKey}` : ''}
      </Text>
      <Text variant="callout">{action.title}</Text>
      {action.note ? <Text variant="caption" tone="muted">{action.note}</Text> : null}
      {action.url ? (
        <View style={styles.row}>
          <Button label={pick(lang, `Open in ${tool}`, `${tool} mein kholo`)} icon={ExternalLink} size="sm" variant="secondary" onPress={() => void openExternal(action.url as string)} />
        </View>
      ) : null}
    </Shell>
  );
}

function EmailSummaryCard({ action, lang }: { action: Extract<TalkAction, { type: 'email_summary' }>; lang: LanguageStyle }) {
  const theme = useTheme();
  return (
    <Shell icon={<Inbox size={18} color={theme.colors.primaryText} />} bg={theme.colors.primarySoft}>
      <Text variant="label">{action.title}</Text>
      {action.groups.map((g) => (
        <View key={g.label} style={styles.group}>
          <Text variant="micro" tone="muted">
            {g.label.toUpperCase()} · {g.items.length}
          </Text>
          {g.items.map((e) => (
            <Touchable key={e.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/email/[id]', params: { id: e.id } })} style={styles.item}>
              <Text variant="caption" numberOfLines={2}>
                <Text variant="caption" weight="600">
                  {senderName(e)}:{' '}
                </Text>
                {e.summary ?? e.subject ?? ''}
              </Text>
              <Text variant="caption" tone="muted">
                {formatRelative(e.receivedAt)}
              </Text>
            </Touchable>
          ))}
        </View>
      ))}
      {action.note ? <Text variant="caption" tone="muted">{action.note}</Text> : null}
      <View style={styles.row}>
        <Button label={pick(lang, 'Open email', 'Emails kholo')} size="sm" variant="secondary" onPress={() => router.push('/emails')} />
      </View>
    </Shell>
  );
}

function ToolListCard({ action, lang }: { action: Extract<TalkAction, { type: 'tool_list' }>; lang: LanguageStyle }) {
  const theme = useTheme();
  return (
    <Shell icon={<SquareKanban size={18} color={theme.colors.primaryText} />} bg={theme.colors.primarySoft}>
      <Text variant="label">
        {action.title} · {action.items.length}
      </Text>
      {action.items.length ? (
        action.items.map((i) => (
          <Touchable key={i.id} accessibilityRole="link" disabled={!i.url} onPress={() => i.url && void openExternal(i.url)} style={styles.item}>
            <Text variant="caption" numberOfLines={2}>
              {i.key ? (
                <Text variant="caption" weight="600">
                  {i.key}{' '}
                </Text>
              ) : null}
              {i.title}
            </Text>
            <View style={styles.chips}>
              {i.status ? <Chip label={i.status} /> : null}
              {i.dueAt ? <Chip label={`${pick(lang, 'Due', 'Due')} ${formatDayLabel(i.dueAt)}`} tone="warning" /> : null}
            </View>
          </Touchable>
        ))
      ) : (
        <Text variant="caption" tone="muted">
          {pick(lang, 'Nothing open for you.', 'Kuch pending nahi.')}
        </Text>
      )}
    </Shell>
  );
}

function NoteCard({ action, messageId, threadId, lang }: Props & { action: Extract<TalkAction, { type: 'note' }> }) {
  const theme = useTheme();
  const save = useSaveTalkNote(threadId);
  const status = useTalkActionStatus(threadId);
  const [title, setTitle] = useState(action.title);
  const [body, setBody] = useState(action.body);

  if (action.status === 'saved') {
    return (
      <Shell icon={<CheckCircle2 size={18} color={theme.colors.success} />} bg={theme.colors.successSoft}>
        <Text variant="label">{pick(lang, 'Saved to Notion', 'Notion mein save ho gaya')}</Text>
        <Text variant="callout">{action.title}</Text>
        {action.url ? (
          <View style={styles.row}>
            <Button label={pick(lang, 'Open in Notion', 'Notion mein kholo')} icon={ExternalLink} size="sm" variant="secondary" onPress={() => void openExternal(action.url as string)} />
          </View>
        ) : null}
      </Shell>
    );
  }
  if (action.status !== 'proposed') {
    return (
      <Shell icon={<NotebookText size={18} color={theme.colors.textMuted} />} bg={theme.colors.surfaceMuted}>
        <Text variant="callout" tone="muted">{pick(lang, 'Not saved', 'Save nahi kiya')}</Text>
      </Shell>
    );
  }
  return (
    <Shell icon={<NotebookText size={18} color={theme.colors.primaryText} />} tint={theme.colors.primary} bg={theme.colors.primarySoft}>
      <Text variant="label" tone="brand">{pick(lang, 'Note for Notion: saved only when you tap Save', 'Notion note: Save dabane par hi save hoga')}</Text>
      <TextField label={pick(lang, 'Title', 'Title')} value={title} onChangeText={setTitle} maxLength={300} />
      <TextField label={pick(lang, 'Note', 'Note')} value={body} onChangeText={setBody} multiline maxLength={20000} />
      <View style={styles.row}>
        <Button
          label={pick(lang, 'Save to Notion', 'Notion mein save karo')}
          icon={Send}
          size="sm"
          disabled={!title.trim() || !body.trim() || !messageId}
          loading={save.isPending}
          onPress={() =>
            messageId &&
            save.mutate(
              { messageId, actionId: action.id, title: title.trim(), body },
              { onSuccess: () => haptics.success(), onError: (e) => toast(getErrorMessage(e)) },
            )
          }
        />
        <Button
          label={pick(lang, 'Discard', 'Hatao')}
          size="sm"
          variant="ghost"
          onPress={() => messageId && status.mutate({ messageId, actionId: action.id, status: 'cancelled' })}
        />
      </View>
    </Shell>
  );
}

function PauseCard({ action, lang }: { action: Extract<TalkAction, { type: 'pause' }>; lang: LanguageStyle }) {
  const theme = useTheme();
  const update = useUpdateSettings();
  const [resumed, setResumed] = useState(false);
  const now = useNow();
  const active = !resumed && new Date(action.until).getTime() > now;
  return (
    <Shell icon={<Coffee size={18} color={theme.colors.primaryText} />} bg={theme.colors.primarySoft}>
      <Text variant="label">
        {active ? pick(lang, `Taking a break until ${when(action.until)}`, `${when(action.until)} tak break`) : pick(lang, 'Break over', 'Break khatam')}
      </Text>
      {action.note ? <Text variant="caption" tone="secondary">{action.note}</Text> : null}
      {active ? (
        <View style={styles.row}>
          <Button
            label={pick(lang, 'Resume now', 'Abhi resume karo')}
            size="sm"
            variant="secondary"
            loading={update.isPending}
            onPress={() => update.mutate({ nudgesPausedUntil: null }, { onSuccess: () => setResumed(true) })}
          />
        </View>
      ) : null}
    </Shell>
  );
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
  const sendFromAccount = useSendTalkEmail(threadId);
  const [to, setTo] = useState(action.to ?? '');
  const [subject, setSubject] = useState(action.subject);
  const [body, setBody] = useState(action.body);
  const [local, setLocal] = useState<'sent' | 'cancelled' | null>(null);
  const [sentFromAccount, setSentFromAccount] = useState(Boolean(action.sentFromAccount));
  const state = local ?? action.status;

  if (state !== 'proposed') {
    return (
      <Shell icon={state === 'sent' ? <CheckCircle2 size={18} color={theme.colors.success} /> : <Mail size={18} color={theme.colors.textMuted} />} bg={state === 'sent' ? theme.colors.successSoft : theme.colors.surfaceMuted}>
        <Text variant="callout" tone={state === 'sent' ? 'default' : 'muted'}>
          {state === 'sent'
            ? sentFromAccount
              ? pick(lang, `Sent: ${action.subject || subject}`, `Bhej diya: ${action.subject || subject}`)
              : pick(lang, `Opened in your email: ${action.subject}`, `Email app mein khola: ${action.subject}`)
            : pick(lang, 'Draft discarded', 'Draft hata diya')}
        </Text>
      </Shell>
    );
  }

  const openInApp = async () => {
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      setLocal('sent');
      if (messageId) status.mutate({ messageId, actionId: action.id, status: 'sent' });
    } catch {
      toast(pick(lang, 'No email app found on this phone.', 'Is phone par koi email app nahi mila.'));
    }
  };
  const sendNow = () => {
    haptics.light();
    sendFromAccount.mutate(
      {
        messageId: messageId ?? undefined,
        actionId: messageId ? action.id : undefined,
        to: to.trim(),
        subject: subject.trim(),
        body,
        replyToEmailId: action.replyToEmailId ?? null,
      },
      {
        onSuccess: () => {
          haptics.success();
          setSentFromAccount(true);
          setLocal('sent');
          toast(pick(lang, 'Sent from your email', 'Tumhare email se bhej diya'));
        },
        onError: (e) => toast(getErrorMessage(e)),
      },
    );
  };
  const discard = () => {
    setLocal('cancelled');
    if (messageId) status.mutate({ messageId, actionId: action.id, status: 'cancelled' });
  };
  const canSend = Boolean(action.canSendFromAccount);
  const valid = EMAIL_RE.test(to.trim()) && subject.trim().length > 0 && body.trim().length > 0;

  return (
    <Shell icon={<Mail size={18} color={theme.colors.primaryText} />} tint={theme.colors.primary} bg={theme.colors.primarySoft}>
      <Text variant="label" tone="brand">
        {canSend
          ? pick(lang, `${action.replyToEmailId ? 'Reply' : 'Email'} draft: nothing is sent until you tap Send`, `${action.replyToEmailId ? 'Reply' : 'Email'} draft: Send dabane tak kuch nahi jayega`)
          : pick(lang, 'Email draft: sent only from your own email', 'Email draft: sirf tumhare email se jayega')}
      </Text>
      <TextField label={pick(lang, 'To', 'Kisko')} value={to} onChangeText={setTo} autoCapitalize="none" keyboardType="email-address" />
      <TextField label={pick(lang, 'Subject', 'Subject')} value={subject} onChangeText={setSubject} maxLength={300} />
      <TextField label={pick(lang, 'Message', 'Message')} value={body} onChangeText={setBody} multiline maxLength={10000} />
      <View style={styles.row}>
        {canSend ? (
          <>
            <Button label={pick(lang, 'Send', 'Bhejo')} icon={Send} size="sm" disabled={!valid} loading={sendFromAccount.isPending} onPress={sendNow} />
            <Button label={pick(lang, 'Email app', 'Email app')} size="sm" variant="secondary" disabled={!subject.trim() && !body.trim()} onPress={() => void openInApp()} />
          </>
        ) : (
          <Button label={pick(lang, 'Open in email app', 'Email app mein kholo')} icon={Send} size="sm" disabled={!subject.trim() && !body.trim()} onPress={() => void openInApp()} />
        )}
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
    flexWrap: 'wrap',
    gap: 6,
  },
  group: {
    gap: 6,
  },
  item: {
    gap: 2,
    paddingVertical: 2,
  },
});

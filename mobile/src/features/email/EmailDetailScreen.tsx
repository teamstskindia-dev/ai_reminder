import { router, Stack } from 'expo-router';
import {
  AlarmClock,
  BellOff,
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  ListChecks,
  Lock,
  Reply,
  Send,
  ShieldAlert,
  Star,
  Undo2,
  X,
} from 'lucide-react-native';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import {
  useDraftEmailReply,
  useEmail,
  useEmailFeedback,
  useEmailStatus,
  useRemindAboutEmail,
  useResolveDetected,
  useSendEmailReply,
} from '@/api/hooks/emails';
import type { EmailDetail, EmailDetected } from '@/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { providerName } from '@/features/integrations/connect';
import { useSendToTool } from '@/features/tools/useSendToTool';
import { useNow } from '@/hooks/useNow';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatDayLabel, formatRelative, formatTime } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { openExternal } from '@/utils/links';
import { toast } from '@/utils/toast';

import { CATEGORY_LABEL, CATEGORY_TONE, senderName } from './EmailRow';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KIND_LABEL: Record<EmailDetected['kind'], string> = {
  deadline: 'Deadline',
  bill: 'Bill',
  booking: 'Booking',
  travel: 'Travel',
};

function when(iso: string): string {
  return `${formatDayLabel(iso)} · ${formatTime(iso)}`;
}

function DetectedRow({ email, item }: { email: EmailDetail; item: EmailDetected }) {
  const resolve = useResolveDetected();
  const run = (action: 'reminder' | 'calendar' | 'dismiss') =>
    resolve.mutate(
      { id: email.id, detectedId: item.id, action },
      {
        onSuccess: () => {
          haptics.success();
          if (action === 'reminder') toast('Reminder set');
          if (action === 'calendar') toast('Added to your calendar');
        },
        onError: (e) => toast(getErrorMessage(e)),
      },
    );
  return (
    <Card>
      <View style={styles.rowTop}>
        <Chip label={KIND_LABEL[item.kind]} tone="brand" />
        {item.dueAt ? (
          <Text variant="caption" tone="secondary">
            {when(item.dueAt)}
          </Text>
        ) : null}
      </View>
      <Text variant="callout" style={styles.gapTop}>
        {item.title}
      </Text>
      {item.status === 'open' ? (
        <View style={styles.actions}>
          <Button label="Remind me" icon={AlarmClock} size="sm" loading={resolve.isPending} onPress={() => run('reminder')} />
          {item.dueAt ? (
            <Button label="Add to calendar" icon={CalendarPlus} size="sm" variant="secondary" onPress={() => run('calendar')} />
          ) : null}
          <Button label="Dismiss" size="sm" variant="ghost" onPress={() => run('dismiss')} />
        </View>
      ) : (
        <Text variant="caption" tone={item.status === 'added' ? 'success' : 'muted'} style={styles.gapTop}>
          {item.status === 'added' ? 'Added' : 'Dismissed'}
        </Text>
      )}
    </Card>
  );
}

/** Draft in the user's style → edit → Send from their account (or open in their email app). Never automatic. */
function ReplyComposer({ email }: { email: EmailDetail }) {
  const theme = useTheme();
  const draft = useDraftEmailReply();
  const send = useSendEmailReply();
  const [instructions, setInstructions] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [open, setOpen] = useState(false);
  const [canSend, setCanSend] = useState(email.canSend);

  if (email.status === 'replied') {
    return (
      <Card muted>
        <View style={styles.rowTop}>
          <CheckCircle2 size={18} color={theme.colors.success} />
          <Text variant="callout">Replied</Text>
        </View>
      </Card>
    );
  }

  const makeDraft = () =>
    draft.mutate(
      { id: email.id, instructions: instructions.trim() || undefined },
      {
        onSuccess: (d) => {
          setTo(d.to);
          setSubject(d.subject);
          setBody(d.body);
          setCanSend(d.canSend);
          setOpen(true);
        },
        onError: (e) => toast(getErrorMessage(e)),
      },
    );

  const sendNow = () =>
    send.mutate(
      { id: email.id, to: to.trim(), subject: subject.trim(), body },
      {
        onSuccess: () => {
          haptics.success();
          setOpen(false);
          toast(`Sent from your ${providerName(email.provider)}`);
        },
        onError: (e) => toast(getErrorMessage(e)),
      },
    );

  const openInApp = async () => {
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      toast('No email app found on this phone.');
    }
  };

  if (!open) {
    return (
      <Card>
        <TextField
          label="What do you want to say? (optional)"
          placeholder="Yes, Thursday works"
          value={instructions}
          onChangeText={setInstructions}
          maxLength={1000}
        />
        <View style={styles.actions}>
          <Button label="Draft a reply" icon={Reply} size="sm" loading={draft.isPending} onPress={makeDraft} />
        </View>
      </Card>
    );
  }

  const valid = EMAIL_RE.test(to.trim()) && subject.trim().length > 0 && body.trim().length > 0;
  return (
    <Card style={{ borderColor: theme.colors.primary, borderWidth: StyleSheet.hairlineWidth }}>
      <Text variant="label" tone="brand">
        {canSend ? 'Nothing is sent until you tap Send' : 'Read-only connection: it opens in your email app'}
      </Text>
      <View style={styles.fields}>
        <TextField label="To" value={to} onChangeText={setTo} autoCapitalize="none" keyboardType="email-address" />
        <TextField label="Subject" value={subject} onChangeText={setSubject} maxLength={300} />
        <TextField label="Message" value={body} onChangeText={setBody} multiline maxLength={10000} />
      </View>
      <View style={styles.actions}>
        {canSend ? (
          <Button label="Send" icon={Send} size="sm" disabled={!valid} loading={send.isPending} onPress={sendNow} />
        ) : (
          <Button label="Open in email app" icon={Send} size="sm" disabled={!valid} onPress={() => void openInApp()} />
        )}
        <Button label="Discard" size="sm" variant="ghost" onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}

function RemindLater({ email }: { email: EmailDetail }) {
  const remind = useRemindAboutEmail();
  const now = useNow();
  const [at, setAt] = useState<Date | null>(null);
  if (email.reminderId) {
    return (
      <Card muted onPress={() => router.push(`/reminder/${email.reminderId}`)} accessibilityLabel="Open the reminder">
        <View style={styles.rowTop}>
          <AlarmClock size={18} />
          <Text variant="callout">Reminder set. Tap to change it.</Text>
        </View>
      </Card>
    );
  }
  return (
    <Card>
      <DateTimeField label="Remind me later" value={at} minimumDate={new Date()} onChange={setAt} placeholder="Pick a time" />
      <View style={styles.actions}>
        <Button
          label="Set reminder"
          icon={AlarmClock}
          size="sm"
          variant="secondary"
          disabled={!at || at.getTime() <= now}
          loading={remind.isPending}
          onPress={() =>
            at &&
            remind.mutate(
              { id: email.id, remindAt: at.toISOString() },
              { onSuccess: () => toast(`I'll remind you ${formatDayLabel(at).toLowerCase()} at ${formatTime(at)}`), onError: (e) => toast(getErrorMessage(e)) },
            )
          }
        />
      </View>
    </Card>
  );
}

/** One email (user-flow §07): summary and why it matters, reply, remind me later, learn what matters. */
export function EmailDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const email = useEmail(id);
  const feedback = useEmailFeedback();
  const status = useEmailStatus();
  const tool = useSendToTool();
  const refreshControl = useRefreshControl(() => email.refetch());
  const e = email.data;

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.content} refreshControl={refreshControl}>
      <Stack.Screen options={{ title: e ? senderName(e) : '' }} />
      {email.isPending ? (
        <View style={styles.sections}>
          <Skeleton height={90} radius={16} />
          <SkeletonCard lines={3} />
        </View>
      ) : email.isError || !e ? (
        <ErrorState error={email.error} onRetry={() => void email.refetch()} retrying={email.isFetching} />
      ) : (
        <View style={styles.sections}>
          <Card>
            <View style={styles.head}>
              <Avatar name={senderName(e)} size={44} />
              <View style={styles.flex}>
                <View style={styles.rowTop}>
                  {e.isVip ? <Star size={14} color={theme.colors.warning} fill={theme.colors.warning} /> : null}
                  <Text variant="subheading" numberOfLines={1} style={styles.flex}>
                    {senderName(e)}
                  </Text>
                </View>
                {e.fromEmail && e.fromName ? (
                  <Text variant="caption" tone="secondary" numberOfLines={1}>
                    {e.fromEmail}
                  </Text>
                ) : null}
                <Text variant="caption" tone="muted">
                  {formatRelative(e.receivedAt)} · {providerName(e.provider)}
                </Text>
              </View>
              <Chip label={CATEGORY_LABEL[e.category]} tone={CATEGORY_TONE[e.category]} />
            </View>
            {e.subject ? (
              <Text variant="label" style={styles.gapTop}>
                {e.subject}
              </Text>
            ) : null}
          </Card>

          {e.category === 'phishing' ? (
            <Card style={{ backgroundColor: theme.colors.dangerSoft }}>
              <View style={styles.rowTop}>
                <ShieldAlert size={18} color={theme.colors.danger} />
                <Text variant="label" tone="danger" style={styles.flex}>
                  This looks like phishing
                </Text>
              </View>
              <Text variant="callout" style={styles.gapTop}>
                Don’t open its links or attachments, and never share codes or passwords. I never open them either.
              </Text>
            </Card>
          ) : null}

          {e.category === 'sensitive' ? (
            <Card muted>
              <View style={styles.rowTop}>
                <Lock size={18} color={theme.colors.textSecondary} />
                <Text variant="callout" style={styles.flex}>
                  This looked like a code, password or statement, so I didn’t keep any of it.
                </Text>
              </View>
            </Card>
          ) : (
            <Card>
              <Text variant="micro" tone="muted">
                SUMMARY
              </Text>
              <Text variant="body" style={styles.gapTop}>
                {e.summary ?? 'No summary.'}
              </Text>
              {e.why ? (
                <Text variant="callout" tone="secondary" style={styles.gapTop}>
                  Why it matters: {e.why}
                </Text>
              ) : null}
            </Card>
          )}

          {e.detected.length ? (
            <View style={styles.section}>
              <SectionHeader title="Spotted in this email" subtitle="Confirm and I’ll remind you or add it to your calendar" />
              {e.detected.map((d) => (
                <DetectedRow key={d.id} email={e} item={d} />
              ))}
            </View>
          ) : null}

          {e.category !== 'phishing' && e.category !== 'sensitive' && e.category !== 'promotion' ? (
            <View style={styles.section}>
              <SectionHeader title="Reply" />
              <ReplyComposer email={e} />
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader title="Later" />
            <RemindLater email={e} />
            {tool.tools.length ? (
              <Button
                label="Create a task from this"
                icon={ListChecks}
                variant="secondary"
                loading={tool.pending}
                onPress={() =>
                  tool.send({
                    title: `${e.category === 'needs_reply' ? 'Reply to' : 'Follow up with'} ${senderName(e)}${e.subject ? `: ${e.subject}` : ''}`.slice(0, 300),
                    details: e.summary ?? undefined,
                    source: 'email',
                  })
                }
              />
            ) : null}
          </View>

          <View style={styles.section}>
            <SectionHeader title="Teach me" subtitle="I learn which senders matter to you" />
            <View style={styles.actions}>
              {e.isVip ? (
                <Chip label="Always alerts" icon={Star} tone="warning" />
              ) : (
                <Button
                  label="Always alert me"
                  icon={Star}
                  size="sm"
                  variant="secondary"
                  loading={feedback.isPending && feedback.variables?.kind === 'always_alert'}
                  onPress={() =>
                    feedback.mutate({ id: e.id, kind: 'always_alert' }, { onSuccess: () => toast(`I'll always tell you about ${senderName(e)}`) })
                  }
                />
              )}
              <Button
                label="Not important"
                icon={BellOff}
                size="sm"
                variant="outline"
                loading={feedback.isPending && feedback.variables?.kind === 'not_important'}
                onPress={() =>
                  feedback.mutate({ id: e.id, kind: 'not_important' }, { onSuccess: () => toast(`Got it. No more alerts from ${senderName(e)}.`) })
                }
              />
            </View>
          </View>

          <View style={styles.actions}>
            {e.status === 'done' ? (
              <Button label="Bring back" icon={Undo2} size="sm" variant="ghost" onPress={() => status.mutate({ id: e.id, status: 'new' })} />
            ) : (
              <Button
                label="Mark handled"
                icon={X}
                size="sm"
                variant="ghost"
                onPress={() => status.mutate({ id: e.id, status: 'done' }, { onSuccess: () => router.back() })}
              />
            )}
            {e.webUrl && e.category !== 'phishing' ? (
              <Button
                label={`Open in ${providerName(e.provider)}`}
                icon={ExternalLink}
                size="sm"
                variant="ghost"
                onPress={() => void openExternal(e.webUrl as string)}
              />
            ) : null}
          </View>
        </View>
      )}
      {tool.sheet}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', padding: 16, paddingBottom: 40 },
  sections: { gap: 20 },
  section: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gapTop: { marginTop: 8 },
  fields: { gap: 10, marginTop: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
});

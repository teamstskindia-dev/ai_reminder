import { router, Stack, useFocusEffect } from 'expo-router';
import {
  AlarmClock,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  HelpCircle,
  ListChecks,
  Mic,
  Pencil,
  RotateCw,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useCapture, useDeleteCapture, useRenameCapture, useRetryCapture, useReviewCapture } from '@/api/hooks/captures';
import { useTranscript } from '@/api/hooks/meetings';
import { useProfile } from '@/api/hooks/onboarding';
import { getErrorMessage } from '@/api/errors';
import type { CaptureDetail, CaptureMood, CaptureSuggestion, LanguageStyle } from '@/api/types';
import { Markdown } from '@/components/markdown/Markdown';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Chip } from '@/components/ui/Chip';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { IconButton } from '@/components/ui/IconButton';
import { ListGroup } from '@/components/ui/ListRow';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { ActionItemRow } from '@/features/action-items/ActionItemRow';
import { openActionItemEditor, useActionItemActions } from '@/features/action-items/useActionItemMenu';
import { ReminderRow } from '@/features/reminders/ReminderRow';
import { useReminderMenu } from '@/features/reminders/useReminderMenu';
import { goBack } from '@/features/navigation/goBack';
import { pick } from '@/features/setup/shared';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatDayLabel, formatDuration, formatTime, formatTimestamp as formatClock } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

import { EventLink, FollowUpCard } from './CaptureMeetingLink';


const MOOD: Record<CaptureMood, { emoji: string; en: string; hi: string }> = {
  happy: { emoji: '😄', en: 'Happy', hi: 'Khush' },
  calm: { emoji: '🙂', en: 'Calm', hi: 'Shaant' },
  neutral: { emoji: '😐', en: 'Neutral', hi: 'Normal' },
  stressed: { emoji: '😣', en: 'Stressed', hi: 'Tension mein' },
  low: { emoji: '😞', en: 'Low', hi: 'Udaas' },
};

interface Draft {
  decision: 'confirm' | 'dismiss' | null;
  title: string;
  remindAt: Date | null;
}

function SuggestionCard({
  s,
  draft,
  onChange,
  lang,
}: {
  s: CaptureSuggestion;
  draft: Draft;
  onChange: (d: Draft) => void;
  lang: LanguageStyle;
}) {
  const theme = useTheme();
  const decided = draft.decision !== null;
  return (
    <Card style={decided ? { opacity: draft.decision === 'dismiss' ? 0.55 : 1 } : undefined}>
      <View style={styles.cardBody}>
        <View style={styles.row}>
          <View style={[styles.roundIcon, { backgroundColor: theme.colors.warningSoft }]}>
            <HelpCircle size={18} color={theme.colors.warning} />
          </View>
          <View style={styles.flex}>
            <Text variant="subheading">{s.question}</Text>
            <Text variant="caption" tone="secondary">
              {s.body ?? s.title}
            </Text>
          </View>
        </View>
        {s.options.length ? (
          <View style={styles.chips}>
            {s.options.map((o) => (
              <Chip
                key={o.label}
                label={o.label}
                selected={draft.title === o.title}
                onPress={() => {
                  haptics.selection();
                  onChange({ decision: 'confirm', title: o.title, remindAt: o.remindAt ? new Date(o.remindAt) : draft.remindAt });
                }}
              />
            ))}
          </View>
        ) : null}
        <TextField
          label={pick(lang, 'Reminder', 'Reminder')}
          value={draft.title}
          maxLength={300}
          onChangeText={(title) => onChange({ ...draft, title, decision: 'confirm' })}
        />
        <DateTimeField
          label={pick(lang, 'When', 'Kab')}
          value={draft.remindAt}
          minimumDate={new Date()}
          placeholder={pick(lang, 'Pick a time', 'Time chuno')}
          onChange={(remindAt) => onChange({ ...draft, remindAt, decision: 'confirm' })}
        />
        <View style={styles.inlineActions}>
          <Button
            label={draft.decision === 'confirm' ? pick(lang, 'Will be set ✓', 'Set hoga ✓') : pick(lang, 'Set reminder', 'Reminder set karo')}
            size="sm"
            variant={draft.decision === 'confirm' ? 'secondary' : 'primary'}
            onPress={() => onChange({ ...draft, decision: 'confirm' })}
          />
          <Button
            label={draft.decision === 'dismiss' ? pick(lang, 'Skipped', 'Chhod diya') : pick(lang, 'Skip', 'Chhodo')}
            size="sm"
            variant="ghost"
            onPress={() => onChange({ ...draft, decision: draft.decision === 'dismiss' ? null : 'dismiss' })}
          />
        </View>
      </View>
    </Card>
  );
}

function Processing({ capture, lang }: { capture: CaptureDetail; lang: LanguageStyle }) {
  const theme = useTheme();
  return (
    <Card>
      <View style={styles.centerBlock}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text variant="subheading" align="center">
          {capture.status === 'uploading'
            ? pick(lang, 'Sending your recording…', 'Recording bhej raha hoon…')
            : pick(lang, 'Transcribing and understanding…', 'Likh raha hoon aur samajh raha hoon…')}
        </Text>
        <Text variant="caption" tone="secondary" align="center">
          {pick(
            lang,
            'English and Hinglish, speakers, summary, to-dos and reminders. You can leave the app, I’ll let you know when it’s ready.',
            'English aur Hinglish, kaun bola, summary, to-dos aur reminders. App band kar sakte ho, ready hote hi bata dunga.',
          )}
        </Text>
      </View>
    </Card>
  );
}

/**
 * A recorded conversation (user-flow §04): processing state, failure with retry, and the review card:
 * confirm or fix the reminders the friend was unsure about, edit or remove to-dos and reminders, see
 * people, facts about you and mood, then save. Never reviewing is fine: clear reminders are already set.
 */
export function CaptureScreen({ id }: { id: string }) {
  const theme = useTheme();
  const profile = useProfile();
  const lang = profile.data?.languageStyle ?? 'english';
  const query = useCapture(id);
  const capture = query.data;
  const review = useReviewCapture(id);
  const rename = useRenameCapture(id);
  const retry = useRetryCapture(id);
  const remove = useDeleteCapture();
  const actionItems = useActionItemActions();
  const reminderMenu = useReminderMenu();
  /** What the user changed; anything untouched falls back to the defaults below. */
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [factChoices, setFactChoices] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const transcript = useTranscript(id, showTranscript && capture?.status === 'completed');

  // Items are edited on other screens (to-do and reminder editors): refresh when coming back.
  useFocusEffect(
    useCallback(() => {
      void query.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const insights = capture?.insights ?? null;
  const open = useMemo(() => insights?.suggestions.filter((s) => s.status === 'open') ?? [], [insights]);
  const unsavedFacts = useMemo(
    () => insights?.userFacts.filter((f) => !insights.savedFacts.some((x) => x.toLowerCase() === f.toLowerCase())) ?? [],
    [insights],
  );

  // Defaults: each open suggestion starts undecided with the friend's guess; facts start ticked.
  const drafts = useMemo(() => {
    const out: Record<string, Draft> = {};
    for (const s of open) {
      out[s.id] = edits[s.id] ?? { decision: null, title: s.title, remindAt: s.remindAt ? new Date(s.remindAt) : null };
    }
    return out;
  }, [open, edits]);
  const facts = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const f of unsavedFacts) out[f] = factChoices[f] ?? true;
    return out;
  }, [unsavedFacts, factChoices]);

  const close = () => goBack();

  const confirmDelete = () => {
    Alert.alert(
      pick(lang, 'Delete this recording?', 'Ye recording delete karein?'),
      pick(
        lang,
        'The transcript, summary and to-dos are removed, and its reminders are cancelled.',
        'Transcript, summary aur to-dos hat jayenge, aur iske reminders cancel ho jayenge.',
      ),
      [
        { text: pick(lang, 'Cancel', 'Rehne do'), style: 'cancel' },
        {
          text: pick(lang, 'Delete', 'Delete karo'),
          style: 'destructive',
          onPress: () =>
            remove.mutate(id, {
              onSuccess: () => {
                toast(pick(lang, 'Recording deleted.', 'Recording delete ho gayi.'));
                close();
              },
              onError: (e) => toast(getErrorMessage(e)),
            }),
        },
      ],
    );
  };

  const save = () => {
    const decided = open.filter((s) => drafts[s.id]?.decision);
    for (const s of decided) {
      const d = drafts[s.id];
      if (d.decision === 'confirm' && (!d.remindAt || d.remindAt.getTime() <= Date.now() + 60_000)) {
        toast(pick(lang, `Pick a future time for "${d.title}"`, `"${d.title}" ke liye aage ka time chuno`));
        return;
      }
    }
    review.mutate(
      {
        suggestions: decided.map((s) => {
          const d = drafts[s.id];
          return d.decision === 'confirm'
            ? { id: s.id, action: 'confirm' as const, title: d.title.trim() || s.title, remindAt: d.remindAt?.toISOString() }
            : { id: s.id, action: 'dismiss' as const };
        }),
        saveFacts: unsavedFacts.filter((f) => facts[f]),
      },
      {
        onSuccess: (res) => {
          haptics.success();
          const left = res.openSuggestionCount;
          toast(
            left
              ? pick(lang, `Saved. ${left} still to decide.`, `Save ho gaya. ${left} abhi baaki.`)
              : pick(lang, 'Saved. Reminders are set.', 'Save ho gaya. Reminders set hain.'),
          );
        },
        onError: (e) => toast(getErrorMessage(e)),
      },
    );
  };

  const header = (
    <Stack.Screen
      options={{
        title: '',
        headerRight: () =>
          capture ? <IconButton icon={Trash2} accessibilityLabel="Delete recording" onPress={confirmDelete} /> : null,
      }}
    />
  );

  if (query.isPending) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        {header}
        <View style={styles.content}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </View>
      </View>
    );
  }
  if (!capture) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        {header}
        <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </View>
    );
  }

  const when = `${formatDayLabel(capture.startAt)} · ${formatTime(capture.startAt)}`;
  const duration = formatDuration(capture.durationSeconds);
  const needsSave = open.some((s) => drafts[s.id]?.decision) || unsavedFacts.some((f) => facts[f]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Touchable accessibilityRole="button" accessibilityLabel="Rename recording" onPress={() => setRenaming(true)} style={styles.titleRow}>
          <View style={styles.flex}>
            <Text variant="title">{capture.title}</Text>
            <Text variant="caption" tone="secondary">
              {[when, duration].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Pencil size={16} color={theme.colors.textMuted} />
        </Touchable>
        <EventLink capture={capture} lang={lang} />

        {capture.status === 'uploading' || capture.status === 'processing' ? <Processing capture={capture} lang={lang} /> : null}

        {capture.status === 'failed' ? (
          <Card>
            <EmptyState
              compact
              icon={capture.noSpeech ? Mic : CircleAlert}
              title={
                capture.noSpeech
                  ? pick(lang, 'Nothing to process', 'Process karne ko kuch nahi')
                  : pick(lang, 'We couldn’t process this one', 'Ise process nahi kar paaye')
              }
              message={
                capture.noSpeech
                  ? pick(lang, 'The recording had no speech I could understand.', 'Recording mein samajhne layak baat nahi thi.')
                  : capture.audioKept
                    ? pick(lang, 'Your recording is saved. Try again in a moment.', 'Recording save hai. Thodi der mein dobara try karo.')
                    : (capture.failureReason ?? undefined)
              }
              action={
                !capture.noSpeech && capture.audioKept
                  ? {
                      label: pick(lang, 'Try again', 'Dobara try karo'),
                      onPress: () => retry.mutate(undefined, { onError: (e) => toast(getErrorMessage(e)) }),
                    }
                  : { label: pick(lang, 'Delete', 'Delete karo'), onPress: confirmDelete }
              }
            />
          </Card>
        ) : null}

        {capture.status === 'completed' ? (
          <>
            {open.length ? (
              <View style={styles.section}>
                <SectionHeader
                  title={pick(lang, 'A quick check', 'Ek chhota sa sawaal')}
                  subtitle={pick(
                    lang,
                    'I didn’t set these because something was unclear.',
                    'Ye set nahi kiye kyunki kuch saaf nahi tha.',
                  )}
                />
                {open.map((s) =>
                  drafts[s.id] ? (
                    <SuggestionCard key={s.id} s={s} draft={drafts[s.id]} lang={lang} onChange={(d) => setEdits((p) => ({ ...p, [s.id]: d }))} />
                  ) : null,
                )}
              </View>
            ) : capture.reviewedAt ? (
              <Card muted>
                <View style={styles.row}>
                  <CheckCircle2 size={18} color={theme.colors.success} />
                  <Text variant="callout" style={styles.flex}>
                    {pick(lang, 'Reviewed. Everything is saved.', 'Review ho gaya. Sab save hai.')}
                  </Text>
                </View>
              </Card>
            ) : null}

            <FollowUpCard key={capture.followUp?.subject ?? 'none'} capture={capture} lang={lang} />

            {capture.summary ? (
              <View style={styles.section}>
                <SectionHeader title={pick(lang, 'Summary', 'Summary')} />
                <Card>
                  <View style={styles.cardBody}>
                    <Markdown>{capture.summary}</Markdown>
                    {capture.keyPoints.length ? (
                      <View style={styles.bullets}>
                        {capture.keyPoints.slice(0, 6).map((p, i) => (
                          <Text key={i} variant="callout" tone="secondary">
                            • {p}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </Card>
              </View>
            ) : null}

            <View style={styles.section}>
              <SectionHeader title={pick(lang, 'To-dos', 'To-dos')} />
              {capture.actionItems.length ? (
                <ListGroup>
                  {capture.actionItems.map((item) => (
                    <ActionItemRow
                      key={item.id}
                      item={item}
                      showMeeting={false}
                      onToggle={(i) => {
                        actionItems.onToggle(i);
                        setTimeout(() => void query.refetch(), 600);
                      }}
                      onPress={() => openActionItemEditor(item)}
                      onMenu={actionItems.openMenu}
                    />
                  ))}
                </ListGroup>
              ) : (
                <Card muted>
                  <EmptyState compact icon={ListChecks} title={pick(lang, 'No to-dos found', 'Koi to-do nahi mila')} />
                </Card>
              )}
            </View>

            <View style={styles.section}>
              <SectionHeader title={pick(lang, 'Reminders', 'Reminders')} />
              {capture.reminders.length ? (
                <ListGroup>
                  {capture.reminders.map((r) => (
                    <ReminderRow
                      key={r.id}
                      reminder={r}
                      showDay
                      onPress={() => router.push(`/reminder/${r.id}`)}
                      onMenu={reminderMenu.openMenu}
                      onDone={reminderMenu.markDone}
                    />
                  ))}
                </ListGroup>
              ) : (
                <Card muted>
                  <EmptyState compact icon={AlarmClock} title={pick(lang, 'No reminders set', 'Koi reminder set nahi')} />
                </Card>
              )}
            </View>

            {insights?.people.length ? (
              <View style={styles.section}>
                <SectionHeader title={pick(lang, 'People', 'Log')} />
                <Card>
                  <View style={styles.cardBody}>
                    {insights.people.map((p) => (
                      <View key={p.name} style={styles.person}>
                        <View style={[styles.roundIcon, { backgroundColor: theme.colors.accentSoft }]}>
                          <Users size={16} color={theme.colors.accentText} />
                        </View>
                        <View style={styles.flex}>
                          <Text variant="bodyStrong">
                            {p.name}
                            {p.relation ? <Text variant="caption" tone="secondary">{`  ·  ${p.relation}`}</Text> : null}
                          </Text>
                          {p.notes.map((n, i) => (
                            <Text key={i} variant="caption" tone="secondary">
                              {n}
                            </Text>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                </Card>
              </View>
            ) : null}

            {insights && (insights.userFacts.length || insights.mood) ? (
              <View style={styles.section}>
                <SectionHeader title={pick(lang, 'About you', 'Tumhare baare mein')} />
                <Card>
                  <View style={styles.cardBody}>
                    {insights.mood ? (
                      <View style={styles.row}>
                        <Text style={styles.emoji}>{MOOD[insights.mood].emoji}</Text>
                        <Text variant="callout" style={styles.flex}>
                          {pick(lang, `You sounded ${MOOD[insights.mood].en.toLowerCase()}`, `Tum ${MOOD[insights.mood].hi} lag rahe the`)}
                        </Text>
                      </View>
                    ) : null}
                    {insights.userFacts.map((f) => {
                      const saved = insights.savedFacts.some((x) => x.toLowerCase() === f.toLowerCase());
                      return (
                        <View key={f} style={styles.row}>
                          {saved ? (
                            <CheckCircle2 size={22} color={theme.colors.success} />
                          ) : (
                            <Checkbox
                              checked={facts[f] ?? true}
                              onToggle={() => setFactChoices((p) => ({ ...p, [f]: !(facts[f] ?? true) }))}
                              accessibilityLabel={`Remember: ${f}`}
                            />
                          )}
                          <Text variant="callout" style={styles.flex}>
                            {f}
                          </Text>
                        </View>
                      );
                    })}
                    {unsavedFacts.length ? (
                      <Text variant="caption" tone="muted">
                        {pick(lang, 'Ticked facts are remembered when you save.', 'Tick kiye facts save karne par yaad rahenge.')}
                      </Text>
                    ) : null}
                  </View>
                </Card>
              </View>
            ) : null}

            {capture.bookmarks.length ? (
              <View style={styles.section}>
                <SectionHeader title={pick(lang, 'Bookmarks', 'Bookmarks')} />
                <View style={styles.chips}>
                  {capture.bookmarks.map((b) => (
                    <Chip key={b.atMs} icon={Bookmark} label={b.label ? `${formatClock(b.atMs)} · ${b.label}` : formatClock(b.atMs)} size="sm" />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Touchable accessibilityRole="button" onPress={() => setShowTranscript((v) => !v)} style={styles.transcriptToggle}>
                <Sparkles size={16} color={theme.colors.primaryText} />
                <Text variant="label" tone="brand" style={styles.flex}>
                  {showTranscript ? pick(lang, 'Hide transcript', 'Transcript chhupao') : pick(lang, 'Show transcript', 'Transcript dikhao')}
                </Text>
                {showTranscript ? <ChevronUp size={16} color={theme.colors.primaryText} /> : <ChevronDown size={16} color={theme.colors.primaryText} />}
              </Touchable>
              {showTranscript ? (
                <Card>
                  <View style={styles.cardBody}>
                    {transcript.isPending ? (
                      <ActivityIndicator color={theme.colors.primary} />
                    ) : (
                      (transcript.data ?? []).map((seg) => (
                        <View key={seg.seq}>
                          <Text variant="micro" tone="muted">
                            {formatClock(seg.startMs)} · {seg.speaker}
                          </Text>
                          <Text variant="callout">{seg.text}</Text>
                        </View>
                      ))
                    )}
                  </View>
                </Card>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>

      {capture.status === 'completed' && (needsSave || !capture.reviewedAt) ? (
        <View style={[styles.footer, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <Button
            label={needsSave ? pick(lang, 'Save', 'Save karo') : pick(lang, 'Looks good', 'Sab theek hai')}
            icon={CheckCircle2}
            fullWidth
            loading={review.isPending}
            onPress={save}
          />
        </View>
      ) : capture.status === 'failed' && !capture.noSpeech && capture.audioKept ? (
        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <Button label={pick(lang, 'Try again', 'Dobara try karo')} icon={RotateCw} fullWidth loading={retry.isPending} onPress={() => retry.mutate()} />
        </View>
      ) : null}

      <PromptDialog
        visible={renaming}
        title={pick(lang, 'Rename', 'Naam badlo')}
        initialValue={capture.title}
        maxLength={300}
        onCancel={() => setRenaming(false)}
        onSubmit={(value) => {
          setRenaming(false);
          if (value.trim() && value.trim() !== capture.title) rename.mutate(value.trim(), { onError: (e) => toast(getErrorMessage(e)) });
        }}
      />
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  section: {
    gap: 12,
  },
  cardBody: {
    gap: 12,
  },
  centerBlock: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  roundIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bullets: {
    gap: 4,
  },
  emoji: {
    fontSize: 22,
  },
  transcriptToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  footer: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

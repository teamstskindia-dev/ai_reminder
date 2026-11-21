import { MoonStar, Pencil, Plus, Sparkles, Sun, Trash, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useCorrections, useRemoveCorrection, useUpdateProfile } from '@/api/hooks/memory';
import { useDeleteProfile, useProfile } from '@/api/hooks/onboarding';
import type { LanguageStyle, ProfilePatch, UserProfile, UserSettings } from '@/api/types';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { ListGroup, SwitchRow } from '@/components/ui/ListRow';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/utils/toast';

const LANGUAGES: { value: LanguageStyle; label: string }[] = [
  { value: 'english', label: 'English' },
  { value: 'hinglish', label: 'Hinglish' },
  { value: 'mixed', label: 'English + Hinglish' },
];
/** The friend's tone with the user (user-flow §10, Settings → friend's tone). */
const TONES = ['Warm', 'Playful', 'Straight-talking', 'Calm'];
/** Relationship stage (grows nightly with real conversations). */
const STAGE_LABEL: Record<number, string> = { 1: 'Getting to know you', 2: 'Friends', 3: 'Close friends' };

type Field = 'preferredName' | 'occupation' | 'currentFocus' | 'communicationStyle';
const FIELDS: { key: Field; label: string; placeholder: string; max: number }[] = [
  { key: 'preferredName', label: 'Call me', placeholder: 'What should I call you?', max: 80 },
  { key: 'occupation', label: 'What I do', placeholder: 'e.g. Product designer at a startup', max: 200 },
  { key: 'currentFocus', label: 'On my mind', placeholder: 'What are you focused on lately?', max: 300 },
  { key: 'communicationStyle', label: 'Talk to me', placeholder: 'e.g. casual and to the point', max: 200 },
];

type Editing = { kind: 'field'; field: Field } | { kind: 'fact'; index: number | null } | null;

/**
 * "What I know about you" (user-flow §10): facts, preferences, personality and goals. Every item can be
 * edited, corrected or deleted; the friend's tone and language are chosen here too.
 */
export function AboutYou() {
  const theme = useTheme();
  const profile = useProfile();
  const update = useUpdateProfile();
  const remove = useDeleteProfile();
  const corrections = useCorrections();
  const removeCorrection = useRemoveCorrection();
  const [editing, setEditing] = useState<Editing>(null);
  const [factMenu, setFactMenu] = useState<number | null>(null);
  const p: UserProfile | undefined = profile.data;

  const save = (patch: ProfilePatch, done?: string) =>
    update.mutate(patch, { onSuccess: () => done && toast(done), onError: (e) => toast(getErrorMessage(e)) });

  const confirmForget = () =>
    Alert.alert('Forget what I know about you?', 'Your name, work, style and every fact you told me will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: () => remove.mutate(undefined, { onSuccess: () => toast('Done. I’ll learn again as we talk.') }),
      },
    ]);

  const facts = p?.facts ?? [];
  const field = editing?.kind === 'field' ? FIELDS.find((f) => f.key === editing.field) : undefined;
  const factIndex = editing?.kind === 'fact' ? editing.index : null;
  const hasAnything = !!p && (FIELDS.some((f) => p[f.key]) || facts.length > 0 || !!p.tone);

  return (
    <View style={styles.group}>
      <Text variant="micro" tone="muted" style={styles.title}>
        WHAT I KNOW ABOUT YOU
      </Text>
      <Card>
        {profile.isPending || !p ? (
          <Skeleton height={60} />
        ) : (
          <View style={styles.body}>
            {!hasAnything ? (
              <View style={styles.row}>
                <Sparkles size={18} color={theme.colors.primaryText} />
                <Text variant="callout" tone="secondary" style={styles.flex}>
                  Not much yet. I’ll learn about you gently as we talk, or tell me here.
                </Text>
              </View>
            ) : null}
            {FIELDS.map((f) => (
              <Touchable
                key={f.key}
                accessibilityRole="button"
                accessibilityLabel={`Edit: ${f.label}`}
                onPress={() => setEditing({ kind: 'field', field: f.key })}
                style={styles.editRow}
              >
                <View style={styles.flex}>
                  <Text variant="caption" tone="muted">
                    {f.label}
                  </Text>
                  <Text variant="callout" tone={p[f.key] ? 'default' : 'muted'}>
                    {p[f.key] ?? 'Add'}
                  </Text>
                </View>
                <Pencil size={14} color={theme.colors.textMuted} />
              </Touchable>
            ))}

            <View style={styles.item}>
              <Text variant="caption" tone="muted">
                Things you told me
              </Text>
              {facts.map((fact, i) => (
                <Touchable
                  key={`${i}-${fact}`}
                  accessibilityRole="button"
                  accessibilityHint="Edit or delete this fact"
                  onPress={() => setFactMenu(i)}
                  style={styles.editRow}
                >
                  <Text variant="callout" style={styles.flex}>
                    • {fact}
                  </Text>
                  <Pencil size={14} color={theme.colors.textMuted} />
                </Touchable>
              ))}
              <Button
                label="Add a fact"
                icon={Plus}
                variant="ghost"
                size="sm"
                onPress={() => setEditing({ kind: 'fact', index: null })}
                style={styles.start}
              />
            </View>

            <View style={styles.item}>
              <Text variant="caption" tone="muted">
                My tone with you
              </Text>
              <View style={styles.chips}>
                {TONES.map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={p.tone?.toLowerCase() === t.toLowerCase()}
                    onPress={() => save({ tone: p.tone?.toLowerCase() === t.toLowerCase() ? null : t.toLowerCase() })}
                  />
                ))}
              </View>
            </View>

            <View style={styles.item}>
              <Text variant="caption" tone="muted">
                Language
              </Text>
              <View style={styles.chips}>
                {LANGUAGES.map((l) => (
                  <Chip key={l.value} label={l.label} selected={p.languageStyle === l.value} onPress={() => save({ languageStyle: l.value })} />
                ))}
              </View>
            </View>

            {corrections.data?.length ? (
              <View style={styles.item}>
                <Text variant="caption" tone="muted">
                  Names I fixed (used in new recordings)
                </Text>
                {corrections.data.map((c) => (
                  <View key={c.from} style={styles.editRow}>
                    <Text variant="callout" style={styles.flex}>
                      {c.from} → {c.to}
                    </Text>
                    <Touchable
                      accessibilityRole="button"
                      accessibilityLabel={`Stop fixing ${c.from}`}
                      onPress={() => removeCorrection.mutate(c.from, { onError: (e) => toast(getErrorMessage(e)) })}
                      style={styles.iconHit}
                    >
                      <X size={16} color={theme.colors.textMuted} />
                    </Touchable>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.chips}>
              <Chip label={STAGE_LABEL[p.relationshipStage] ?? STAGE_LABEL[1]} tone="brand" />
            </View>
            {hasAnything ? (
              <Button label="Forget all of this" icon={Trash} variant="ghost" size="sm" onPress={confirmForget} loading={remove.isPending} style={styles.start} />
            ) : null}
          </View>
        )}
      </Card>

      <ActionSheet
        visible={factMenu !== null}
        title={factMenu !== null ? facts[factMenu] : undefined}
        options={[
          { key: 'edit', label: 'Edit', icon: Pencil, onPress: () => factMenu !== null && setEditing({ kind: 'fact', index: factMenu }) },
          {
            key: 'delete',
            label: 'Delete',
            icon: Trash2,
            destructive: true,
            onPress: () => factMenu !== null && save({ facts: facts.filter((_, i) => i !== factMenu) }, 'Deleted'),
          },
        ]}
        onClose={() => setFactMenu(null)}
      />
      <PromptDialog
        visible={!!field}
        title={field?.label ?? ''}
        placeholder={field?.placeholder}
        message="Leave it empty to delete it."
        initialValue={field && p ? (p[field.key] ?? '') : ''}
        maxLength={field?.max}
        onCancel={() => setEditing(null)}
        onSubmit={(value) => {
          setEditing(null);
          if (field) save({ [field.key]: value.trim() || null });
        }}
      />
      <PromptDialog
        visible={editing?.kind === 'fact'}
        title={factIndex === null ? 'Add a fact' : 'Edit fact'}
        placeholder="e.g. I’m training for a half marathon"
        initialValue={factIndex === null ? '' : (facts[factIndex] ?? '')}
        maxLength={200}
        onCancel={() => setEditing(null)}
        onSubmit={(value) => {
          setEditing(null);
          const fact = value.trim();
          if (!fact) return;
          save({ facts: factIndex === null ? [...facts, fact] : facts.map((f, i) => (i === factIndex ? fact : f)) });
        }}
      />
    </View>
  );
}

function toDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Wake time, quiet hours and the evening check-in (set during setup, editable here). */
export function DailyRhythmSettings({ settings, onChange }: { settings: UserSettings; onChange: (patch: Partial<UserSettings>) => void }) {
  return (
    <View style={styles.group}>
      <Text variant="micro" tone="muted" style={styles.title}>
        DAILY RHYTHM
      </Text>
      <Card>
        <View style={styles.body}>
          <DateTimeField
            mode="time"
            label="Wake-up time (morning brief)"
            value={toDate(settings.wakeTime)}
            onChange={(d) => d && onChange({ wakeTime: toHHMM(d), digestHour: d.getHours() })}
          />
          <View style={styles.pair}>
            <View style={styles.flex}>
              <DateTimeField mode="time" label="Quiet from" value={toDate(settings.quietHoursStart)} onChange={(d) => d && onChange({ quietHoursStart: toHHMM(d) })} />
            </View>
            <View style={styles.flex}>
              <DateTimeField mode="time" label="Until" value={toDate(settings.quietHoursEnd)} onChange={(d) => d && onChange({ quietHoursEnd: toHHMM(d) })} />
            </View>
          </View>
          <DateTimeField mode="time" label="Evening check-in" value={toDate(settings.checkinTime)} onChange={(d) => d && onChange({ checkinTime: toHHMM(d) })} />
        </View>
      </Card>
      <ListGroup>
        <SwitchRow
          icon={Sun}
          title="Morning brief"
          subtitle="A push at wake-up time with your day at a glance"
          value={settings.morningBrief}
          onValueChange={(morningBrief) => onChange({ morningBrief })}
        />
        <SwitchRow
          icon={MoonStar}
          title="Evening check-in"
          subtitle="“How did today go?” at check-in time"
          value={settings.eveningCheckin}
          onValueChange={(eveningCheckin) => onChange({ eveningCheckin })}
        />
      </ListGroup>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  body: {
    gap: 12,
  },
  item: {
    gap: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  start: {
    alignSelf: 'flex-start',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  iconHit: {
    padding: 6,
  },
  pair: {
    flexDirection: 'row',
    gap: 12,
  },
});

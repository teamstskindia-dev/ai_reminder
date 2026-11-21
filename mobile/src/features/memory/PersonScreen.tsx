import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { HeartHandshake, MoreVertical, Pencil, Plus, Trash2, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { usePerson, useUpdatePerson } from '@/api/hooks/memory';
import { qk } from '@/api/queryKeys';
import { deletePerson } from '@/api/resources/memory';
import type { PersonPromise } from '@/api/types';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { GroupedItem } from '@/components/ui/GroupedItem';
import { IconButton } from '@/components/ui/IconButton';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { goBack } from '@/features/navigation/goBack';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatDayLabel, formatRelative } from '@/utils/format';
import { toast } from '@/utils/toast';
import { undoable } from '@/utils/undo';

import { MemoryItemRow } from './MemoryItemRow';

type Editing = { kind: 'name' } | { kind: 'relationship' } | { kind: 'fact'; index: number | null } | null;

/** A person card (user-flow §10): relationship, last talked, promises both ways, key facts, conversations. */
export function PersonScreen({ id }: { id: string }) {
  const theme = useTheme();
  const qc = useQueryClient();
  const query = usePerson(id);
  const update = useUpdatePerson(id);
  const [menu, setMenu] = useState(false);
  const [factMenu, setFactMenu] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const p = query.data;

  const save = (body: { name?: string; relationship?: string | null; facts?: string[] }, done?: string) =>
    update.mutate(body, {
      onSuccess: () => done && toast(done),
      onError: (e) => toast(getErrorMessage(e)),
    });

  const forget = () => {
    if (!p) return;
    Alert.alert(`Forget ${p.name}?`, 'Their card, facts and spellings go. Your conversations with them stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: () => {
          goBack('/memory');
          undoable({
            message: `Forgot ${p.name}`,
            commit: async () => {
              await deletePerson(p.id);
              void qc.invalidateQueries({ queryKey: qk.memory.all });
            },
            onError: (e) => toast(getErrorMessage(e, `Couldn’t forget ${p.name}.`)),
          });
        },
      },
    ]);
  };

  const header = (
    <Stack.Screen
      options={{
        title: p?.name ?? '',
        headerRight: () => (p ? <IconButton icon={MoreVertical} accessibilityLabel="More" onPress={() => setMenu(true)} /> : null),
      }}
    />
  );

  if (query.isPending) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        {header}
        <View style={styles.content}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </View>
      </View>
    );
  }
  if (!p) {
    return (
      <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
        {header}
        <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
      </View>
    );
  }

  const facts = p.facts;
  const editingFact = editing?.kind === 'fact' ? editing.index : null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.hero}>
            <Avatar name={p.name} size={64} />
            <View style={styles.flex}>
              <Text variant="title" numberOfLines={2}>
                {p.name}
              </Text>
              <Touchable accessibilityRole="button" accessibilityLabel="Edit how you know them" onPress={() => setEditing({ kind: 'relationship' })}>
                <Text variant="callout" tone={p.relationship ? 'secondary' : 'brand'}>
                  {p.relationship ?? '+ How do you know them?'}
                </Text>
              </Touchable>
              <Text variant="caption" tone="muted">
                {[
                  p.lastTalkedAt ? `Last talked ${formatRelative(p.lastTalkedAt)}` : null,
                  `${p.conversationCount} ${p.conversationCount === 1 ? 'conversation' : 'conversations'}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
          {p.aliases.length ? (
            <View style={styles.aliases}>
              <Text variant="caption" tone="muted">
                Also heard as
              </Text>
              {p.aliases.map((a) => (
                <Chip key={a} label={a} size="sm" />
              ))}
            </View>
          ) : null}
        </Card>

        <View style={styles.section}>
          <SectionHeader title="Promises" subtitle="Open to-dos between you two" />
          <PromiseGroup title="You promised them" items={p.promises.iOwe} />
          <PromiseGroup title="They promised you" items={p.promises.theyOwe} />
          {!p.promises.iOwe.length && !p.promises.theyOwe.length ? (
            <Card muted>
              <EmptyState compact icon={HeartHandshake} title="Nothing open" message="No promises waiting either way." />
            </Card>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Key facts" actionLabel="Add" onAction={() => setEditing({ kind: 'fact', index: null })} />
          {facts.length ? (
            <Card>
              <View style={styles.facts}>
                {facts.map((f, i) => (
                  <Touchable
                    key={`${i}-${f}`}
                    accessibilityRole="button"
                    accessibilityHint="Edit or delete this fact"
                    onPress={() => setFactMenu(i)}
                    style={styles.fact}
                  >
                    <Text variant="callout" style={styles.flex}>
                      • {f}
                    </Text>
                    <Pencil size={14} color={theme.colors.textMuted} />
                  </Touchable>
                ))}
              </View>
            </Card>
          ) : (
            <Button label="Add a fact" icon={Plus} variant="secondary" size="sm" onPress={() => setEditing({ kind: 'fact', index: null })} style={styles.start} />
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Conversations" />
          {p.conversations.length ? (
            <View>
              {p.conversations.map((c, i) => (
                <GroupedItem key={c.id} index={i} count={p.conversations.length}>
                  <MemoryItemRow item={c} showDate />
                </GroupedItem>
              ))}
            </View>
          ) : (
            <Text variant="callout" tone="secondary">
              No recorded conversations with {p.name} yet.
            </Text>
          )}
        </View>
      </ScrollView>

      <ActionSheet
        visible={menu}
        title={p.name}
        options={[
          { key: 'rename', label: 'Fix the name', icon: Pencil, onPress: () => setEditing({ kind: 'name' }) },
          { key: 'relation', label: 'How you know them', icon: HeartHandshake, onPress: () => setEditing({ kind: 'relationship' }) },
          { key: 'forget', label: `Forget ${p.name}`, icon: UserX, destructive: true, onPress: forget },
        ]}
        onClose={() => setMenu(false)}
      />
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
            onPress: () => factMenu !== null && save({ facts: facts.filter((_, i) => i !== factMenu) }, 'Fact deleted'),
          },
        ]}
        onClose={() => setFactMenu(null)}
      />

      <PromptDialog
        visible={editing?.kind === 'name'}
        title="Fix the name"
        message="I’ll fix it in every conversation with them and use it next time."
        initialValue={p.name}
        maxLength={120}
        onCancel={() => setEditing(null)}
        onSubmit={(value) => {
          setEditing(null);
          const name = value.trim();
          if (name && name !== p.name) save({ name }, `Fixed everywhere: ${name}`);
        }}
      />
      <PromptDialog
        visible={editing?.kind === 'relationship'}
        title="How do you know them?"
        placeholder="e.g. manager, college friend, sister"
        initialValue={p.relationship ?? ''}
        maxLength={80}
        onCancel={() => setEditing(null)}
        onSubmit={(value) => {
          setEditing(null);
          save({ relationship: value.trim() || null });
        }}
      />
      <PromptDialog
        visible={editing?.kind === 'fact'}
        title={editingFact === null ? 'Add a fact' : 'Edit fact'}
        placeholder="e.g. Has two kids, loves cricket"
        initialValue={editingFact === null ? '' : (facts[editingFact] ?? '')}
        maxLength={200}
        onCancel={() => setEditing(null)}
        onSubmit={(value) => {
          setEditing(null);
          const fact = value.trim();
          if (!fact) return;
          const next = editingFact === null ? [...facts, fact] : facts.map((f, i) => (i === editingFact ? fact : f));
          save({ facts: next });
        }}
      />
    </View>
  );
}

function PromiseGroup({ title, items }: { title: string; items: PersonPromise[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.promises}>
      <Text variant="micro" tone="muted" style={styles.groupTitle}>
        {title.toUpperCase()}
      </Text>
      {items.map((item, i) => (
        <GroupedItem key={item.id} index={i} count={items.length}>
          <View style={styles.promise}>
            <Text variant="callout" style={styles.flex}>
              {item.title}
            </Text>
            {item.dueAt ? (
              <Text variant="caption" tone="secondary">
                {formatDayLabel(item.dueAt)}
              </Text>
            ) : null}
          </View>
        </GroupedItem>
      ))}
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
    paddingBottom: 48,
    gap: 20,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  aliases: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  section: {
    gap: 10,
  },
  promises: {
    gap: 0,
  },
  groupTitle: {
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  promise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  facts: {
    gap: 4,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  start: {
    alignSelf: 'flex-start',
  },
});

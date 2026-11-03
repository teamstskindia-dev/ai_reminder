import { Bot } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { AutoJoinMode, UserSettings } from '@/api/types';
import { Card } from '@/components/ui/Card';
import { ListRow } from '@/components/ui/ListRow';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

const AUTO_JOIN = [
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'Mine' },
  { value: 'none', label: 'Off' },
] as const;

const AUTO_JOIN_HELP: Record<AutoJoinMode, string> = {
  all: 'Joins every calendar meeting with a Google Meet link.',
  owned: 'Joins only meetings you organise.',
  none: "Doesn't join automatically. Send it from a meeting when you need it.",
};

export function NotetakerSettings({ settings, onChange }: { settings: UserSettings; onChange: (patch: Partial<UserSettings>) => void }) {
  const theme = useTheme();
  const [editingName, setEditingName] = useState(false);

  return (
    <View style={styles.group}>
      <Text variant="micro" tone="muted" style={styles.title}>
        MEETING NOTETAKER
      </Text>
      <Card padded={false}>
        <View style={styles.autoJoin}>
          <Text variant="body">Join meetings automatically</Text>
          <SegmentedControl options={AUTO_JOIN} value={settings.autoJoin} onChange={(autoJoin) => onChange({ autoJoin })} />
          <Text variant="caption" tone="secondary">
            {AUTO_JOIN_HELP[settings.autoJoin]}
          </Text>
        </View>
        <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
        <ListRow
          icon={Bot}
          title="Notetaker name"
          subtitle="Shown to other participants in the call"
          value={settings.botName || 'Default'}
          onPress={() => setEditingName(true)}
        />
      </Card>
      <PromptDialog
        visible={editingName}
        title="Notetaker name"
        message="Leave empty to use the default name."
        initialValue={settings.botName ?? ''}
        placeholder="e.g. Priya's Notetaker"
        maxLength={60}
        onCancel={() => setEditingName(false)}
        onSubmit={(value) => {
          setEditingName(false);
          onChange({ botName: value.trim() || null });
        }}
      />
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
  autoJoin: {
    padding: 16,
    gap: 10,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
});

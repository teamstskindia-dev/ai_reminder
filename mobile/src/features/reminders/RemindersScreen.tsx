import { router, useLocalSearchParams } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { FeatureGate } from '@/components/FeatureGate';
import { TabHeader } from '@/components/layout/TabHeader';
import { IconButton } from '@/components/ui/IconButton';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ActionItemsList } from '@/features/action-items/ActionItemsList';
import { openActionItemEditor } from '@/features/action-items/useActionItemMenu';
import { useTabLabel } from '@/features/navigation/tabs';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';

import { RemindersList } from './RemindersList';
import { openReminderEditor } from './useReminderMenu';

type Segment = 'reminders' | 'action-items';

function RemindersContent() {
  const theme = useTheme();
  const { isEnabled } = useConfig();
  const title = useTabLabel('reminders', 'Reminders');
  const params = useLocalSearchParams<{ segment?: string }>();
  const remindersOn = isEnabled('reminders');
  const actionItemsOn = isEnabled('actionItems');
  // The route param is the source of truth so links like /reminders?segment=action-items work while mounted.
  const picked: Segment = params.segment === 'action-items' ? 'action-items' : 'reminders';
  const setPicked = (value: Segment) => router.setParams({ segment: value });
  const segment: Segment = !remindersOn ? 'action-items' : !actionItemsOn ? 'reminders' : picked;

  const options = [
    ...(remindersOn ? [{ value: 'reminders' as const, label: 'Reminders' }] : []),
    ...(actionItemsOn ? [{ value: 'action-items' as const, label: 'Action items' }] : []),
  ];

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TabHeader
        title={title}
        right={
          <IconButton
            icon={Plus}
            variant="tonal"
            accessibilityLabel={segment === 'reminders' ? 'New reminder' : 'New action item'}
            onPress={() => (segment === 'reminders' ? openReminderEditor() : openActionItemEditor())}
          />
        }
      >
        {options.length > 1 ? <SegmentedControl options={options} value={segment} onChange={setPicked} /> : null}
      </TabHeader>
      {segment === 'reminders' ? <RemindersList /> : <ActionItemsList />}
    </View>
  );
}

export function RemindersScreen() {
  return (
    <FeatureGate feature={['reminders', 'actionItems']}>
      <RemindersContent />
    </FeatureGate>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});

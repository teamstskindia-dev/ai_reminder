import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Touchable } from './Touchable';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction, style }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View style={[styles.row, style]}>
      <View style={styles.texts}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <Touchable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={12}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1, borderRadius: theme.radii.sm }]}
        >
          <Text variant="label" tone="brand">
            {actionLabel}
          </Text>
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  action: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
});

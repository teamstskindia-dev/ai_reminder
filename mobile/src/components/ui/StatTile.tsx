import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Touchable } from './Touchable';
import { Text } from './Text';

export interface StatTileProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
  tint?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function StatTile({ label, value, icon: Icon, hint, tint, onPress, style }: StatTileProps) {
  const theme = useTheme();
  const color = tint ?? theme.colors.primaryText;
  return (
    <Touchable
      accessibilityRole={onPress ? 'button' : 'summary'}
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.tile,
        { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg },
        theme.elevation.card,
        style,
      ]}
    >
      <View style={styles.top}>
        {Icon ? <Icon size={16} color={color} strokeWidth={2.2} /> : null}
        <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      </View>
      <Text variant="title" numberOfLines={1}>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: 14,
    gap: 6,
    overflow: 'hidden',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    flex: 1,
  },
});

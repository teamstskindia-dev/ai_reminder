import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type AppTheme } from '@/theme/ThemeProvider';

import { Touchable } from './Touchable';
import { Text } from './Text';

export type ChipTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  icon?: LucideIcon;
  /** Shows a small leading dot (e.g. live status). */
  dot?: boolean;
  size?: 'sm' | 'md';
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function chipColors(theme: AppTheme, tone: ChipTone) {
  const { colors } = theme;
  switch (tone) {
    case 'brand':
      return { bg: colors.primarySoft, fg: colors.primaryText };
    case 'accent':
      return { bg: colors.accentSoft, fg: colors.accentText };
    case 'success':
      return { bg: colors.successSoft, fg: colors.success };
    case 'warning':
      return { bg: colors.warningSoft, fg: colors.warning };
    case 'danger':
      return { bg: colors.dangerSoft, fg: colors.danger };
    case 'info':
      return { bg: colors.infoSoft, fg: colors.info };
    default:
      return { bg: colors.surfaceMuted, fg: colors.textSecondary };
  }
}

export function Chip({ label, tone = 'neutral', icon: Icon, dot, size = 'sm', selected, onPress, style }: ChipProps) {
  const theme = useTheme();
  const base = chipColors(theme, tone);
  const c = selected ? { bg: theme.colors.primary, fg: theme.colors.primaryForeground } : base;
  const height = size === 'sm' ? 24 : 34;

  const content = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: c.bg,
          height,
          paddingHorizontal: size === 'sm' ? 8 : 14,
          borderRadius: theme.radii.pill,
        },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: c.fg }]} /> : null}
      {Icon ? <Icon size={size === 'sm' ? 12 : 15} color={c.fg} strokeWidth={2.4} /> : null}
      <Text variant={size === 'sm' ? 'micro' : 'label'} color={c.fg} numberOfLines={1} style={size === 'sm' ? styles.smText : null}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={{ top: 7, bottom: 7 }}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, borderRadius: theme.radii.pill, overflow: 'hidden' })}
    >
      {content}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  smText: {
    letterSpacing: 0.2,
  },
});

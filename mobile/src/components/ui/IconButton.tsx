import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { HIT_TARGET } from '@/theme/tokens';

import { Touchable } from './Touchable';
import { Text } from './Text';

export interface IconButtonProps {
  icon: LucideIcon;
  onPress?: () => void;
  accessibilityLabel: string;
  variant?: 'plain' | 'tonal' | 'filled';
  size?: number;
  color?: string;
  disabled?: boolean;
  badge?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  variant = 'plain',
  size = 22,
  color,
  disabled,
  badge,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const bg = variant === 'filled' ? colors.primary : variant === 'tonal' ? colors.surfaceMuted : 'transparent';
  const fg = color ?? (variant === 'filled' ? colors.primaryForeground : colors.text);

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      rippleBorderless
      rippleRadius={HIT_TARGET / 2}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed && variant !== 'plain' ? 0.85 : 1 },
        style,
      ]}
    >
      <Icon size={size} color={fg} strokeWidth={2} />
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.background }]}>
          <Text variant="micro" color="#FFFFFF" style={styles.badgeText}>
            {badge > 99 ? '99+' : String(badge)}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: HIT_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0,
  },
});

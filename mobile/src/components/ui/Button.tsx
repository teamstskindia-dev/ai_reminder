import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type AppTheme } from '@/theme/ThemeProvider';

import { Touchable } from './Touchable';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 54 };

function variantColors(theme: AppTheme, variant: ButtonVariant) {
  const { colors } = theme;
  switch (variant) {
    case 'primary':
      return { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary, pressed: colors.primary };
    case 'secondary':
      return { bg: colors.primarySoft, fg: colors.primaryText, border: colors.primarySoft, pressed: colors.surfacePressed };
    case 'outline':
      return { bg: 'transparent', fg: colors.text, border: colors.borderStrong, pressed: colors.surfacePressed };
    case 'ghost':
      return { bg: 'transparent', fg: colors.primaryText, border: 'transparent', pressed: colors.surfacePressed };
    case 'danger':
      return { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft, pressed: colors.dangerSoft };
  }
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();
  const c = variantColors(theme, variant);
  const inactive = disabled || loading;
  const iconSize = size === 'sm' ? 16 : 18;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? theme.spacing.md : theme.spacing.xl,
          borderRadius: theme.radii.md,
          backgroundColor: c.bg,
          borderColor: c.border,
          opacity: inactive && !loading ? 0.5 : pressed && variant === 'primary' ? 0.88 : 1,
        },
        pressed && variant !== 'primary' ? { backgroundColor: c.pressed } : null,
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} size="small" />
      ) : (
        <View style={styles.content}>
          {Icon ? <Icon size={iconSize} color={c.fg} strokeWidth={2.2} /> : null}
          <Text variant={size === 'sm' ? 'label' : 'bodyStrong'} color={c.fg} numberOfLines={1}>
            {label}
          </Text>
          {IconRight ? <IconRight size={iconSize} color={c.fg} strokeWidth={2.2} /> : null}
        </View>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
});

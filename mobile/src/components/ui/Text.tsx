import { Platform, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { TypographyVariant } from '@/theme/tokens';

export type TextTone =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'brand'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'onPrimary';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  /** Overrides the tone with an explicit colour. */
  color?: string;
  align?: 'left' | 'center' | 'right';
  weight?: '400' | '500' | '600' | '700';
}

/** Android adds extra top/bottom font padding that misaligns text with icons; iOS has no such padding. */
const PLATFORM_TEXT: TextStyle | null = Platform.OS === 'android' ? { includeFontPadding: false } : null;

export function Text({ variant = 'body', tone = 'default', color, align, weight, style, ...rest }: TextProps) {
  const { colors, typography } = useTheme();
  const toneColor: Record<TextTone, string> = {
    default: colors.text,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    brand: colors.primaryText,
    accent: colors.accentText,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    onPrimary: colors.primaryForeground,
  };
  return (
    <RNText
      {...rest}
      style={[
        typography[variant],
        PLATFORM_TEXT,
        { color: color ?? toneColor[tone] },
        align ? { textAlign: align } : null,
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    />
  );
}

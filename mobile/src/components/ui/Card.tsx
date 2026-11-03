import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Touchable } from './Touchable';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  padded?: boolean;
  muted?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Card({ children, onPress, onLongPress, padded = true, muted = false, style, accessibilityLabel }: CardProps) {
  const theme = useTheme();
  const base: ViewStyle = {
    backgroundColor: muted ? theme.colors.surfaceMuted : theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: padded ? theme.spacing.lg : 0,
    overflow: 'hidden',
  };
  const elevation = muted ? null : theme.elevation.card;

  if (!onPress && !onLongPress) {
    return <View style={[base, elevation, style]}>{children}</View>;
  }
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [base, elevation, pressed ? { backgroundColor: theme.colors.surfacePressed } : null, style]}
    >
      {children}
    </Touchable>
  );
}

import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface ProgressBarProps {
  /** 0..1 */
  value: number;
  color?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({ value, color, height = 6, style }: ProgressBarProps) {
  const theme = useTheme();
  const pct = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={[{ height, borderRadius: height / 2, backgroundColor: theme.colors.surfaceMuted, overflow: 'hidden' }, style]}
    >
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height / 2, backgroundColor: color ?? theme.colors.primary }} />
    </View>
  );
}

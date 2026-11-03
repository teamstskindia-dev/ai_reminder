import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme, type AppTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export function scoreColor(theme: AppTheme, score: number | null | undefined): string {
  if (score === null || score === undefined) return theme.colors.textMuted;
  if (score >= 75) return theme.colors.success;
  if (score >= 50) return theme.colors.primaryText;
  if (score >= 30) return theme.colors.warning;
  return theme.colors.danger;
}

export interface ScoreRingProps {
  score: number | null | undefined;
  size?: number;
  strokeWidth?: number;
  label?: string;
  color?: string;
}

/** Circular 0..100 score indicator. Null scores render an empty ring with a dash. */
export function ScoreRing({ score, size = 44, strokeWidth, label, color }: ScoreRingProps) {
  const theme = useTheme();
  const stroke = strokeWidth ?? Math.max(3, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = score === null || score === undefined ? null : Math.min(100, Math.max(0, Math.round(score)));
  const tint = color ?? scoreColor(theme, value);
  const offset = value === null ? circumference : circumference * (1 - value / 100);
  const big = size >= 64;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`${label ?? 'Score'}: ${value === null ? 'not available' : `${value} out of 100`}`}
      style={[styles.wrap, { width: size, height: size }]}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.colors.surfaceMuted} strokeWidth={stroke} fill="none" />
        {value !== null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={tint}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text variant={big ? 'title' : 'label'} color={value === null ? theme.colors.textMuted : theme.colors.text} style={!big ? styles.small : null}>
          {value === null ? '–' : String(value)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
});

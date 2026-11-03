import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/** One shared pulse value per skeleton block keeps the animation on the native driver. */
function usePulse() {
  const [opacity] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return opacity;
}

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 14, radius, style }: SkeletonProps) {
  const theme = useTheme();
  const opacity = usePulse();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius ?? theme.radii.sm, backgroundColor: theme.colors.skeleton, opacity },
        style,
      ]}
    />
  );
}

/** A card-shaped placeholder with a title and a few lines. */
export function SkeletonCard({ lines = 2, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel="Loading"
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.lg },
        theme.elevation.card,
        style,
      ]}
    >
      <Skeleton width="55%" height={16} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '40%' : '85%'} height={12} />
      ))}
    </View>
  );
}

export function SkeletonList({ count = 4, lines = 2 }: { count?: number; lines?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  list: {
    gap: 12,
  },
});

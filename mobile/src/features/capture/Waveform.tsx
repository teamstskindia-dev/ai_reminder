import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

const BARS = 40;
const HEIGHT = 56;

/** Live input level bars, mirrored around the centre line (newest on the right). Calm and muted while paused. */
export function Waveform({ levels, active }: { levels: number[]; active: boolean }) {
  const theme = useTheme();
  const recent = levels.slice(-BARS);
  const padded = [...Array<number>(Math.max(0, BARS - recent.length)).fill(0), ...recent];
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {padded.map((level, i) => {
        const h = active ? Math.max(6, Math.round(level * HEIGHT)) : 6;
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: h,
                backgroundColor: active ? theme.colors.primary : theme.colors.borderStrong,
                // Older bars fade out to the left.
                opacity: active ? 0.25 + 0.75 * (i / (BARS - 1)) : 0.6,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
});

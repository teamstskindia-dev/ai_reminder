import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/**
 * Renders one row of a visually grouped list inside a virtualized list (rounded first/last corners,
 * hairline separators), so long lists keep virtualization while looking like a single card.
 */
export function GroupedItem({ index, count, children }: { index: number; count: number; children: ReactNode }) {
  const theme = useTheme();
  const first = index === 0;
  const last = index === count - 1;
  const r = theme.radii.lg;
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderTopLeftRadius: first ? r : 0,
        borderTopRightRadius: first ? r : 0,
        borderBottomLeftRadius: last ? r : 0,
        borderBottomRightRadius: last ? r : 0,
        overflow: 'hidden',
      }}
    >
      {!first ? <View style={[styles.separator, { backgroundColor: theme.colors.border, marginLeft: theme.spacing.lg }]} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});

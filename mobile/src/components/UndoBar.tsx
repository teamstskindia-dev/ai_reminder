import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useTheme } from '@/theme/ThemeProvider';
import { undoPending, useUndoState } from '@/utils/undo';

/** The short-lived "Deleted · Undo" bar above the tabs (see utils/undo). */
export function UndoBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const state = useUndoState();
  if (!state) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 16) + 76 }]}>
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.bar, { backgroundColor: theme.colors.text, borderRadius: theme.radii.lg }, theme.elevation.raised]}
      >
        <Text variant="callout" color={theme.colors.background} style={styles.flex} numberOfLines={2}>
          {state.message}
        </Text>
        <Touchable accessibilityRole="button" accessibilityLabel="Undo" onPress={undoPending} style={styles.action}>
          <Text variant="label" color={theme.colors.primarySoft}>
            UNDO
          </Text>
        </Touchable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
  },
  flex: {
    flex: 1,
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
});

import { onlineManager } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react-native';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

const subscribe = (onChange: () => void) => onlineManager.subscribe(() => onChange());
const getSnapshot = () => onlineManager.isOnline();

/** A small, non-interactive pill shown while the device is offline (queries are paused meanwhile). */
export function OfflineBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const online = useSyncExternalStore(subscribe, getSnapshot);
  if (online) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.pill, { backgroundColor: theme.colors.text, borderRadius: theme.radii.pill }, theme.elevation.raised]}
      >
        <WifiOff size={14} color={theme.colors.background} />
        <Text variant="label" color={theme.colors.background}>
          You&apos;re offline — showing saved data
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});

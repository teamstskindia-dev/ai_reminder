import { router } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { StyleSheet } from 'react-native';

import { Touchable } from '@/components/ui/Touchable';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

/** The always-there record button (user-flow §04: recording is one tap away from anywhere in the tabs). */
export function RecordFab({ bottom }: { bottom: number }) {
  const theme = useTheme();
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel="Record a conversation"
      accessibilityHint="Starts recording right away"
      onPress={() => {
        haptics.light();
        router.push('/capture/record');
      }}
      style={[styles.fab, { bottom, backgroundColor: theme.colors.primary }, theme.elevation.card]}
    >
      <Mic size={26} color={theme.colors.primaryForeground} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';
import { Touchable } from './Touchable';

export interface SwipeAction {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  onPress: () => void;
}

function ActionButtons({ actions, methods }: { actions: SwipeAction[]; methods: SwipeableMethods }) {
  return (
    <View style={styles.actions}>
      {actions.map(({ key, label, icon: Icon, color, onPress }) => (
        <Touchable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={label}
          rippleColor="rgba(255,255,255,0.25)"
          onPress={() => {
            methods.close();
            onPress();
          }}
          style={[styles.action, { backgroundColor: color }]}
        >
          <Icon size={20} color="#FFFFFF" />
          <Text variant="micro" color="#FFFFFF" numberOfLines={1}>
            {label}
          </Text>
        </Touchable>
      ))}
    </View>
  );
}

/**
 * Swipe actions on both platforms (gesture-handler). Every action stays reachable without swiping via
 * the row's long-press / overflow menu, which screen readers also expose.
 */
export function SwipeRow({ children, left = [], right = [] }: { children: ReactNode; left?: SwipeAction[]; right?: SwipeAction[] }) {
  const theme = useTheme();
  return (
    <ReanimatedSwipeable
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={left.length ? (_p, _t, methods) => <ActionButtons actions={left} methods={methods} /> : undefined}
      renderRightActions={right.length ? (_p, _t, methods) => <ActionButtons actions={right} methods={methods} /> : undefined}
    >
      {/* Opaque so the action panel never shows through the resting row. */}
      <View style={{ backgroundColor: theme.colors.surface }}>{children}</View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
  },
  action: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
});

import { Check } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { HIT_TARGET } from '@/theme/tokens';
import { Touchable } from './Touchable';

export interface CheckboxProps {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  size?: number;
}

/** Round check used for action items. The touch target is 48dp even though the circle is smaller. */
export function Checkbox({ checked, onToggle, accessibilityLabel, disabled, size = 24 }: CheckboxProps) {
  const theme = useTheme();
  return (
    <Touchable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      onPress={onToggle}
      disabled={disabled}
      rippleBorderless
      rippleRadius={HIT_TARGET / 2}
      style={styles.target}
    >
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: checked ? theme.colors.success : theme.colors.borderStrong,
            backgroundColor: checked ? theme.colors.success : 'transparent',
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        {checked ? <Check size={size * 0.62} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  target: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -12,
    marginRight: -4,
  },
  circle: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

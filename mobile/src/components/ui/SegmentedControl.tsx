import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Touchable } from './Touchable';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({ options, value, onChange, style }: SegmentedControlProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.track,
        { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.md + 2 },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Touchable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              { borderRadius: theme.radii.md },
              selected ? [{ backgroundColor: theme.colors.surface }, theme.elevation.card] : null,
            ]}
          >
            <Text
              variant="label"
              tone={selected ? 'default' : 'secondary'}
              numberOfLines={1}
              style={selected ? styles.selectedText : null}
            >
              {option.label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    overflow: 'hidden',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  selectedText: {
    fontWeight: '700',
  },
});

import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: LucideIcon;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({ label, hint, error, icon: Icon, containerStyle, multiline, onFocus, onBlur, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.colors.danger : focused ? theme.colors.primary : theme.colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" tone="secondary">
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          {
            borderColor,
            borderWidth: focused || error ? 1.5 : 1,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.md,
            minHeight: multiline ? 96 : 48,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        {Icon ? <Icon size={18} color={theme.colors.textMuted} style={multiline ? styles.iconTop : null} /> : null}
        <TextInput
          {...rest}
          multiline={multiline}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.colors.primary}
          cursorColor={theme.colors.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            theme.typography.body,
            { color: theme.colors.text },
            multiline ? styles.multiline : null,
          ]}
        />
      </View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  field: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    includeFontPadding: false,
  },
  multiline: {
    textAlignVertical: 'top',
    minHeight: 80,
  },
  iconTop: {
    marginTop: 13,
  },
});

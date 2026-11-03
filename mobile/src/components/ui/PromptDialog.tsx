import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { KeyboardAvoider } from '@/components/layout/KeyboardAvoider';
import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Text } from './Text';
import { TextField } from './TextField';

export interface PromptDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  initialValue: string;
  placeholder?: string;
  maxLength?: number;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}

function PromptBody({ title, message, initialValue, placeholder, maxLength, confirmLabel = 'Save', onCancel, onSubmit }: Omit<PromptDialogProps, 'visible'>) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  return (
    <View style={[styles.dialog, { backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl }, theme.elevation.raised]}>
      <Text variant="heading">{title}</Text>
      {message ? (
        <Text variant="callout" tone="secondary">
          {message}
        </Text>
      ) : null}
      <TextField value={value} onChangeText={setValue} placeholder={placeholder} maxLength={maxLength} autoFocus accessibilityLabel={title} />
      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
        <Button label={confirmLabel} onPress={() => onSubmit(value)} />
      </View>
    </View>
  );
}

/** Cross-platform single-field text prompt (Alert.prompt is iOS-only). */
export function PromptDialog({ visible, ...props }: PromptDialogProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={props.onCancel}>
      <KeyboardAvoider>
        <Pressable accessibilityLabel="Close" style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={props.onCancel}>
          <Pressable onPress={() => undefined} style={styles.center}>
            {visible ? <PromptBody {...props} /> : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  center: {
    width: '100%',
  },
  dialog: {
    padding: 20,
    gap: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
});

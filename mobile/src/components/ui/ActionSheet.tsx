import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { ActionSheetIOS, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';
import { Touchable } from './Touchable';

export interface ActionSheetOption {
  key: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  onPress: () => void;
}

export interface ActionSheetProps {
  visible: boolean;
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  onClose: () => void;
}

/** iOS: the native action sheet (ActionSheetIOS). */
function IosActionSheet({ visible, title, message, options, onClose }: ActionSheetProps) {
  const theme = useTheme();
  const latest = useRef({ title, message, options, onClose, tint: theme.colors.primaryText, dark: theme.isDark });

  useEffect(() => {
    latest.current = { title, message, options, onClose, tint: theme.colors.primaryText, dark: theme.isDark };
  });

  useEffect(() => {
    if (!visible) return;
    const current = latest.current;
    const labels = [...current.options.map((o) => o.label), 'Cancel'];
    const destructive = current.options.flatMap((o, i) => (o.destructive ? [i] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: current.title,
        message: current.message,
        options: labels,
        cancelButtonIndex: labels.length - 1,
        destructiveButtonIndex: destructive.length ? destructive : undefined,
        tintColor: current.tint,
        userInterfaceStyle: current.dark ? 'dark' : 'light',
      },
      (index) => {
        const { options: opts, onClose: close } = latest.current;
        close();
        if (index >= 0 && index < opts.length) opts[index].onPress();
      },
    );
  }, [visible]);

  return null;
}

/** Android (and fallback): a bottom-sheet menu; the hardware back button closes it. */
function BottomSheet({ visible, title, message, options, onClose }: ActionSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close menu" style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={onClose}>
        <Pressable
          onPress={() => undefined}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radii.xl,
              borderTopRightRadius: theme.radii.xl,
              paddingBottom: Math.max(insets.bottom, 12) + 8,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderStrong }]} />
          {title || message ? (
            <View style={styles.header}>
              {title ? (
                <Text variant="subheading" numberOfLines={2}>
                  {title}
                </Text>
              ) : null}
              {message ? (
                <Text variant="caption" tone="secondary">
                  {message}
                </Text>
              ) : null}
            </View>
          ) : null}
          {options.map(({ key, label, icon: Icon, destructive, onPress }) => (
            <Touchable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => {
                onClose();
                onPress();
              }}
              pressedStyle={{ backgroundColor: theme.colors.surfacePressed }}
              style={styles.option}
            >
              {Icon ? <Icon size={20} color={destructive ? theme.colors.danger : theme.colors.textSecondary} /> : null}
              <Text variant="body" tone={destructive ? 'danger' : 'default'}>
                {label}
              </Text>
            </Touchable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Long-press / overflow menus: ActionSheetIOS on iOS, a bottom sheet on Android. */
export function ActionSheet(props: ActionSheetProps) {
  return Platform.OS === 'ios' ? <IosActionSheet {...props} /> : <BottomSheet {...props} />;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingTop: 8,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 2,
  },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
  },
});

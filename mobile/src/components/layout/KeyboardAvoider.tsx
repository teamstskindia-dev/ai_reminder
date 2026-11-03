import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * KeyboardAvoidingView that measures its own window position, so the offset is right under native
 * headers, iOS sheet modals and tab screens alike.
 *
 * `padding` on both platforms: on iOS it is the recommended mode; on Android (edge-to-edge since SDK 54)
 * the window no longer resizes for the IME, while RN still reports the keyboard height — padding by the
 * measured overlap keeps inputs visible, and adds nothing on devices where the window does resize.
 */
export function KeyboardAvoider({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [offset, setOffset] = useState(0);

  return (
    <View
      ref={ref}
      collapsable={false}
      style={[styles.flex, style]}
      onLayout={() => ref.current?.measureInWindow((_x, y) => setOffset(Math.max(0, Math.round(y))))}
    >
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={offset}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});

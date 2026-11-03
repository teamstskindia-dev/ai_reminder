import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';

import { KeyboardAvoider } from './KeyboardAvoider';

/** Scrollable form body with a footer pinned above the keyboard / navigation bar. */
export function FormScreen({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoider style={{ backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, 12) + 4,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        {footer}
      </View>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  body: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 16,
    gap: 18,
  },
  footer: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});

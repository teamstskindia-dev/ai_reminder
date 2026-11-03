import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';

export interface TabHeaderProps {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  /** Content under the title row (search field, segmented control…). */
  children?: ReactNode;
}

/** Large-title header for tab screens; handles the top safe area. */
export function TabHeader({ title, subtitle, right, children }: TabHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + theme.spacing.sm, backgroundColor: theme.colors.background }]}>
      <View style={styles.row}>
        <View style={styles.titles}>
          {subtitle ? (
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <Text variant="display" accessibilityRole="header" numberOfLines={1}>
            {title}
          </Text>
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {children ? <View style={styles.children}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  titles: {
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -8,
  },
  children: {
    marginTop: 8,
    gap: 10,
  },
});

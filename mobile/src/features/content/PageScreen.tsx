import { router, Stack, useLocalSearchParams } from 'expo-router';
import { FileSearch } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiError } from '@/api/errors';
import { useCmsPage } from '@/api/hooks/content';
import { Markdown } from '@/components/markdown/Markdown';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/StateViews';
import { Text } from '@/components/ui/Text';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import { formatDayLabel } from '@/utils/format';
import { openLink } from '@/utils/links';

/** Renders an admin-managed CMS page (about, privacy, terms, …) from GET /public/pages/:slug. */
export function PageScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { isEnabled } = useConfig();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const page = useCmsPage(typeof slug === 'string' ? slug : '');

  const body = () => {
    if (page.isPending) {
      return (
        <View style={styles.skeleton}>
          <Skeleton width="70%" height={26} />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width={i % 2 ? '85%' : '100%'} height={14} />
          ))}
        </View>
      );
    }
    if (!page.data) {
      if (isApiError(page.error) && page.error.status === 404) {
        return (
          <EmptyState
            icon={FileSearch}
            title="Page not found"
            message="This page isn't published yet."
            action={{ label: 'Go back', onPress: () => router.back() }}
          />
        );
      }
      return <ErrorState error={page.error} onRetry={() => void page.refetch()} retrying={page.isFetching} />;
    }
    return (
      <View style={styles.article}>
        <Text variant="display">{page.data.title}</Text>
        <Text variant="caption" tone="muted">
          Updated {formatDayLabel(page.data.updatedAt)}
        </Text>
        <Markdown onLinkPress={(href) => void openLink(href, isEnabled)}>{page.data.content}</Markdown>
      </View>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}>
      <Stack.Screen options={{ title: '' }} />
      {body()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 48,
    flexGrow: 1,
  },
  article: {
    gap: 12,
  },
  skeleton: {
    gap: 12,
  },
});

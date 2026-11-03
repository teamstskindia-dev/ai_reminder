import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

/**
 * Pull-to-refresh that only spins for user-initiated refreshes (not background refetches).
 * Returns a themed <RefreshControl> element for ScrollView/FlatList `refreshControl`.
 */
export function useRefreshControl(refetch: () => Promise<unknown>) {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      colors={[theme.colors.primary]}
      tintColor={theme.colors.primary}
      progressBackgroundColor={theme.colors.surface}
    />
  );
}

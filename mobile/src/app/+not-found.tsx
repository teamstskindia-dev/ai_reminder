import { router } from 'expo-router';
import { Compass } from 'lucide-react-native';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui/StateViews';
import { useTheme } from '@/theme/ThemeProvider';

export default function NotFound() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        message="The link may be outdated or meant for the website."
        action={{ label: 'Go home', onPress: () => router.replace('/') }}
      />
    </View>
  );
}

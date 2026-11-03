import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { FeatureKey } from '@/api/types';
import { EmptyState } from '@/components/ui/StateViews';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';

export interface FeatureGateProps {
  /** Renders children when the feature (or any of the features) is enabled. */
  feature: FeatureKey | FeatureKey[];
  children: ReactNode;
}

/** Guards screens reachable by deep link when an admin turns the feature off. */
export function FeatureGate({ feature, children }: FeatureGateProps) {
  const { isEnabled } = useConfig();
  const theme = useTheme();
  const enabled = Array.isArray(feature) ? feature.some(isEnabled) : isEnabled(feature);
  if (enabled) return children;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <EmptyState
        icon={Lock}
        title="Not available right now"
        message="This part of the app has been turned off. Check back later."
        action={{ label: 'Go home', onPress: () => router.replace('/home') }}
      />
    </View>
  );
}

import type { ErrorBoundaryProps } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { ErrorFallback } from '@/components/ErrorFallback';
import { Icon } from '@/components/Icon';
import { TAB_ROUTES, useVisibleTabs } from '@/features/navigation/tabs';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Bottom tabs are fully driven by `config.navigation.mobile_tab`: order, labels and icons come from
 * the admin panel. Tabs missing from the config stay routable but are hidden (`href: null`).
 */
export default function TabsLayout() {
  const theme = useTheme();
  const visible = useVisibleTabs();
  const visibleRoutes = new Set(visible.map((t) => t.route));
  const hidden = TAB_ROUTES.filter((route) => !visibleRoutes.has(route));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.colors.primaryText,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {visible.map(({ route, item }) => (
        <Tabs.Screen
          key={route}
          name={route}
          options={{
            title: item.label,
            tabBarAccessibilityLabel: item.label,
            tabBarIcon: ({ color, focused }) => (
              <Icon name={item.icon} color={color} size={24} strokeWidth={focused ? 2.4 : 2} />
            ),
          }}
        />
      ))}
      {hidden.map((route) => (
        <Tabs.Screen key={route} name={route} options={{ href: null }} />
      ))}
    </Tabs>
  );
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorFallback {...props} scope="tabs" />;
}

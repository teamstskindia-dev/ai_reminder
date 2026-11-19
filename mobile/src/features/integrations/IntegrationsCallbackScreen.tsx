import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { qk } from '@/api/queryKeys';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/utils/toast';

import { connectErrorMessage, providerName } from './connect';

WebBrowser.maybeCompleteAuthSession();

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Deep-link target `remi://integrations/callback?provider=…&status=connected|error=…`. Usually the auth
 * session result handles it; on Android the redirect can also arrive here. Nothing secret is in the URL.
 */
export function IntegrationsCallbackScreen() {
  const theme = useTheme();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ provider?: string; status?: string; error?: string }>();
  const provider = one(params.provider) ?? 'app';
  const status = one(params.status);
  const error = one(params.error);

  useEffect(() => {
    void qc.invalidateQueries({ queryKey: qk.integrations });
    void qc.invalidateQueries({ queryKey: qk.today });
    if (status === 'connected') toast(`${providerName(provider)} connected`);
    else if (error) toast(connectErrorMessage(provider, error));
    if (router.canGoBack()) router.back();
    else router.replace('/connected-apps');
  }, [qc, provider, status, error]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

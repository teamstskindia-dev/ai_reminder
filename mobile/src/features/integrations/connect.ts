import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';

import { getErrorMessage } from '@/api/errors';
import { qk } from '@/api/queryKeys';
import { fetchConnectUrl } from '@/api/resources/integrations';
import type { ConnectedProvider } from '@/api/types';
import { reportError } from '@/utils/logger';
import { toast } from '@/utils/toast';

export const PROVIDER_NAME: Record<string, string> = {
  google_calendar: 'Google Calendar',
  gmail: 'Gmail',
  outlook: 'Outlook',
  notion: 'Notion',
  jira: 'Jira',
  linear: 'Linear',
  todoist: 'Todoist',
  asana: 'Asana',
  app: 'your to-dos',
};

export function providerName(provider: string): string {
  return PROVIDER_NAME[provider.toLowerCase()] ?? provider;
}

/** Deep link the API redirects to after consent (remi://integrations/callback, or exp://… in Expo Go). */
export function getIntegrationsRedirectUri(): string {
  return Linking.createURL('integrations/callback');
}

export type ConnectResult = { type: 'connected' } | { type: 'error'; error: string } | { type: 'cancelled' };

export function parseConnectResult(url: string): ConnectResult {
  try {
    const { queryParams } = Linking.parse(url);
    const read = (key: string) => {
      const v = queryParams?.[key];
      const first = Array.isArray(v) ? v[0] : v;
      return typeof first === 'string' ? first : null;
    };
    if (read('status') === 'connected') return { type: 'connected' };
    return { type: 'error', error: read('error') ?? 'connect_failed' };
  } catch {
    return { type: 'error', error: 'connect_failed' };
  }
}

export function connectErrorMessage(provider: string, error: string): string {
  return error === 'access_denied'
    ? `${providerName(provider)} wasn't connected: access was not allowed.`
    : `Couldn't connect ${providerName(provider)}. Please try again.`;
}

/**
 * Opens the provider's consent screen in an auth session (ASWebAuthenticationSession / Custom Tabs). The API
 * finishes the OAuth exchange itself and redirects back with `?status=connected` or `?error=`; no secrets
 * ever reach the phone.
 */
export async function openConnect(provider: ConnectedProvider, mode: 'read' | 'send' = 'send'): Promise<ConnectResult> {
  const redirectUri = getIntegrationsRedirectUri();
  const { url } = await fetchConnectUrl(provider, redirectUri, mode);
  const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
  if (result.type === 'success') return parseConnectResult(result.url);
  return { type: 'cancelled' };
}

/** Connect / reconnect flow with toasts; refreshes the connected apps afterwards. */
export function useConnectApp() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<ConnectedProvider | null>(null);

  const connect = async (provider: ConnectedProvider, mode: 'read' | 'send' = 'send'): Promise<boolean> => {
    setPending(provider);
    try {
      const res = await openConnect(provider, mode);
      // Android may report "dismiss" while the redirect still arrives through the router: refresh either way.
      void qc.invalidateQueries({ queryKey: qk.integrations });
      if (res.type === 'connected') {
        toast(`${providerName(provider)} connected`);
        void qc.invalidateQueries({ queryKey: qk.today });
        void qc.invalidateQueries({ queryKey: qk.emails.all });
        return true;
      }
      if (res.type === 'error') toast(connectErrorMessage(provider, res.error));
      return false;
    } catch (error) {
      reportError(error, { source: 'connect-app', provider });
      toast(getErrorMessage(error, `Couldn't connect ${providerName(provider)}.`));
      return false;
    } finally {
      setPending(null);
    }
  };

  return { connect, pending };
}

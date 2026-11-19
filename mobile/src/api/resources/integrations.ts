import { api } from '../client';
import type { ConnectedProvider, Integration, IntegrationTarget, ToolProvider } from '../types';

export function listIntegrations(): Promise<Integration[]> {
  return api<Integration[]>('/integrations');
}

export function syncGoogleCalendar(): Promise<{ queued: true }> {
  return api<{ queued: true }>('/integrations/google-calendar/sync', { method: 'POST' });
}

export function disconnectGoogleCalendar(): Promise<void> {
  return api<void>('/integrations/google-calendar', { method: 'DELETE' });
}

/** Consent URL for Gmail, Outlook, Notion, Jira, Linear or Todoist (the provider redirects back to `redirectUri`). */
export function fetchConnectUrl(provider: ConnectedProvider, redirectUri: string, mode: 'read' | 'send' = 'send'): Promise<{ url: string }> {
  return api<{ url: string }>(`/integrations/${provider}/connect`, { query: { redirectUri, mode } });
}

export function updateIntegration(
  provider: ConnectedProvider,
  patch: { targetId?: string | null; targetName?: string | null; autoSend?: boolean },
): Promise<Integration> {
  return api<Integration>(`/integrations/${provider}`, { method: 'PATCH', body: patch });
}

export function disconnectIntegration(provider: ConnectedProvider): Promise<void> {
  return api<void>(`/integrations/${provider}`, { method: 'DELETE' });
}

export function fetchToolTargets(provider: ToolProvider): Promise<IntegrationTarget[]> {
  return api<IntegrationTarget[]>(`/tools/${provider}/targets`, { timeoutMs: 30_000 });
}

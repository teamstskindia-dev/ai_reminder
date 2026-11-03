import { api } from '../client';
import type {
  Integration,
} from '../types';

export function listIntegrations(): Promise<Integration[]> {
  return api<Integration[]>('/integrations');
}

export function syncGoogleCalendar(): Promise<{ queued: true }> {
  return api<{ queued: true }>('/integrations/google-calendar/sync', { method: 'POST' });
}

export function disconnectGoogleCalendar(): Promise<void> {
  return api<void>('/integrations/google-calendar', { method: 'DELETE' });
}

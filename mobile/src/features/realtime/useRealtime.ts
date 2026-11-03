import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { io } from 'socket.io-client';

import { patchEntity } from '@/api/cache';
import { refreshSession } from '@/api/client';
import { isLiveStatus } from '@/api/hooks/meetings';
import { qk } from '@/api/queryKeys';
import { getAccessToken } from '@/api/tokens';
import type { MeetingUpdatedEvent } from '@/api/types';
import { API_ORIGIN } from '@/utils/env';
import { logger } from '@/utils/logger';

/**
 * Optional live updates over Socket.IO (`/realtime`). Polling remains the fallback, so failures
 * here are silent. Connected only while signed in and the app is in the foreground.
 */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const socket = io(`${API_ORIGIN}/realtime`, {
      transports: ['websocket'],
      autoConnect: false,
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 30_000,
      // Re-read the token on every (re)connect so rotated tokens are picked up.
      auth: (cb) => {
        getAccessToken().then((token) => cb({ token: token ?? '' }));
      },
    });

    socket.on('notification:new', () => {
      void qc.invalidateQueries({ queryKey: qk.notifications.all });
    });
    socket.on('reminder:fired', () => {
      void qc.invalidateQueries({ queryKey: qk.reminders.all });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    });
    socket.on('meeting:updated', (event: MeetingUpdatedEvent) => {
      void patchEntity(qc, [qk.meetings.all, qk.dashboard], event.id, {
        status: event.status,
        failureReason: event.failureReason,
      });
      if (!isLiveStatus(event.status)) {
        void qc.invalidateQueries({ queryKey: qk.meetings.detail(event.id) });
        void qc.invalidateQueries({ queryKey: qk.dashboard });
      }
    });
    socket.on('connect_error', (error) => {
      logger.debug('Realtime connect error', { reason: error.message });
      if (/expired|unauthor/i.test(error.message)) void refreshSession().catch(() => null);
    });

    socket.connect();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !socket.connected) socket.connect();
      if (state === 'background') socket.disconnect();
    });

    return () => {
      sub.remove();
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [enabled, qc]);
}

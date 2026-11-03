import { Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { AppConfig } from '../../config/app-config';
import { callExternal } from '../external/external-call';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  sent: number;
  failed: number;
  invalidTokens: string[];
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly expo: Expo;

  constructor(config: AppConfig) {
    this.expo = new Expo({ accessToken: config.expoAccessToken });
  }

  /** Sends to Expo push tokens; returns tokens Expo reports as DeviceNotRegistered (to prune). */
  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    const invalidTokens: string[] = [];
    const valid = tokens.filter((t) => {
      const ok = Expo.isExpoPushToken(t);
      if (!ok) invalidTokens.push(t);
      return ok;
    });
    const messages: ExpoPushMessage[] = valid.map((to) => ({
      to,
      title: payload.title.slice(0, 200),
      body: payload.body.slice(0, 1000),
      data: payload.data,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    }));
    let sent = 0;
    let failed = 0;
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      // Expo dedupes nothing: only retry on network/5xx before any ticket was returned.
      const tickets = await callExternal(
        { provider: 'expo', operation: 'push.send', retries: 2, timeoutMs: 15_000 },
        () => this.expo.sendPushNotificationsAsync(chunk),
      );
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') {
          sent++;
          return;
        }
        failed++;
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const to = chunk[i]?.to;
          if (typeof to === 'string') invalidTokens.push(to);
        } else {
          this.logger.warn({ provider: 'expo', errorType: ticket.details?.error ?? 'unknown' }, 'push ticket error');
        }
      });
    }
    return { sent, failed, invalidTokens };
  }
}

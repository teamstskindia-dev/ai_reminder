import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Credentials } from 'google-auth-library';
import { AppConfig } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { decryptString, encryptString } from '../../common/utils/crypto.util';
import { callExternal, errorStatus } from '../../infra/external/external-call';
import { canWriteCalendar, GoogleOAuthService, isInvalidGrant } from '../../infra/google/google-oauth.service';
import { QUEUE } from '../../infra/queue/queue.constants';
import { GoogleAccountsRepository } from '../users/users.repository';
import { CalendarConnectionService } from './calendar-connection.service';
import { enqueueUserSync } from './sync-producer';

export type CalendarWriteState = 'ok' | 'not_connected' | 'needs_reconnect';

export interface NewEvent {
  title: string;
  startAt: Date;
  endAt: Date;
  attendees: { email: string; name?: string | null }[];
  description?: string | null;
  timezone: string;
}

/**
 * Creates events in the user's Google Calendar ("Set a call with Rahul Friday afternoon", user-flow §06).
 * Only ever called after the user approved the preview. Google sends the invites (sendUpdates=all).
 */
@Injectable()
export class CalendarWriteService {
  private readonly logger = new Logger(CalendarWriteService.name);

  constructor(
    private readonly accounts: GoogleAccountsRepository,
    private readonly google: GoogleOAuthService,
    private readonly connection: CalendarConnectionService,
    private readonly config: AppConfig,
    @InjectQueue(QUEUE.CALENDAR_SYNC) private readonly syncQueue: Queue,
  ) {}

  /** Whether the user can schedule: calendar connected with the read-write scope. */
  async state(userId: string): Promise<CalendarWriteState> {
    const account = await this.accounts.find(userId);
    if (!account?.calendarConnected || !account.refreshTokenEnc) return 'not_connected';
    return canWriteCalendar(account.scope) ? 'ok' : 'needs_reconnect';
  }

  async createEvent(userId: string, event: NewEvent): Promise<{ eventId: string; htmlLink: string | null }> {
    const account = await this.accounts.find(userId);
    if (!account?.calendarConnected || !account.refreshTokenEnc) {
      throw AppException.conflict('Connect Google Calendar in Profile to schedule meetings');
    }
    if (!canWriteCalendar(account.scope)) {
      throw AppException.conflict('Reconnect Google Calendar in Profile and allow Remi to add events');
    }
    const key = this.config.encryptionKey;
    const cal = this.google.calendarClient(
      {
        accessToken: account.accessTokenEnc ? decryptString(account.accessTokenEnc, key) : null,
        refreshToken: decryptString(account.refreshTokenEnc, key),
        expiryDate: account.tokenExpiresAt?.getTime() ?? null,
      },
      (tokens: Credentials) => void this.persistTokens(userId, tokens),
    );
    try {
      const res = await callExternal(
        {
          provider: 'google',
          operation: 'calendar.events.insert',
          retries: 1,
          timeoutMs: 20_000,
          passThrough: (err) => isInvalidGrant(err) || [400, 401, 403].includes(errorStatus(err) ?? 0),
        },
        (signal) =>
          cal.events.insert(
            {
              calendarId: 'primary',
              sendUpdates: 'all',
              requestBody: {
                summary: event.title,
                description: event.description ?? undefined,
                start: { dateTime: event.startAt.toISOString(), timeZone: event.timezone },
                end: { dateTime: event.endAt.toISOString(), timeZone: event.timezone },
                attendees: event.attendees.map((a) => ({ email: a.email, displayName: a.name ?? undefined })),
              },
            },
            { signal },
          ),
      );
      // Pull the new event into Remi (pre-meeting brief, record prompt).
      await enqueueUserSync(this.syncQueue, userId, 'event_created').catch(() => undefined);
      this.logger.log({ userId, attendees: event.attendees.length }, 'calendar event created');
      return { eventId: res.data.id ?? '', htmlLink: res.data.htmlLink ?? null };
    } catch (err) {
      if (isInvalidGrant(err)) {
        await this.connection.handleRevokedGrant(userId);
        throw AppException.conflict('Google Calendar access expired. Reconnect it in Profile.');
      }
      if (errorStatus(err) === 403) {
        throw AppException.conflict('Reconnect Google Calendar in Profile and allow Remi to add events');
      }
      throw err;
    }
  }

  private async persistTokens(userId: string, tokens: Credentials): Promise<void> {
    try {
      const key = this.config.encryptionKey;
      await this.accounts.update(userId, {
        ...(tokens.access_token ? { accessTokenEnc: encryptString(tokens.access_token, key) } : {}),
        ...(tokens.expiry_date ? { tokenExpiresAt: new Date(tokens.expiry_date) } : {}),
      });
    } catch {
      // the next call refreshes again
    }
  }
}

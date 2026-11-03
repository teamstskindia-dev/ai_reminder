import { Injectable, Logger } from '@nestjs/common';
import type { calendar_v3 } from '@googleapis/calendar';
import type { Credentials } from 'google-auth-library';
import { AppConfig } from '../../config/app-config';
import { decryptString, encryptString } from '../../common/utils/crypto.util';
import { isValidTimeZone } from '../../common/validation/validators';
import { callExternal, errorStatus } from '../../infra/external/external-call';
import { GoogleOAuthService, isInvalidGrant } from '../../infra/google/google-oauth.service';
import { detectMeetingLink } from '../../infra/google/meeting-link.util';
import type { MeetingRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { PermanentJobError } from '../../infra/queue/base.processor';
import { MeetingSchedulerService } from '../bot/meeting-scheduler.service';
import { SettingsService } from '../content/settings.service';
import { MeetingEventsService } from '../meetings/meeting-events.service';
import { MeetingsRepository } from '../meetings/meetings.repository';
import { GoogleAccountsRepository, UsersRepository } from '../users/users.repository';
import { CalendarConnectionService } from './calendar-connection.service';

const WINDOW_PAST_MS = 24 * 3600_000;
const WINDOW_FUTURE_MS = 14 * 24 * 3600_000;
const MAX_PAGES = 20;

export interface SyncResult {
  skipped?: string;
  events: number;
  upserted: number;
  cancelled: number;
  fullSync: boolean;
}

/** Calendar → meetings sync (HLD §5.2): incremental with syncToken, 410 → full window resync. */
@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private readonly accounts: GoogleAccountsRepository,
    private readonly users: UsersRepository,
    private readonly meetings: MeetingsRepository,
    private readonly events: MeetingEventsService,
    private readonly scheduler: MeetingSchedulerService,
    private readonly connection: CalendarConnectionService,
    private readonly google: GoogleOAuthService,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  async syncUser(userId: string): Promise<SyncResult> {
    const empty = (skipped: string): SyncResult => ({ skipped, events: 0, upserted: 0, cancelled: 0, fullSync: false });
    const features = await this.settings.get('features');
    if (!features.calendarSync) return empty('calendar sync disabled');
    const account = await this.accounts.find(userId);
    if (!account?.calendarConnected || !account.refreshTokenEnc) return empty('not connected');
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'active') return empty('user inactive');

    let refreshToken: string;
    let accessToken: string | null = null;
    try {
      refreshToken = decryptString(account.refreshTokenEnc, this.config.encryptionKey);
      if (account.accessTokenEnc) accessToken = decryptString(account.accessTokenEnc, this.config.encryptionKey);
    } catch (err) {
      await this.accounts.update(userId, {
        syncError: 'Stored Google credentials are unreadable. Reconnect your calendar.',
      });
      throw new PermanentJobError('Could not decrypt Google tokens (ENCRYPTION_KEY changed?)', { cause: err });
    }

    const cal = this.google.calendarClient(
      { accessToken, refreshToken, expiryDate: account.tokenExpiresAt?.getTime() ?? null },
      (tokens) => void this.persistTokens(userId, tokens),
    );

    let result: { items: calendar_v3.Schema$Event[]; nextSyncToken: string | null; timeZone: string | null };
    let fullSync = !account.calendarSyncToken;
    try {
      try {
        result = await this.fetchEvents(cal, account.calendarSyncToken);
      } catch (err) {
        if (errorStatus(err) !== 410) throw err;
        this.logger.log({ userId }, 'sync token expired (410); running full sync');
        fullSync = true;
        result = await this.fetchEvents(cal, null);
      }
    } catch (err) {
      if (isInvalidGrant(err)) {
        await this.connection.handleRevokedGrant(userId);
        throw new PermanentJobError('Google grant revoked (invalid_grant)', { cause: err });
      }
      const status = errorStatus(err);
      if (status === 401 || status === 403) {
        await this.accounts.update(userId, {
          syncError: 'Remi is missing permission to read your calendar. Reconnect and allow calendar access.',
        });
        throw new PermanentJobError(`Calendar API rejected the request (${status})`, { cause: err });
      }
      await this.accounts.update(userId, { syncError: 'Calendar sync failed temporarily; retrying.' });
      throw err;
    }

    if (result.timeZone && user.timezone === 'UTC' && result.timeZone !== 'UTC' && isValidTimeZone(result.timeZone)) {
      await this.users.update(userId, { timezone: result.timeZone });
    }

    const touched: MeetingRow[] = [];
    let cancelled = 0;
    for (const event of result.items) {
      try {
        const outcome = await this.applyEvent(userId, event);
        if (outcome === 'cancelled') cancelled++;
        else if (outcome) touched.push(outcome);
      } catch (err) {
        this.logger.warn({ userId, errName: (err as Error).name }, 'could not apply calendar event; skipped');
      }
    }
    await this.scheduler.scheduleMeetings(userId, touched);
    await this.accounts.update(userId, {
      calendarSyncToken: result.nextSyncToken ?? account.calendarSyncToken,
      lastSyncedAt: new Date(),
      syncError: null,
    });
    const summary = { events: result.items.length, upserted: touched.length, cancelled, fullSync };
    this.logger.log({ userId, ...summary }, 'calendar synced');
    return summary;
  }

  private async fetchEvents(cal: calendar_v3.Calendar, syncToken: string | null) {
    const items: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    let timeZone: string | null = null;
    const now = Date.now();
    for (let page = 0; page < MAX_PAGES; page++) {
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: 'primary',
        singleEvents: true,
        maxResults: 250,
        pageToken,
        ...(syncToken
          ? { syncToken }
          : {
              timeMin: new Date(now - WINDOW_PAST_MS).toISOString(),
              timeMax: new Date(now + WINDOW_FUTURE_MS).toISOString(),
            }),
      };
      const res = await callExternal(
        {
          provider: 'google',
          operation: 'calendar.events.list',
          retries: 2,
          timeoutMs: 25_000,
          passThrough: (err) => isInvalidGrant(err) || [401, 403, 404, 410].includes(errorStatus(err) ?? 0),
        },
        (signal) => cal.events.list(params, { signal }),
      );
      items.push(...(res.data.items ?? []));
      timeZone = res.data.timeZone ?? timeZone;
      if (res.data.nextPageToken) {
        pageToken = res.data.nextPageToken;
        continue;
      }
      nextSyncToken = res.data.nextSyncToken ?? null;
      break;
    }
    return { items, nextSyncToken, timeZone };
  }

  /** Returns the upserted active meeting, 'cancelled', or null when the event is ignored. */
  private async applyEvent(userId: string, event: calendar_v3.Schema$Event): Promise<MeetingRow | 'cancelled' | null> {
    if (!event.id) return null;
    const existing = await this.meetings.findByCalendarEvent(userId, event.id);
    const declined = event.attendees?.some((a) => a.self && a.responseStatus === 'declined') ?? false;
    const link = detectMeetingLink(event);
    const startRaw = event.start?.dateTime;

    if (event.status === 'cancelled' || declined || !link || !startRaw) {
      if (existing && ['scheduled', 'skipped'].includes(existing.status)) {
        await this.scheduler.unscheduleMeeting(existing);
        await this.events.setStatus(existing.id, 'cancelled', { botJobId: null });
        return 'cancelled';
      }
      return null;
    }

    const startAt = new Date(startRaw);
    const endAt = event.end?.dateTime ? new Date(event.end.dateTime) : null;
    if (Number.isNaN(startAt.getTime())) return null;
    const attendees = (event.attendees ?? []).slice(0, 200).map((a) => ({
      email: (a.email ?? '').slice(0, 320),
      name: a.displayName?.slice(0, 200) ?? null,
      responseStatus: a.responseStatus ?? null,
      organizer: a.organizer === true,
    }));
    const fields = {
      title: (event.summary?.trim() || 'Untitled meeting').slice(0, 300),
      description: event.description ? event.description.slice(0, 5000) : null,
      platform: link.platform,
      meetingUrl: link.url.slice(0, 1000),
      startAt,
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
      timezone: event.start?.timeZone ?? null,
      organizerEmail: event.organizer?.email ?? null,
      isOrganizer: event.organizer?.self === true,
      attendees: attendees as unknown as Prisma.InputJsonValue,
      icalUid: event.iCalUID ?? null,
    };
    const reactivate = existing?.status === 'cancelled' && (fields.endAt ?? startAt).getTime() > Date.now();
    const row = await this.meetings.upsertCalendarEvent(
      userId,
      event.id,
      { ...fields, source: 'calendar' },
      {
        ...fields,
        ...(reactivate ? { status: 'scheduled', failureReason: null } : {}),
      },
    );
    return ['scheduled', 'skipped'].includes(row.status) ? row : null;
  }

  private async persistTokens(userId: string, tokens: Credentials): Promise<void> {
    try {
      const key = this.config.encryptionKey;
      await this.accounts.update(userId, {
        ...(tokens.access_token ? { accessTokenEnc: encryptString(tokens.access_token, key) } : {}),
        ...(tokens.refresh_token ? { refreshTokenEnc: encryptString(tokens.refresh_token, key) } : {}),
        ...(tokens.expiry_date ? { tokenExpiresAt: new Date(tokens.expiry_date) } : {}),
      });
    } catch (err) {
      this.logger.warn({ userId, errName: (err as Error).name }, 'could not persist refreshed Google tokens');
    }
  }
}

import { Injectable } from '@nestjs/common';
import type { MeetingStatus } from '../../common/types/api.types';
import type { MeetingRow } from '../../infra/prisma/models';
import { Prisma } from '../../infra/prisma/models';
import { RealtimeEmitter } from '../../infra/realtime/realtime-emitter.service';
import { MeetingsRepository } from './meetings.repository';

/** Status transitions that also notify the owner's clients (`meeting:updated`). */
@Injectable()
export class MeetingEventsService {
  constructor(
    private readonly meetings: MeetingsRepository,
    private readonly realtime: RealtimeEmitter,
  ) {}

  async setStatus(
    meetingId: string,
    status: MeetingStatus,
    extra: Prisma.MeetingUncheckedUpdateInput = {},
  ): Promise<MeetingRow> {
    const row = await this.meetings.update(meetingId, { ...extra, status });
    this.emit(row);
    return row;
  }

  emit(row: Pick<MeetingRow, 'id' | 'userId' | 'status' | 'failureReason'>): void {
    this.realtime.toUser(row.userId, 'meeting:updated', {
      id: row.id,
      status: row.status,
      failureReason: row.failureReason,
    });
  }
}

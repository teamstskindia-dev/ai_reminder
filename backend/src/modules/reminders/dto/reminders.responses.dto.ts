import { ApiProperty } from '@nestjs/swagger';
import { ApiDateTime, ApiUuid } from '../../../common/swagger/api-docs.decorators';
import { REMINDER_CHANNELS } from '../../../common/types/api.types';
import type * as Contract from '../../../common/types/api.types';

export class Reminder implements Contract.Reminder {
  @ApiUuid() id: string;
  type: Contract.ReminderType;
  title: string;
  body: string | null;
  @ApiDateTime() remindAt: string;
  @ApiProperty({ enum: REMINDER_CHANNELS, isArray: true }) channels: Contract.ReminderChannel[];
  status: Contract.ReminderStatus;
  source: 'ai' | 'manual' | 'system';
  @ApiUuid() meetingId: string | null;
  meetingTitle: string | null;
  @ApiUuid() actionItemId: string | null;
  @ApiDateTime() sentAt: string | null;
  @ApiDateTime() createdAt: string;
}

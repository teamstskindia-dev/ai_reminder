import { ApiDateTime, ApiUuid } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';

export class ActionItem implements Contract.ActionItem {
  @ApiUuid() id: string;
  @ApiUuid() meetingId: string | null;
  meetingTitle: string | null;
  title: string;
  description: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  /** Assigned to the signed-in user. */
  isMine: boolean;
  @ApiDateTime() dueAt: string | null;
  priority: Contract.Priority;
  status: Contract.ActionItemStatus;
  source: 'ai' | 'manual';
  @ApiDateTime() completedAt: string | null;
  @ApiDateTime() createdAt: string;
}

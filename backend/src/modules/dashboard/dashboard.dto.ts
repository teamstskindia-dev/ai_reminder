import { ApiProperty } from '@nestjs/swagger';
import { ApiInteger } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';
import { ActionItem } from '../action-items/action-items.responses.dto';
import { Banner } from '../content/content.responses.dto';
import { MeetingListItem } from '../meetings/dto/meetings.responses.dto';
import { Reminder } from '../reminders/dto/reminders.responses.dto';

type DashboardStatsShape = Contract.DashboardHome['stats'];

export class DashboardStats implements DashboardStatsShape {
  /** Meetings this week (user time zone, week starts Monday). */
  @ApiInteger({ minimum: 0 }) meetingsThisWeek: number;
  hoursThisWeek: number;
  @ApiInteger({ minimum: 0 }) openActionItems: number;
  @ApiInteger({ minimum: 0 }) pendingReminders: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) avgMeetingScore: number | null;
}

export class DashboardHome implements Contract.DashboardHome {
  stats: DashboardStats;
  /** Next 5 scheduled or live meetings. */
  upcomingMeetings: MeetingListItem[];
  /** Last 5 completed meetings. */
  recentReports: MeetingListItem[];
  /** Up to 5 open action items, soonest due first. */
  openActionItems: ActionItem[];
  /** Next 5 pending reminders. */
  upcomingReminders: Reminder[];
  banners: Banner[];
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiDataResponse, ApiErrors, ApiPaginatedResponse } from '../../common/swagger/api-docs.decorators';
import { QueuedResult } from '../../common/swagger/common-results.dto';
import { AdminAuth } from '../auth/auth.decorators';
import { TranscriptSegment } from '../meetings/dto/meetings.responses.dto';
import { AdminUsersService } from './admin-users.service';
import { Audited, AuditInterceptor } from './audit';
import { AdminMeetingsQueryDto, AdminUpdateUserDto, AdminUsersQueryDto } from './dto/admin.dto';
import {
  AdminDashboardStats,
  AdminMeetingDetail,
  AdminMeetingListItem,
  AdminUserDetail,
  AdminUserListItem,
} from './dto/admin.responses.dto';

@ApiTags('admin: users & meetings')
@AdminAuth('viewer')
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Get admin dashboard stats, queue health and 30-day charts' })
  @ApiDataResponse(AdminDashboardStats)
  stats() {
    return this.service.dashboardStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'List users', description: 'Search by email or name; filter by status and plan.' })
  @ApiPaginatedResponse(AdminUserListItem)
  users(@Query() q: AdminUsersQueryDto) {
    return this.service.listUsers(q);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get a user with settings, integration, devices and usage stats' })
  @ApiDataResponse(AdminUserDetail)
  @ApiErrors('NOT_FOUND')
  user(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.userDetail(id);
  }

  @Patch('users/:id')
  @AdminAuth('admin')
  @Audited('user.update', 'users')
  @ApiOperation({
    summary: 'Rename, suspend or re-activate a user, or change their plan',
    description: 'Suspending signs the user out everywhere and cancels their scheduled bot joins.',
  })
  @ApiDataResponse(AdminUserDetail)
  @ApiErrors('NOT_FOUND')
  updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateUserDto) {
    return this.service.updateUser(id, dto);
  }

  @Delete('users/:id')
  @HttpCode(204)
  @AdminAuth('super_admin')
  @Audited('user.delete', 'users')
  @ApiOperation({ summary: 'Permanently delete a user and all their data' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async deleteUser(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.deleteUser(id);
  }

  @Get('meetings')
  @ApiOperation({ summary: 'List meetings across all users' })
  @ApiPaginatedResponse(AdminMeetingListItem)
  meetings(@Query() q: AdminMeetingsQueryDto) {
    return this.service.listMeetings(q);
  }

  @Get('meetings/:id')
  @ApiOperation({ summary: 'Get any meeting with its report and owner' })
  @ApiDataResponse(AdminMeetingDetail)
  @ApiErrors('NOT_FOUND')
  meeting(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.meetingDetail(id);
  }

  @Get('meetings/:id/transcript')
  @ApiOperation({ summary: 'Get the full transcript of any meeting' })
  @ApiDataResponse(TranscriptSegment, { isArray: true })
  @ApiErrors('NOT_FOUND')
  transcript(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.transcript(id);
  }

  @Post('meetings/:id/reprocess')
  @HttpCode(200)
  @AdminAuth('admin')
  @Audited('meeting.reprocess', 'meetings')
  @ApiOperation({ summary: 'Re-run the AI pipeline for a meeting' })
  @ApiDataResponse(QueuedResult)
  @ApiErrors('NOT_FOUND')
  reprocess(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.reprocess(id);
  }

  @Delete('meetings/:id')
  @HttpCode(204)
  @AdminAuth('admin')
  @Audited('meeting.delete', 'meetings')
  @ApiOperation({ summary: 'Delete a meeting with its transcript, report and recording' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async deleteMeeting(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.deleteMeeting(id);
  }
}

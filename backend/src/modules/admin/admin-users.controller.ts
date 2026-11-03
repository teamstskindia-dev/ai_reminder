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
import { ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '../auth/auth.decorators';
import { AdminUsersService } from './admin-users.service';
import { Audited, AuditInterceptor } from './audit';
import { AdminMeetingsQueryDto, AdminUpdateUserDto, AdminUsersQueryDto } from './dto/admin.dto';

@ApiTags('admin: users & meetings')
@AdminAuth('viewer')
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Get('dashboard/stats')
  stats() {
    return this.service.dashboardStats();
  }

  @Get('users')
  users(@Query() q: AdminUsersQueryDto) {
    return this.service.listUsers(q);
  }

  @Get('users/:id')
  user(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.userDetail(id);
  }

  @Patch('users/:id')
  @AdminAuth('admin')
  @Audited('user.update', 'users')
  updateUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateUserDto) {
    return this.service.updateUser(id, dto);
  }

  @Delete('users/:id')
  @HttpCode(204)
  @AdminAuth('super_admin')
  @Audited('user.delete', 'users')
  async deleteUser(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.deleteUser(id);
  }

  @Get('meetings')
  meetings(@Query() q: AdminMeetingsQueryDto) {
    return this.service.listMeetings(q);
  }

  @Get('meetings/:id')
  meeting(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.meetingDetail(id);
  }

  @Get('meetings/:id/transcript')
  transcript(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.transcript(id);
  }

  @Post('meetings/:id/reprocess')
  @HttpCode(200)
  @AdminAuth('admin')
  @Audited('meeting.reprocess', 'meetings')
  reprocess(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.reprocess(id);
  }

  @Delete('meetings/:id')
  @HttpCode(204)
  @AdminAuth('admin')
  @Audited('meeting.delete', 'meetings')
  async deleteMeeting(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.deleteMeeting(id);
  }
}

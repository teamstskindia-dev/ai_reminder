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
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminRow } from '../../infra/prisma/models';
import { AdminAuth, assertRole, CurrentAdmin } from '../auth/auth.decorators';
import { ContentCacheService } from '../content/content-cache.service';
import { EDITOR_SETTING_KEYS, isSettingKey } from '../content/settings.schemas';
import { SettingsService } from '../content/settings.service';
import { AppException } from '../../common/errors/app.exception';
import { AdminContentService } from './admin-content.service';
import { Audited, AuditInterceptor } from './audit';
import {
  BannersQueryDto,
  CreateBannerDto,
  CreateNavItemDto,
  CreatePageDto,
  CreatePlanDto,
  CreateSectionDto,
  NavQueryDto,
  PagesQueryDto,
  PutSettingDto,
  ReorderDto,
  SectionsQueryDto,
  UpdateBannerDto,
  UpdateNavItemDto,
  UpdatePageDto,
  UpdatePlanDto,
  UpdateSectionDto,
} from './dto/admin.dto';

@ApiTags('admin: content')
@AdminAuth('viewer')
@UseInterceptors(AuditInterceptor)
@Controller('admin')
export class AdminContentController {
  constructor(
    private readonly content: AdminContentService,
    private readonly settings: SettingsService,
    private readonly cache: ContentCacheService,
  ) {}

  // ---------- settings ----------
  @Get('settings')
  listSettings() {
    return this.settings.listRecords();
  }

  @Get('settings/:key')
  getSetting(@Param('key') key: string) {
    return this.settings.getRecord(key);
  }

  @Put('settings/:key')
  @AdminAuth('editor')
  @Audited('settings.update', 'app_settings')
  async putSetting(@CurrentAdmin() admin: AdminRow, @Param('key') key: string, @Body() dto: PutSettingDto) {
    if (!isSettingKey(key)) throw AppException.notFound('Setting');
    if (!EDITOR_SETTING_KEYS.includes(key)) assertRole(admin, 'admin');
    const record = await this.settings.update(key, dto.value, admin.id);
    await this.cache.invalidate(`settings.${key}`);
    return record;
  }

  // ---------- sections ----------
  @Get('sections')
  sections(@Query() q: SectionsQueryDto) {
    return this.content.listSections(q);
  }

  @Post('sections')
  @AdminAuth('editor')
  @Audited('section.create', 'content_sections')
  createSection(@Body() dto: CreateSectionDto) {
    return this.content.createSection(dto);
  }

  @Post('sections/reorder')
  @HttpCode(200)
  @AdminAuth('editor')
  @Audited('section.reorder', 'content_sections')
  reorderSections(@Body() dto: ReorderDto) {
    return this.content.reorderSections(dto.ids);
  }

  @Patch('sections/:id')
  @AdminAuth('editor')
  @Audited('section.update', 'content_sections')
  updateSection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectionDto) {
    return this.content.updateSection(id, dto);
  }

  @Delete('sections/:id')
  @HttpCode(204)
  @AdminAuth('editor')
  @Audited('section.delete', 'content_sections')
  async deleteSection(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.content.deleteSection(id);
  }

  // ---------- pages ----------
  @Get('pages')
  pages(@Query() q: PagesQueryDto) {
    return this.content.listPages(q);
  }

  @Get('pages/:id')
  page(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.getPage(id);
  }

  @Post('pages')
  @AdminAuth('editor')
  @Audited('page.create', 'cms_pages')
  createPage(@CurrentAdmin() admin: AdminRow, @Body() dto: CreatePageDto) {
    return this.content.createPage(dto, admin.id);
  }

  @Patch('pages/:id')
  @AdminAuth('editor')
  @Audited('page.update', 'cms_pages')
  updatePage(@CurrentAdmin() admin: AdminRow, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePageDto) {
    return this.content.updatePage(id, dto, admin.id);
  }

  @Delete('pages/:id')
  @HttpCode(204)
  @AdminAuth('editor')
  @Audited('page.delete', 'cms_pages')
  async deletePage(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.content.deletePage(id);
  }

  // ---------- navigation ----------
  @Get('navigation')
  navigation(@Query() q: NavQueryDto) {
    return this.content.listNav(q);
  }

  @Post('navigation')
  @AdminAuth('editor')
  @Audited('navigation.create', 'navigation_items')
  createNav(@Body() dto: CreateNavItemDto) {
    return this.content.createNav(dto);
  }

  @Post('navigation/reorder')
  @HttpCode(200)
  @AdminAuth('editor')
  @Audited('navigation.reorder', 'navigation_items')
  reorderNav(@Body() dto: ReorderDto) {
    return this.content.reorderNav(dto.ids);
  }

  @Patch('navigation/:id')
  @AdminAuth('editor')
  @Audited('navigation.update', 'navigation_items')
  updateNav(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNavItemDto) {
    return this.content.updateNav(id, dto);
  }

  @Delete('navigation/:id')
  @HttpCode(204)
  @AdminAuth('editor')
  @Audited('navigation.delete', 'navigation_items')
  async deleteNav(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.content.deleteNav(id);
  }

  // ---------- banners ----------
  @Get('banners')
  banners(@Query() q: BannersQueryDto) {
    return this.content.listBanners(q);
  }

  @Post('banners')
  @AdminAuth('editor')
  @Audited('banner.create', 'banners')
  createBanner(@Body() dto: CreateBannerDto) {
    return this.content.createBanner(dto);
  }

  @Patch('banners/:id')
  @AdminAuth('editor')
  @Audited('banner.update', 'banners')
  updateBanner(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBannerDto) {
    return this.content.updateBanner(id, dto);
  }

  @Delete('banners/:id')
  @HttpCode(204)
  @AdminAuth('editor')
  @Audited('banner.delete', 'banners')
  async deleteBanner(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.content.deleteBanner(id);
  }

  // ---------- plans ----------
  @Get('plans')
  plans() {
    return this.content.listPlans();
  }

  @Post('plans')
  @AdminAuth('admin')
  @Audited('plan.create', 'plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.content.createPlan(dto);
  }

  @Patch('plans/:id')
  @AdminAuth('admin')
  @Audited('plan.update', 'plans')
  updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.content.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  @HttpCode(204)
  @AdminAuth('admin')
  @Audited('plan.delete', 'plans')
  async deletePlan(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.content.deletePlan(id);
  }
}

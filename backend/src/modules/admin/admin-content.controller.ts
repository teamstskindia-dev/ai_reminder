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
import { ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AdminRow } from '../../infra/prisma/models';
import { AdminAuth, assertRole, CurrentAdmin } from '../auth/auth.decorators';
import { ContentCacheService } from '../content/content-cache.service';
import { CmsPage } from '../content/content.responses.dto';
import { EDITOR_SETTING_KEYS, isSettingKey, SETTING_KEYS } from '../content/settings.schemas';
import { SettingsService } from '../content/settings.service';
import { AppException } from '../../common/errors/app.exception';
import { ApiDataResponse, ApiErrors, ApiPaginatedResponse } from '../../common/swagger/api-docs.decorators';
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
import { AdminBanner, AdminNavItem, AdminPlan, AdminSection, AppSettingRecord } from './dto/admin.responses.dto';

const SETTING_KEY_PARAM = {
  name: 'key',
  enum: SETTING_KEYS,
  description: 'Setting key. The request `value` must match the matching `*Setting` schema.',
};

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
  @ApiOperation({ summary: 'List all app settings with their current values' })
  @ApiDataResponse(AppSettingRecord, { isArray: true })
  listSettings() {
    return this.settings.listRecords();
  }

  @Get('settings/:key')
  @ApiOperation({ summary: 'Get one app setting' })
  @ApiParam(SETTING_KEY_PARAM)
  @ApiDataResponse(AppSettingRecord)
  @ApiErrors('NOT_FOUND')
  getSetting(@Param('key') key: string) {
    return this.settings.getRecord(key);
  }

  @Put('settings/:key')
  @AdminAuth('editor')
  @Audited('settings.update', 'app_settings')
  @ApiOperation({
    summary: 'Replace an app setting value',
    description:
      `Send the full value. Editors may change ${EDITOR_SETTING_KEYS.map((k) => `\`${k}\``).join(', ')}; ` +
      'every other key needs the `admin` role. Public settings refresh the website and app config immediately.',
  })
  @ApiParam(SETTING_KEY_PARAM)
  @ApiDataResponse(AppSettingRecord)
  @ApiErrors('NOT_FOUND')
  async putSetting(@CurrentAdmin() admin: AdminRow, @Param('key') key: string, @Body() dto: PutSettingDto) {
    if (!isSettingKey(key)) throw AppException.notFound('Setting');
    if (!EDITOR_SETTING_KEYS.includes(key)) assertRole(admin, 'admin');
    const record = await this.settings.update(key, dto.value, admin.id);
    await this.cache.invalidate(`settings.${key}`);
    return record;
  }

  // ---------- sections ----------
  @Get('sections')
  @ApiOperation({ summary: 'List landing/onboarding sections (including inactive ones)' })
  @ApiDataResponse(AdminSection, { isArray: true })
  sections(@Query() q: SectionsQueryDto) {
    return this.content.listSections(q);
  }

  @Post('sections')
  @AdminAuth('editor')
  @Audited('section.create', 'content_sections')
  @ApiOperation({
    summary: 'Create a section',
    description: '`content` is validated against the schema for `type` (see the `*SectionContent` schemas).',
  })
  @ApiDataResponse(AdminSection, { status: 201 })
  createSection(@Body() dto: CreateSectionDto) {
    return this.content.createSection(dto);
  }

  @Post('sections/reorder')
  @HttpCode(200)
  @AdminAuth('editor')
  @Audited('section.reorder', 'content_sections')
  @ApiOperation({ summary: 'Reorder sections', description: 'Send the section ids in the new order.' })
  @ApiDataResponse(AdminSection, { isArray: true })
  @ApiErrors('NOT_FOUND')
  reorderSections(@Body() dto: ReorderDto) {
    return this.content.reorderSections(dto.ids);
  }

  @Patch('sections/:id')
  @AdminAuth('editor')
  @Audited('section.update', 'content_sections')
  @ApiOperation({ summary: 'Update a section' })
  @ApiDataResponse(AdminSection)
  @ApiErrors('NOT_FOUND')
  updateSection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectionDto) {
    return this.content.updateSection(id, dto);
  }

  @Delete('sections/:id')
  @HttpCode(204)
  @AdminAuth('editor')
  @Audited('section.delete', 'content_sections')
  @ApiOperation({ summary: 'Delete a section' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async deleteSection(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.content.deleteSection(id);
  }

  // ---------- pages ----------
  @Get('pages')
  @ApiOperation({ summary: 'List CMS pages (drafts included)' })
  @ApiPaginatedResponse(CmsPage)
  pages(@Query() q: PagesQueryDto) {
    return this.content.listPages(q);
  }

  @Get('pages/:id')
  @ApiOperation({ summary: 'Get a CMS page' })
  @ApiDataResponse(CmsPage)
  @ApiErrors('NOT_FOUND')
  page(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.getPage(id);
  }

  @Post('pages')
  @AdminAuth('editor')
  @Audited('page.create', 'cms_pages')
  @ApiOperation({ summary: 'Create a CMS page (Markdown)' })
  @ApiDataResponse(CmsPage, { status: 201 })
  @ApiErrors('CONFLICT')
  createPage(@CurrentAdmin() admin: AdminRow, @Body() dto: CreatePageDto) {
    return this.content.createPage(dto, admin.id);
  }

  @Patch('pages/:id')
  @AdminAuth('editor')
  @Audited('page.update', 'cms_pages')
  @ApiOperation({ summary: 'Update a CMS page; set `status: "published"` to publish it' })
  @ApiDataResponse(CmsPage)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  updatePage(@CurrentAdmin() admin: AdminRow, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePageDto) {
    return this.content.updatePage(id, dto, admin.id);
  }

  @Delete('pages/:id')
  @HttpCode(204)
  @AdminAuth('editor')
  @Audited('page.delete', 'cms_pages')
  @ApiOperation({ summary: 'Delete a CMS page' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async deletePage(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.content.deletePage(id);
  }

  // ---------- navigation ----------
  @Get('navigation')
  @ApiOperation({ summary: 'List navigation items (including inactive ones)' })
  @ApiDataResponse(AdminNavItem, { isArray: true })
  navigation(@Query() q: NavQueryDto) {
    return this.content.listNav(q);
  }

  @Post('navigation')
  @AdminAuth('editor')
  @Audited('navigation.create', 'navigation_items')
  @ApiOperation({ summary: 'Create a navigation item' })
  @ApiDataResponse(AdminNavItem, { status: 201 })
  createNav(@Body() dto: CreateNavItemDto) {
    return this.content.createNav(dto);
  }

  @Post('navigation/reorder')
  @HttpCode(200)
  @AdminAuth('editor')
  @Audited('navigation.reorder', 'navigation_items')
  @ApiOperation({ summary: 'Reorder navigation items', description: 'Send the item ids in the new order.' })
  @ApiDataResponse(AdminNavItem, { isArray: true })
  @ApiErrors('NOT_FOUND')
  reorderNav(@Body() dto: ReorderDto) {
    return this.content.reorderNav(dto.ids);
  }

  @Patch('navigation/:id')
  @AdminAuth('editor')
  @Audited('navigation.update', 'navigation_items')
  @ApiOperation({ summary: 'Update a navigation item' })
  @ApiDataResponse(AdminNavItem)
  @ApiErrors('NOT_FOUND')
  updateNav(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNavItemDto) {
    return this.content.updateNav(id, dto);
  }

  @Delete('navigation/:id')
  @HttpCode(204)
  @AdminAuth('editor')
  @Audited('navigation.delete', 'navigation_items')
  @ApiOperation({ summary: 'Delete a navigation item' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async deleteNav(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.content.deleteNav(id);
  }

  // ---------- banners ----------
  @Get('banners')
  @ApiOperation({ summary: 'List banners (including inactive and scheduled ones)' })
  @ApiDataResponse(AdminBanner, { isArray: true })
  banners(@Query() q: BannersQueryDto) {
    return this.content.listBanners(q);
  }

  @Post('banners')
  @AdminAuth('editor')
  @Audited('banner.create', 'banners')
  @ApiOperation({ summary: 'Create a banner', description: '`endsAt` must be after `startsAt` when both are set.' })
  @ApiDataResponse(AdminBanner, { status: 201 })
  createBanner(@Body() dto: CreateBannerDto) {
    return this.content.createBanner(dto);
  }

  @Patch('banners/:id')
  @AdminAuth('editor')
  @Audited('banner.update', 'banners')
  @ApiOperation({ summary: 'Update a banner' })
  @ApiDataResponse(AdminBanner)
  @ApiErrors('NOT_FOUND')
  updateBanner(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBannerDto) {
    return this.content.updateBanner(id, dto);
  }

  @Delete('banners/:id')
  @HttpCode(204)
  @AdminAuth('editor')
  @Audited('banner.delete', 'banners')
  @ApiOperation({ summary: 'Delete a banner' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND')
  async deleteBanner(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.content.deleteBanner(id);
  }

  // ---------- plans ----------
  @Get('plans')
  @ApiOperation({ summary: 'List all plans with their user counts' })
  @ApiDataResponse(AdminPlan, { isArray: true })
  plans() {
    return this.content.listPlans();
  }

  @Post('plans')
  @AdminAuth('admin')
  @Audited('plan.create', 'plans')
  @ApiOperation({ summary: 'Create a plan' })
  @ApiDataResponse(AdminPlan, { status: 201 })
  @ApiErrors('CONFLICT')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.content.createPlan(dto);
  }

  @Patch('plans/:id')
  @AdminAuth('admin')
  @Audited('plan.update', 'plans')
  @ApiOperation({
    summary: 'Update a plan',
    description:
      'Setting `isDefault: true` makes this the only default plan. The current default plan cannot be unset or ' +
      'deactivated (`CONFLICT`); make another plan the default first.',
  })
  @ApiDataResponse(AdminPlan)
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.content.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  @HttpCode(204)
  @AdminAuth('admin')
  @Audited('plan.delete', 'plans')
  @ApiOperation({
    summary: 'Delete a plan',
    description: 'The default plan, and plans that still have users, cannot be deleted (`CONFLICT`).',
  })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiErrors('NOT_FOUND', 'CONFLICT')
  async deletePlan(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.content.deletePlan(id);
  }
}

import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/pagination/pagination';
import type {
  AdminBanner,
  AdminNavItem,
  AdminPlan,
  AdminSection,
  CmsPage,
  SectionType,
} from '../../common/types/api.types';
import { isSafeUrl, MOBILE_ROUTE_RE } from '../../common/validation/safe-url';
import { Prisma } from '../../infra/prisma/models';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { toAdminBanner, toAdminNavItem, toAdminPlan, toAdminSection, toCmsPage } from '../content/content.mapper';
import { ContentCacheService } from '../content/content-cache.service';
import { validateSectionContent } from '../content/section-content.schemas';
import {
  BannersQueryDto,
  CreateBannerDto,
  CreateNavItemDto,
  CreatePageDto,
  CreatePlanDto,
  CreateSectionDto,
  NavQueryDto,
  PagesQueryDto,
  SectionsQueryDto,
  UpdateBannerDto,
  UpdateNavItemDto,
  UpdatePageDto,
  UpdatePlanDto,
  UpdateSectionDto,
} from './dto/admin.dto';

const json = (v: unknown) => v as Prisma.InputJsonValue;
const optDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(v));

/** Admin CMS writes. Every mutation invalidates the content cache (Redis `cfg:*` + web revalidation). */
@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ContentCacheService,
  ) {}

  // ---------- sections ----------
  async listSections(q: SectionsQueryDto): Promise<AdminSection[]> {
    const rows = await this.prisma.contentSection.findMany({
      where: { ...(q.page ? { page: q.page } : {}), ...(q.platform ? { platform: q.platform } : {}) },
      orderBy: [{ page: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toAdminSection);
  }

  private checkContent(type: SectionType, content: unknown): Prisma.InputJsonValue {
    const res = validateSectionContent(type, content);
    if (!res.success) throw AppException.validation(res.errors, `Invalid content for a "${type}" section`);
    return json(res.value);
  }

  async createSection(dto: CreateSectionDto): Promise<AdminSection> {
    const content = this.checkContent(dto.type, dto.content);
    const last = await this.prisma.contentSection.aggregate({ where: { page: dto.page }, _max: { sortOrder: true } });
    const row = await this.prisma.contentSection.create({
      data: {
        page: dto.page,
        type: dto.type,
        name: dto.name.trim(),
        content,
        platform: dto.platform ?? 'all',
        isActive: dto.isActive ?? true,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    await this.cache.invalidate('sections');
    return toAdminSection(row);
  }

  async updateSection(id: string, dto: UpdateSectionDto): Promise<AdminSection> {
    const current = await this.prisma.contentSection.findUnique({ where: { id } });
    if (!current) throw AppException.notFound('Section');
    const type = (dto.type ?? current.type) as SectionType;
    const content =
      dto.content !== undefined || dto.type !== undefined
        ? this.checkContent(type, dto.content ?? current.content)
        : undefined;
    const row = await this.prisma.contentSection.update({
      where: { id },
      data: {
        ...(dto.page !== undefined ? { page: dto.page } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.cache.invalidate('sections');
    return toAdminSection(row);
  }

  async deleteSection(id: string): Promise<void> {
    await this.prisma.contentSection.delete({ where: { id } });
    await this.cache.invalidate('sections');
  }

  async reorderSections(ids: string[]): Promise<AdminSection[]> {
    const rows = await this.prisma.$transaction(async (tx) => {
      const found = await tx.contentSection.count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw AppException.notFound('Section');
      for (const [index, id] of ids.entries())
        await tx.contentSection.update({ where: { id }, data: { sortOrder: index } });
      return tx.contentSection.findMany({ where: { id: { in: ids } }, orderBy: { sortOrder: 'asc' } });
    });
    await this.cache.invalidate('sections');
    return rows.map(toAdminSection);
  }

  // ---------- pages ----------
  async listPages(q: PagesQueryDto): Promise<Paginated<CmsPage>> {
    const search = q.q?.trim();
    const where: Prisma.CmsPageWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cmsPage.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.cmsPage.count({ where }),
    ]);
    return Paginated.of(rows.map(toCmsPage), total, q.page, q.limit);
  }

  async getPage(id: string): Promise<CmsPage> {
    const row = await this.prisma.cmsPage.findUnique({ where: { id } });
    if (!row) throw AppException.notFound('Page');
    return toCmsPage(row);
  }

  async createPage(dto: CreatePageDto, adminId: string): Promise<CmsPage> {
    const status = dto.status ?? 'draft';
    const row = await this.prisma.cmsPage.create({
      data: {
        slug: dto.slug,
        title: dto.title.trim(),
        content: dto.content,
        seo: json({
          title: dto.seo?.title ?? null,
          description: dto.seo?.description ?? null,
          ogImageUrl: dto.seo?.ogImageUrl ?? null,
        }),
        status,
        publishedAt: status === 'published' ? new Date() : null,
        updatedBy: adminId,
      },
    });
    await this.cache.invalidate('pages');
    return toCmsPage(row);
  }

  async updatePage(id: string, dto: UpdatePageDto, adminId: string): Promise<CmsPage> {
    const current = await this.prisma.cmsPage.findUnique({ where: { id } });
    if (!current) throw AppException.notFound('Page');
    const currentSeo = (current.seo ?? {}) as Record<string, unknown>;
    const row = await this.prisma.cmsPage.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.seo !== undefined ? { seo: json({ ...currentSeo, ...dto.seo }) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.status === 'published' && !current.publishedAt ? { publishedAt: new Date() } : {}),
        updatedBy: adminId,
      },
    });
    await this.cache.invalidate('pages');
    return toCmsPage(row);
  }

  async deletePage(id: string): Promise<void> {
    await this.prisma.cmsPage.delete({ where: { id } });
    await this.cache.invalidate('pages');
  }

  // ---------- navigation ----------
  async listNav(q: NavQueryDto): Promise<AdminNavItem[]> {
    const rows = await this.prisma.navigationItem.findMany({
      where: q.location ? { location: q.location } : {},
      orderBy: [{ location: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toAdminNavItem);
  }

  private checkHref(location: string, href: string): void {
    const ok = location === 'mobile_tab' ? MOBILE_ROUTE_RE.test(href) : isSafeUrl(href);
    if (!ok) {
      throw AppException.validation([
        {
          field: 'href',
          messages: [
            location === 'mobile_tab'
              ? 'mobile_tab href must be a tab route name like "home"'
              : 'href must be an https:// URL, a relative /path, mailto: or remi:// link',
          ],
        },
      ]);
    }
  }

  async createNav(dto: CreateNavItemDto): Promise<AdminNavItem> {
    this.checkHref(dto.location, dto.href);
    const last = await this.prisma.navigationItem.aggregate({
      where: { location: dto.location },
      _max: { sortOrder: true },
    });
    const row = await this.prisma.navigationItem.create({
      data: {
        location: dto.location,
        label: dto.label.trim(),
        href: dto.href.trim(),
        icon: dto.icon ?? null,
        groupLabel: dto.groupLabel ?? null,
        requiredFeature: dto.requiredFeature ?? null,
        isExternal: dto.isExternal ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    await this.cache.invalidate('navigation');
    return toAdminNavItem(row);
  }

  async updateNav(id: string, dto: UpdateNavItemDto): Promise<AdminNavItem> {
    const current = await this.prisma.navigationItem.findUnique({ where: { id } });
    if (!current) throw AppException.notFound('Navigation item');
    if (dto.href !== undefined || dto.location !== undefined)
      this.checkHref(dto.location ?? current.location, (dto.href ?? current.href).trim());
    const row = await this.prisma.navigationItem.update({
      where: { id },
      data: {
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.href !== undefined ? { href: dto.href.trim() } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.groupLabel !== undefined ? { groupLabel: dto.groupLabel } : {}),
        ...(dto.requiredFeature !== undefined ? { requiredFeature: dto.requiredFeature } : {}),
        ...(dto.isExternal !== undefined ? { isExternal: dto.isExternal } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.cache.invalidate('navigation');
    return toAdminNavItem(row);
  }

  async deleteNav(id: string): Promise<void> {
    await this.prisma.navigationItem.delete({ where: { id } });
    await this.cache.invalidate('navigation');
  }

  async reorderNav(ids: string[]): Promise<AdminNavItem[]> {
    const rows = await this.prisma.$transaction(async (tx) => {
      const found = await tx.navigationItem.count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw AppException.notFound('Navigation item');
      for (const [index, id] of ids.entries())
        await tx.navigationItem.update({ where: { id }, data: { sortOrder: index } });
      return tx.navigationItem.findMany({ where: { id: { in: ids } }, orderBy: { sortOrder: 'asc' } });
    });
    await this.cache.invalidate('navigation');
    return rows.map(toAdminNavItem);
  }

  // ---------- banners ----------
  async listBanners(q: BannersQueryDto): Promise<AdminBanner[]> {
    const rows = await this.prisma.banner.findMany({
      where: { ...(q.platform ? { platform: q.platform } : {}), ...(q.placement ? { placement: q.placement } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(toAdminBanner);
  }

  private checkWindow(startsAt: Date | null | undefined, endsAt: Date | null | undefined): void {
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw AppException.validation([{ field: 'endsAt', messages: ['endsAt must be after startsAt'] }]);
    }
  }

  async createBanner(dto: CreateBannerDto): Promise<AdminBanner> {
    const startsAt = optDate(dto.startsAt) ?? null;
    const endsAt = optDate(dto.endsAt) ?? null;
    this.checkWindow(startsAt, endsAt);
    const row = await this.prisma.banner.create({
      data: {
        platform: dto.platform,
        placement: dto.placement,
        variant: dto.variant,
        title: dto.title.trim(),
        body: dto.body ?? null,
        imageUrl: dto.imageUrl ?? null,
        ctaLabel: dto.ctaLabel ?? null,
        ctaUrl: dto.ctaUrl ?? null,
        startsAt,
        endsAt,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.cache.invalidate('banners');
    return toAdminBanner(row);
  }

  async updateBanner(id: string, dto: UpdateBannerDto): Promise<AdminBanner> {
    const current = await this.prisma.banner.findUnique({ where: { id } });
    if (!current) throw AppException.notFound('Banner');
    const startsAt = optDate(dto.startsAt);
    const endsAt = optDate(dto.endsAt);
    this.checkWindow(
      startsAt === undefined ? current.startsAt : startsAt,
      endsAt === undefined ? current.endsAt : endsAt,
    );
    const row = await this.prisma.banner.update({
      where: { id },
      data: {
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.placement !== undefined ? { placement: dto.placement } : {}),
        ...(dto.variant !== undefined ? { variant: dto.variant } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.ctaLabel !== undefined ? { ctaLabel: dto.ctaLabel } : {}),
        ...(dto.ctaUrl !== undefined ? { ctaUrl: dto.ctaUrl } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(startsAt !== undefined ? { startsAt } : {}),
        ...(endsAt !== undefined ? { endsAt } : {}),
      },
    });
    await this.cache.invalidate('banners');
    return toAdminBanner(row);
  }

  async deleteBanner(id: string): Promise<void> {
    await this.prisma.banner.delete({ where: { id } });
    await this.cache.invalidate('banners');
  }

  // ---------- plans ----------
  async listPlans(): Promise<AdminPlan[]> {
    const rows = await this.prisma.plan.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toAdminPlan);
  }

  private async getPlan(id: string): Promise<AdminPlan> {
    const row = await this.prisma.plan.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!row) throw AppException.notFound('Plan');
    return toAdminPlan(row);
  }

  async createPlan(dto: CreatePlanDto): Promise<AdminPlan> {
    const id = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.plan.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      const row = await tx.plan.create({
        data: {
          slug: dto.slug,
          name: dto.name.trim(),
          description: dto.description ?? null,
          priceMonthly: dto.priceMonthly,
          priceYearly: dto.priceYearly,
          currency: dto.currency,
          features: json(dto.features),
          limits: json({
            meetingsPerMonth: dto.limits.meetingsPerMonth ?? null,
            aiQueriesPerDay: dto.limits.aiQueriesPerDay ?? null,
            uploadMinutesPerMonth: dto.limits.uploadMinutesPerMonth ?? null,
          }),
          ctaLabel: dto.ctaLabel ?? null,
          isPopular: dto.isPopular ?? false,
          isDefault: dto.isDefault ?? false,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      return row.id;
    });
    await this.cache.invalidate('plans');
    return this.getPlan(id);
  }

  async updatePlan(id: string, dto: UpdatePlanDto): Promise<AdminPlan> {
    const current = await this.prisma.plan.findUnique({ where: { id } });
    if (!current) throw AppException.notFound('Plan');
    if (current.isDefault && (dto.isDefault === false || dto.isActive === false)) {
      throw AppException.conflict('Make another plan the default before changing this one');
    }
    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault)
        await tx.plan.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      const { features, limits, ...rest } = dto;
      await tx.plan.update({
        where: { id },
        data: {
          ...rest,
          ...(features !== undefined ? { features: json(features) } : {}),
          ...(limits !== undefined
            ? {
                limits: json({
                  meetingsPerMonth: limits.meetingsPerMonth ?? null,
                  aiQueriesPerDay: limits.aiQueriesPerDay ?? null,
                  uploadMinutesPerMonth: limits.uploadMinutesPerMonth ?? null,
                }),
              }
            : {}),
        },
      });
    });
    await this.cache.invalidate('plans');
    return this.getPlan(id);
  }

  async deletePlan(id: string): Promise<void> {
    const plan = await this.getPlan(id);
    if (plan.isDefault) throw AppException.conflict('The default plan cannot be deleted');
    if (plan.usersCount > 0) throw AppException.conflict('Users are still on this plan; move them first');
    await this.prisma.plan.delete({ where: { id } });
    await this.cache.invalidate('plans');
  }
}

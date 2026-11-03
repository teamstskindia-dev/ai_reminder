import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import {
  Banner,
  CmsPage,
  Features,
  NAV_LOCATIONS,
  NavItem,
  NavLocation,
  Plan,
  PublicConfig,
  Section,
} from '../../common/types/api.types';
import { sha1 } from '../../common/utils/crypto.util';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CacheService } from '../../infra/redis/cache.service';
import { RedisKeys } from '../../infra/redis/redis.constants';
import { toBanner, toCmsPage, toNavItem, toPlan, toSection } from './content.mapper';
import { SettingsService } from './settings.service';

export type Platform = 'web' | 'mobile';
const TTL = 600;

interface CachedBanner extends Banner {
  platform: string;
  startsAt: string | null;
  endsAt: string | null;
}

interface CachedConfigBase extends Omit<PublicConfig, 'banners' | 'version'> {
  banners: CachedBanner[];
}

/** Which navigation locations each platform receives. */
const NAV_FOR_PLATFORM: Record<Platform, NavLocation[]> = {
  web: ['header', 'footer', 'sidebar'],
  mobile: ['mobile_tab', 'footer'],
};

/** Cached, aggregated public content for web and mobile (`cfg:*` keys, invalidated by admin writes). */
@Injectable()
export class PublicContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly settings: SettingsService,
  ) {}

  async config(platform: Platform): Promise<PublicConfig> {
    const base = await this.cache.wrap(RedisKeys.publicConfig(platform), TTL, () => this.buildConfigBase(platform));
    const now = Date.now();
    const banners = base.banners
      .filter((b) => (!b.startsAt || Date.parse(b.startsAt) <= now) && (!b.endsAt || Date.parse(b.endsAt) > now))
      .map((b): Banner => ({
        id: b.id,
        placement: b.placement,
        variant: b.variant,
        title: b.title,
        body: b.body,
        imageUrl: b.imageUrl,
        ctaLabel: b.ctaLabel,
        ctaUrl: b.ctaUrl,
      }));
    const config = { ...base, banners };
    return { ...config, version: sha1(JSON.stringify(config)).slice(0, 16) };
  }

  private async buildConfigBase(platform: Platform): Promise<CachedConfigBase> {
    const { branding, theme, features, app, seo } = await this.settings.getMany([
      'branding',
      'theme',
      'features',
      'app',
      'seo',
    ]);
    const [nav, banners] = await Promise.all([
      this.prisma.navigationItem.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.banner.findMany({
        where: { isActive: true, platform: { in: [platform, 'all'] } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const navigation = Object.fromEntries(NAV_LOCATIONS.map((l) => [l, [] as NavItem[]])) as Record<
      NavLocation,
      NavItem[]
    >;
    const allowed = new Set(NAV_FOR_PLATFORM[platform]);
    for (const item of nav) {
      const location = item.location as NavLocation;
      if (!allowed.has(location)) continue;
      const flag = item.requiredFeature as keyof Features | null;
      if (flag && flag in features && !features[flag]) continue;
      navigation[location].push(toNavItem(item));
    }
    return {
      branding,
      theme,
      features,
      app,
      seo,
      navigation,
      banners: banners.map((b) => ({
        ...toBanner(b),
        platform: b.platform,
        startsAt: b.startsAt?.toISOString() ?? null,
        endsAt: b.endsAt?.toISOString() ?? null,
      })),
    };
  }

  /** Active banners for a dashboard placement (web: dashboard, mobile: mobile_home). */
  async dashboardBanners(platform: Platform): Promise<Banner[]> {
    const placement = platform === 'mobile' ? 'mobile_home' : 'dashboard';
    return (await this.config(platform)).banners.filter((b) => b.placement === placement);
  }

  sections(page: string, platform: Platform): Promise<Section[]> {
    return this.cache.wrap(RedisKeys.sections(page, platform), TTL, async () =>
      (
        await this.prisma.contentSection.findMany({
          where: { page, isActive: true, platform: { in: [platform, 'all'] } },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        })
      ).map(toSection),
    );
  }

  async page(slug: string): Promise<CmsPage> {
    const page = await this.cache.wrap<CmsPage | null>(RedisKeys.page(slug), TTL, async () => {
      const row = await this.prisma.cmsPage.findFirst({ where: { slug, status: 'published' } });
      return row ? toCmsPage(row) : null;
    });
    if (!page) throw AppException.notFound('Page');
    return page;
  }

  plans(): Promise<Plan[]> {
    return this.cache.wrap(RedisKeys.plans(), TTL, async () =>
      (
        await this.prisma.plan.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        })
      ).map(toPlan),
    );
  }
}

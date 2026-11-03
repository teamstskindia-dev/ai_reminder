import type {
  AdminBanner,
  AdminNavItem,
  AdminPlan,
  AdminSection,
  Banner,
  CmsPage,
  Features,
  MediaAsset,
  NavItem,
  NavLocation,
  Plan,
  Section,
  SectionType,
} from '../../common/types/api.types';
import type {
  BannerRow,
  CmsPageRow,
  ContentSectionRow,
  MediaAssetRow,
  NavigationItemRow,
  PlanRow,
} from '../../infra/prisma/models';
import { toPlanLimits } from '../users/users.mapper';

export function toSection(row: ContentSectionRow): Section {
  return { id: row.id, page: row.page, type: row.type as SectionType, content: row.content, sortOrder: row.sortOrder };
}

export function toAdminSection(row: ContentSectionRow): AdminSection {
  return {
    ...toSection(row),
    name: row.name,
    platform: row.platform as AdminSection['platform'],
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCmsPage(row: CmsPageRow): CmsPage {
  const seo = (row.seo ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    seo: { title: str(seo.title), description: str(seo.description), ogImageUrl: str(seo.ogImageUrl) },
    status: row.status as CmsPage['status'],
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toNavItem(row: NavigationItemRow): NavItem {
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    icon: row.icon,
    groupLabel: row.groupLabel,
    isExternal: row.isExternal,
    sortOrder: row.sortOrder,
  };
}

export function toAdminNavItem(row: NavigationItemRow): AdminNavItem {
  return {
    ...toNavItem(row),
    location: row.location as NavLocation,
    requiredFeature: (row.requiredFeature as keyof Features | null) ?? null,
    isActive: row.isActive,
  };
}

export function toBanner(row: BannerRow): Banner {
  return {
    id: row.id,
    placement: row.placement as Banner['placement'],
    variant: row.variant as Banner['variant'],
    title: row.title,
    body: row.body,
    imageUrl: row.imageUrl,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
  };
}

export function toAdminBanner(row: BannerRow): AdminBanner {
  return {
    ...toBanner(row),
    platform: row.platform as AdminBanner['platform'],
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    priceMonthly: Number(row.priceMonthly),
    priceYearly: Number(row.priceYearly),
    currency: row.currency,
    features: Array.isArray(row.features) ? row.features.filter((f): f is string => typeof f === 'string') : [],
    limits: toPlanLimits(row.limits),
    ctaLabel: row.ctaLabel,
    isPopular: row.isPopular,
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
  };
}

export function toAdminPlan(row: PlanRow & { _count?: { users: number } }): AdminPlan {
  return { ...toPlan(row), isActive: row.isActive, usersCount: row._count?.users ?? 0 };
}

export function toMediaAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    publicId: row.publicId,
    url: row.url,
    resourceType: row.resourceType,
    format: row.format,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    folder: row.folder,
    alt: row.alt,
    createdAt: row.createdAt.toISOString(),
  };
}

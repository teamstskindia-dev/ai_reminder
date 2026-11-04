import { ApiProperty } from '@nestjs/swagger';
import { ApiDateTime, ApiInteger, ApiUuid } from '../../common/swagger/api-docs.decorators';
import type * as Contract from '../../common/types/api.types';
import { sectionContentSchema, settingRef } from './content.openapi';

/** Response models for public content (API contract §1). Each one `implements` its contract type. */

export class NavItem implements Contract.NavItem {
  @ApiUuid() id: string;
  label: string;
  /** https URL, relative `/path`, `mailto:`, `remi://` deep link, or an expo-router tab name for `mobile_tab`. */
  href: string;
  /** Icon key, e.g. `calendar`. */
  icon: string | null;
  groupLabel: string | null;
  isExternal: boolean;
  @ApiInteger() sortOrder: number;
}

export class PublicNavigation implements Record<Contract.NavLocation, Contract.NavItem[]> {
  header: NavItem[];
  footer: NavItem[];
  sidebar: NavItem[];
  mobile_tab: NavItem[];
}

export class Banner implements Contract.Banner {
  @ApiUuid() id: string;
  placement: Contract.BannerPlacement;
  variant: Contract.BannerVariant;
  title: string;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export class PublicConfig implements Contract.PublicConfig {
  @ApiProperty(settingRef('branding')) branding: Contract.Branding;
  @ApiProperty(settingRef('theme')) theme: Contract.Theme;
  @ApiProperty(settingRef('features')) features: Contract.Features;
  @ApiProperty(settingRef('app')) app: Contract.AppMeta;
  @ApiProperty(settingRef('seo')) seo: Contract.Seo;
  /** Active navigation items per location, already filtered by enabled features. */
  navigation: PublicNavigation;
  /** Banners currently scheduled for the requested platform. */
  banners: Banner[];
  /** Changes whenever any public setting changes; also sent as the `ETag`. */
  version: string;
}

export class Section implements Contract.Section {
  @ApiUuid() id: string;
  /** Page key, e.g. `landing`. */
  page: string;
  type: Contract.SectionType;
  @ApiProperty(sectionContentSchema()) content: unknown;
  @ApiInteger() sortOrder: number;
}

export class CmsPageSeo {
  title: string | null;
  description: string | null;
  ogImageUrl: string | null;
}

export class CmsPage implements Contract.CmsPage {
  @ApiUuid() id: string;
  slug: string;
  title: string;
  /** Markdown. */
  content: string;
  seo: CmsPageSeo;
  status: 'draft' | 'published';
  @ApiDateTime() publishedAt: string | null;
  @ApiDateTime() updatedAt: string;
}

export class PlanLimits implements Contract.PlanLimits {
  /** `null` = unlimited. */
  @ApiInteger() meetingsPerMonth: number | null;
  /** `null` = unlimited. */
  @ApiInteger() aiQueriesPerDay: number | null;
  /** `null` = unlimited. */
  @ApiInteger() uploadMinutesPerMonth: number | null;
}

export class Plan implements Contract.Plan {
  @ApiUuid() id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  /** ISO 4217 code, e.g. `USD`. */
  currency: string;
  features: string[];
  limits: PlanLimits;
  ctaLabel: string | null;
  isPopular: boolean;
  isDefault: boolean;
  @ApiInteger() sortOrder: number;
}

export class PlanRef implements Pick<Contract.Plan, 'id' | 'slug' | 'name'> {
  @ApiUuid() id: string;
  slug: string;
  name: string;
}

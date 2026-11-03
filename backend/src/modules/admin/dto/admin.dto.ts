import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination';
import { ADMIN_ROLES, NAV_LOCATIONS, REMINDER_CHANNELS, SECTION_TYPES } from '../../../common/types/api.types';
import type { AdminRole, NavLocation, ReminderChannel, SectionType } from '../../../common/types/api.types';
import { IsSafeUrl } from '../../../common/validation/safe-url';
import { IsOptionalNonNull, IsOptionalNullable } from '../../../common/validation/validators';

const PASSWORD = { min: 12, max: 128 };
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAGE_KEY_RE = /^[a-z][a-z0-9_]{0,40}$/;
const FEATURE_KEYS = [
  'askAi',
  'analytics',
  'reminders',
  'actionItems',
  'calendarSync',
  'meetingUpload',
  'pushNotifications',
  'signupsEnabled',
];

// ---------- auth ----------
export class AdminLoginDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @Length(1, PASSWORD.max)
  password: string;
}

export class AdminRefreshDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

export class UpdateAdminMeDto {
  @IsOptionalNonNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptionalNullable()
  @IsSafeUrl({ relative: false, mailto: false, appScheme: false })
  avatarUrl?: string | null;

  @IsOptionalNonNull()
  @IsString()
  @Length(1, PASSWORD.max)
  currentPassword?: string;

  @IsOptionalNonNull()
  @IsString()
  @Length(PASSWORD.min, PASSWORD.max)
  newPassword?: string;
}

// ---------- users / meetings ----------
export class AdminUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';

  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({ enum: ['createdAt:desc', 'createdAt:asc', 'lastLoginAt:desc', 'email:asc'] })
  @IsOptional()
  @IsIn(['createdAt:desc', 'createdAt:asc', 'lastLoginAt:desc', 'email:asc'])
  sort?: string;
}

export class AdminUpdateUserDto {
  @IsOptionalNonNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptionalNonNull()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';

  @IsOptionalNullable()
  @IsUUID()
  planId?: string | null;
}

export class AdminMeetingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Matches(/^[a-z_]+(,[a-z_]+)*$/)
  status?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

// ---------- settings ----------
export class PutSettingDto {
  @IsObject()
  value: Record<string, unknown>;
}

// ---------- sections ----------
export class SectionsQueryDto {
  @IsOptional()
  @Matches(PAGE_KEY_RE)
  page?: string;

  @IsOptional()
  @IsIn(['web', 'mobile', 'all'])
  platform?: 'web' | 'mobile' | 'all';
}

export class CreateSectionDto {
  @Matches(PAGE_KEY_RE, { message: 'page must be a key like "landing"' })
  page: string;

  @IsIn(SECTION_TYPES)
  type: SectionType;

  @IsString()
  @Length(1, 120)
  name: string;

  @IsObject()
  content: Record<string, unknown>;

  @IsOptionalNonNull()
  @IsIn(['web', 'mobile', 'all'])
  platform?: 'web' | 'mobile' | 'all';

  @IsOptionalNonNull()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSectionDto {
  @IsOptionalNonNull()
  @Matches(PAGE_KEY_RE)
  page?: string;

  @IsOptionalNonNull()
  @IsIn(SECTION_TYPES)
  type?: SectionType;

  @IsOptionalNonNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptionalNonNull()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptionalNonNull()
  @IsIn(['web', 'mobile', 'all'])
  platform?: 'web' | 'mobile' | 'all';

  @IsOptionalNonNull()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];
}

// ---------- pages ----------
export class PagesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}

export class PageSeoDto {
  @IsOptionalNullable()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptionalNullable()
  @IsSafeUrl({ relative: false, mailto: false, appScheme: false })
  ogImageUrl?: string | null;
}

export class CreatePageDto {
  @Matches(SLUG_RE, { message: 'slug must be lowercase words separated by hyphens' })
  @MaxLength(100)
  slug: string;

  @IsString()
  @Length(1, 300)
  title: string;

  @IsString()
  @MaxLength(200_000)
  content: string;

  @IsOptionalNonNull()
  @ValidateNested()
  @Type(() => PageSeoDto)
  seo?: PageSeoDto;

  @IsOptionalNonNull()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}

export class UpdatePageDto {
  @IsOptionalNonNull()
  @Matches(SLUG_RE)
  @MaxLength(100)
  slug?: string;

  @IsOptionalNonNull()
  @IsString()
  @Length(1, 300)
  title?: string;

  @IsOptionalNonNull()
  @IsString()
  @MaxLength(200_000)
  content?: string;

  @IsOptionalNonNull()
  @ValidateNested()
  @Type(() => PageSeoDto)
  seo?: PageSeoDto;

  @IsOptionalNonNull()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}

// ---------- navigation ----------
export class NavQueryDto {
  @IsOptional()
  @IsIn(NAV_LOCATIONS)
  location?: NavLocation;
}

export class CreateNavItemDto {
  @IsIn(NAV_LOCATIONS)
  location: NavLocation;

  @IsString()
  @Length(1, 60)
  label: string;

  @ApiPropertyOptional({ description: 'Web: https URL, /path, mailto: or remi://. mobile_tab: expo-router tab name.' })
  @IsString()
  @Length(1, 2048)
  href: string;

  @IsOptionalNullable()
  @Matches(/^[a-z][a-z0-9-]{0,40}$/)
  icon?: string | null;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(60)
  groupLabel?: string | null;

  @IsOptionalNullable()
  @IsIn(FEATURE_KEYS)
  requiredFeature?: string | null;

  @IsOptionalNonNull()
  @IsBoolean()
  isExternal?: boolean;

  @IsOptionalNonNull()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateNavItemDto {
  @IsOptionalNonNull()
  @IsIn(NAV_LOCATIONS)
  location?: NavLocation;

  @IsOptionalNonNull()
  @IsString()
  @Length(1, 60)
  label?: string;

  @IsOptionalNonNull()
  @IsString()
  @Length(1, 2048)
  href?: string;

  @IsOptionalNullable()
  @Matches(/^[a-z][a-z0-9-]{0,40}$/)
  icon?: string | null;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(60)
  groupLabel?: string | null;

  @IsOptionalNullable()
  @IsIn(FEATURE_KEYS)
  requiredFeature?: string | null;

  @IsOptionalNonNull()
  @IsBoolean()
  isExternal?: boolean;

  @IsOptionalNonNull()
  @IsBoolean()
  isActive?: boolean;
}

// ---------- banners ----------
export class BannersQueryDto {
  @IsOptional()
  @IsIn(['web', 'mobile', 'all'])
  platform?: 'web' | 'mobile' | 'all';

  @IsOptional()
  @IsIn(['dashboard', 'landing_top', 'mobile_home'])
  placement?: 'dashboard' | 'landing_top' | 'mobile_home';
}

export class CreateBannerDto {
  @IsIn(['web', 'mobile', 'all'])
  platform: 'web' | 'mobile' | 'all';

  @IsIn(['dashboard', 'landing_top', 'mobile_home'])
  placement: 'dashboard' | 'landing_top' | 'mobile_home';

  @IsIn(['info', 'success', 'warning', 'promo'])
  variant: 'info' | 'success' | 'warning' | 'promo';

  @IsString()
  @Length(1, 300)
  title: string;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(5000)
  body?: string | null;

  @IsOptionalNullable()
  @IsSafeUrl({ relative: false, mailto: false, appScheme: false })
  imageUrl?: string | null;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string | null;

  @IsOptionalNullable()
  @IsSafeUrl()
  ctaUrl?: string | null;

  @IsOptionalNullable()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptionalNullable()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptionalNonNull()
  @IsBoolean()
  isActive?: boolean;

  @IsOptionalNonNull()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class UpdateBannerDto {
  @IsOptionalNonNull()
  @IsIn(['web', 'mobile', 'all'])
  platform?: 'web' | 'mobile' | 'all';

  @IsOptionalNonNull()
  @IsIn(['dashboard', 'landing_top', 'mobile_home'])
  placement?: 'dashboard' | 'landing_top' | 'mobile_home';

  @IsOptionalNonNull()
  @IsIn(['info', 'success', 'warning', 'promo'])
  variant?: 'info' | 'success' | 'warning' | 'promo';

  @IsOptionalNonNull()
  @IsString()
  @Length(1, 300)
  title?: string;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(5000)
  body?: string | null;

  @IsOptionalNullable()
  @IsSafeUrl({ relative: false, mailto: false, appScheme: false })
  imageUrl?: string | null;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string | null;

  @IsOptionalNullable()
  @IsSafeUrl()
  ctaUrl?: string | null;

  @IsOptionalNullable()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptionalNullable()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptionalNonNull()
  @IsBoolean()
  isActive?: boolean;

  @IsOptionalNonNull()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

// ---------- plans ----------
export class PlanLimitsDto {
  @IsOptionalNullable()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  meetingsPerMonth: number | null;

  @IsOptionalNullable()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  aiQueriesPerDay: number | null;

  @IsOptionalNullable()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  uploadMinutesPerMonth: number | null;
}

export class CreatePlanDto {
  @Matches(SLUG_RE)
  @MaxLength(60)
  slug: string;

  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  priceMonthly: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  priceYearly: number;

  @Matches(/^[A-Z]{3}$/, { message: 'currency must be an ISO 4217 code like USD' })
  currency: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  features: string[];

  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits: PlanLimitsDto;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string | null;

  @IsOptionalNonNull()
  @IsBoolean()
  isPopular?: boolean;

  @IsOptionalNonNull()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptionalNonNull()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptionalNonNull()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePlanDto {
  @IsOptionalNonNull()
  @Matches(SLUG_RE)
  @MaxLength(60)
  slug?: string;

  @IsOptionalNonNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptionalNonNull()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  priceMonthly?: number;

  @IsOptionalNonNull()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  priceYearly?: number;

  @IsOptionalNonNull()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptionalNonNull()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  features?: string[];

  @IsOptionalNonNull()
  @ValidateNested()
  @Type(() => PlanLimitsDto)
  limits?: PlanLimitsDto;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string | null;

  @IsOptionalNonNull()
  @IsBoolean()
  isPopular?: boolean;

  @IsOptionalNonNull()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptionalNonNull()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;

  @IsOptionalNonNull()
  @IsBoolean()
  isActive?: boolean;
}

// ---------- media ----------
export class MediaQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,40}$/)
  folder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class UploadMediaDto {
  @IsOptional()
  @Matches(/^[a-z0-9][a-z0-9_-]{0,40}$/, { message: 'folder must be a short lowercase key' })
  folder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;
}

export class UpdateMediaDto {
  @IsOptionalNullable()
  @IsString()
  @MaxLength(300)
  alt: string | null;
}

// ---------- AI ----------
export class PutPromptDto {
  @IsString()
  @Length(1, 50_000)
  content: string;

  @IsOptionalNonNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

export class AiTestDto {
  @IsString()
  @Length(1, 400_000)
  transcript: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;
}

// ---------- templates ----------
export class PutTemplateDto {
  @IsOptionalNonNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsString()
  @Length(1, 300)
  titleTemplate: string;

  @IsString()
  @Length(0, 5000)
  bodyTemplate: string;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(300)
  emailSubject?: string | null;

  @IsOptionalNullable()
  @IsString()
  @MaxLength(20_000)
  emailBody?: string | null;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(3)
  @IsIn(REMINDER_CHANNELS, { each: true })
  channels: ReminderChannel[];

  @IsBoolean()
  isActive: boolean;
}

// ---------- broadcasts ----------
export class BroadcastAudienceDto {
  @IsIn(['all', 'users', 'plan'])
  type: 'all' | 'users' | 'plan';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10_000)
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsUUID()
  planId?: string;
}

export class CreateBroadcastDto {
  @IsString()
  @Length(1, 300)
  title: string;

  @IsString()
  @Length(1, 5000)
  body: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(REMINDER_CHANNELS, { each: true })
  channels: ReminderChannel[];

  @ValidateNested()
  @Type(() => BroadcastAudienceDto)
  audience: BroadcastAudienceDto;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

// ---------- admins / audit / system ----------
export class CreateAdminDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @Length(1, 120)
  name: string;

  @IsIn(ADMIN_ROLES)
  role: AdminRole;

  @IsString()
  @MinLength(PASSWORD.min)
  @MaxLength(PASSWORD.max)
  password: string;
}

export class UpdateAdminDto {
  @IsOptionalNonNull()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptionalNonNull()
  @IsIn(ADMIN_ROLES)
  role?: AdminRole;

  @IsOptionalNonNull()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';

  @IsOptionalNonNull()
  @IsString()
  @MinLength(PASSWORD.min)
  @MaxLength(PASSWORD.max)
  password?: string;
}

export class AuditLogsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Matches(/^[a-z_]{1,40}$/)
  entity?: string;

  @IsOptional()
  @IsUUID()
  adminId?: string;
}

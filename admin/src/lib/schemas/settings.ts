import { z } from 'zod';

import type {
  AiSettings,
  AppMeta,
  BotSettings,
  Branding,
  Features,
  NotificationSettings,
  RecallBotSettings,
  Seo,
  SettingKey,
  Theme,
} from '@/lib/api/types';

import {
  absoluteImageUrl,
  compareSemver,
  email,
  fontFamily,
  hexColor,
  intRange,
  optionalHttpUrl,
  requiredString,
  semver,
} from './common';

/**
 * Each schema is identical to `SettingValue[key]` in the contract (checked with `satisfies`) and mirrors the
 * API's limits (backend/src/modules/content/settings.schemas.ts), tightened where the admin rules require it
 * (6-digit hex colours, font-name pattern, URL allow-list).
 */

export const brandingSchema = z.object({
  appName: requiredString('App name').max(60, 'Keep the app name under 60 characters'),
  tagline: z.string().trim().max(200, 'Keep the tagline under 200 characters'),
  logoUrl: absoluteImageUrl,
  logoDarkUrl: absoluteImageUrl,
  iconUrl: absoluteImageUrl,
  faviconUrl: absoluteImageUrl,
  supportEmail: email,
  companyName: requiredString('Company name').max(120, 'Keep the company name under 120 characters'),
}) satisfies z.ZodType<Branding>;

export const themeSchema = z.object({
  primaryColor: hexColor,
  primaryForeground: hexColor,
  accentColor: hexColor,
  sidebarBackground: hexColor,
  sidebarForeground: hexColor,
  radius: intRange(0, 48, 'Radius'),
  fontFamily,
  defaultMode: z.enum(['light', 'dark', 'system']),
}) satisfies z.ZodType<Theme>;

export const featuresSchema = z.object({
  askAi: z.boolean(),
  analytics: z.boolean(),
  reminders: z.boolean(),
  actionItems: z.boolean(),
  calendarSync: z.boolean(),
  meetingUpload: z.boolean(),
  pushNotifications: z.boolean(),
  signupsEnabled: z.boolean(),
}) satisfies z.ZodType<Features>;

export const appMetaSchema = z
  .object({
    maintenanceMode: z.boolean(),
    maintenanceMessage: z.string().trim().max(500, 'Keep the message under 500 characters'),
    minAppVersion: semver,
    latestAppVersion: semver,
    androidStoreUrl: optionalHttpUrl,
    iosStoreUrl: optionalHttpUrl,
  })
  .superRefine((value, ctx) => {
    if (
      semverOk(value.minAppVersion) &&
      semverOk(value.latestAppVersion) &&
      compareSemver(value.minAppVersion, value.latestAppVersion) > 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['minAppVersion'],
        message: 'Minimum version cannot be newer than the latest version',
      });
    }
    if (value.maintenanceMode && value.maintenanceMessage.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['maintenanceMessage'],
        message: 'Add a message to show while maintenance mode is on',
      });
    }
  }) satisfies z.ZodType<AppMeta>;

function semverOk(v: string): boolean {
  return semver.safeParse(v).success;
}

export const seoSchema = z.object({
  title: requiredString('Title').max(200, 'Keep the title under 200 characters'),
  description: z.string().trim().max(500, 'Keep the description under 500 characters'),
  ogImageUrl: z.union([z.literal(''), absoluteImageUrl]),
  keywords: z
    .array(z.string().trim().min(1).max(60, 'Keep each keyword under 60 characters'))
    .max(50, 'Use at most 50 keywords'),
}) satisfies z.ZodType<Seo>;

export const aiSettingsSchema = z.object({
  model: requiredString('Model').max(100),
  embeddingModel: requiredString('Embedding model').max(100),
  temperature: z
    .number({ error: 'Temperature must be a number' })
    .min(0, 'Temperature must be between 0 and 2')
    .max(2, 'Temperature must be between 0 and 2'),
  maxOutputTokens: intRange(256, 65536, 'Max output tokens'),
  outputLanguage: requiredString('Output language').max(60),
  enableEmbeddings: z.boolean(),
}) satisfies z.ZodType<AiSettings>;

/** Meet DOM selector or `|`-separated texts: single line, ≤ 2000 characters. */
export const selectorValue = z
  .string()
  .trim()
  .min(1, 'Selector is required')
  .max(2000, 'Keep selectors under 2000 characters')
  .refine((v) => !/[\r\n]/.test(v), 'Selectors must be on a single line');

export const recallBotSettingsSchema = z.object({
  transcription: z.enum(['recallai_streaming', 'meeting_captions']),
  languageCode: z
    .string()
    .trim()
    .regex(/^(auto|[a-z]{2,3}(?:[_-][A-Za-z]{2,4})?)$/, 'Use "auto" or a language code like en, en_us or de'),
  deleteMediaAfterImport: z.boolean(),
}) satisfies z.ZodType<RecallBotSettings>;

export const botSettingsSchema = z.object({
  provider: z.enum(['self_hosted', 'recall']),
  recall: recallBotSettingsSchema,
  botName: requiredString('Bot name').max(60, 'Keep the bot name under 60 characters'),
  joinBeforeMinutes: intRange(0, 30, 'Join before'),
  waitingRoomTimeoutMinutes: intRange(1, 60, 'Waiting room timeout'),
  maxDurationMinutes: intRange(5, 600, 'Max duration'),
  leaveWhenAloneMinutes: intRange(0, 120, 'Leave when alone'),
  autoJoinDefault: z.enum(['all', 'owned', 'none']),
  headless: z.boolean(),
  selectors: z.record(z.string(), selectorValue),
}) satisfies z.ZodType<BotSettings>;

export const notificationSettingsSchema = z.object({
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  fromName: requiredString('From name').max(100, 'Keep the sender name under 100 characters'),
  fromEmail: email,
  defaultMeetingReminderMinutes: intRange(0, 1440, 'Default reminder'),
  digestEnabled: z.boolean(),
}) satisfies z.ZodType<NotificationSettings>;

export const settingSchemas = {
  branding: brandingSchema,
  theme: themeSchema,
  features: featuresSchema,
  app: appMetaSchema,
  seo: seoSchema,
  ai: aiSettingsSchema,
  bot: botSettingsSchema,
  notifications: notificationSettingsSchema,
} satisfies Record<SettingKey, z.ZodType>;

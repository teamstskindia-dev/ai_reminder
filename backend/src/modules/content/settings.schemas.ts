import { z } from 'zod';
import { zFontFamily, zHexColor, zHttpsUrl } from '../../common/validation/safe-url';

const hex = zHexColor();
const imageUrl = zHttpsUrl();
const storeUrl = z.union([z.literal(''), zHttpsUrl()]);
const semver = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/, 'must be a semver version like 1.2.3');
const text = (max: number) => z.string().trim().max(max);
const singleLine = (max: number) =>
  z
    .string()
    .max(max)
    .refine((v) => !/[\r\n]/.test(v), 'must be a single line');

export const brandingSchema = z
  .object({
    appName: text(60).min(1),
    tagline: text(200),
    logoUrl: imageUrl,
    logoDarkUrl: imageUrl,
    iconUrl: imageUrl,
    faviconUrl: imageUrl,
    supportEmail: z.email(),
    companyName: text(120),
  })
  .strict();

export const themeSchema = z
  .object({
    primaryColor: hex,
    primaryForeground: hex,
    accentColor: hex,
    sidebarBackground: hex,
    sidebarForeground: hex,
    radius: z.number().min(0).max(48),
    fontFamily: zFontFamily(),
    defaultMode: z.enum(['light', 'dark', 'system']),
  })
  .strict();

export const featuresSchema = z
  .object({
    askAi: z.boolean(),
    analytics: z.boolean(),
    reminders: z.boolean(),
    actionItems: z.boolean(),
    calendarSync: z.boolean(),
    meetingUpload: z.boolean(),
    pushNotifications: z.boolean(),
    signupsEnabled: z.boolean(),
  })
  .strict();

export const appMetaSchema = z
  .object({
    maintenanceMode: z.boolean(),
    maintenanceMessage: text(500),
    minAppVersion: semver,
    latestAppVersion: semver,
    androidStoreUrl: storeUrl,
    iosStoreUrl: storeUrl,
  })
  .strict();

export const seoSchema = z
  .object({
    title: text(200).min(1),
    description: text(500),
    ogImageUrl: z.union([z.literal(''), imageUrl]),
    keywords: z.array(text(60).min(1)).max(50),
  })
  .strict();

/** Gemini 1.x / 2.x generation models are deprecated: refuse them so a stale name cannot be configured again. */
const DEPRECATED_GEMINI_MODEL = /^(models\/)?gemini-[12](\.|-|$)/i;

export const aiSchema = z
  .object({
    model: text(100)
      .min(1)
      .refine((m) => !DEPRECATED_GEMINI_MODEL.test(m), {
        message: 'Gemini 1.x/2.x models are deprecated; use gemini-3.5-flash or newer',
      }),
    embeddingModel: text(100).min(1),
    temperature: z.number().min(0).max(2),
    maxOutputTokens: z.number().int().min(256).max(65536),
    outputLanguage: text(60).min(1),
    enableEmbeddings: z.boolean(),
  })
  .strict();

/** Who runs the notetaker: the self-hosted Chromium runner (bot container) or Recall.ai's managed bots. */
export const BOT_PROVIDERS = ['self_hosted', 'recall'] as const;
export type BotProvider = (typeof BOT_PROVIDERS)[number];

/** `auto` (Recall.ai detects the language) or a code such as en, en_us, de, hi, pt-BR. */
const RECALL_LANGUAGE_RE = /^(auto|[a-z]{2,3}(?:[_-][A-Za-z]{2,4})?)$/;

export const RECALL_SETTINGS_DEFAULTS = {
  transcription: 'recallai_streaming',
  languageCode: 'auto',
  deleteMediaAfterImport: true,
} as const;

export const recallBotSchema = z
  .object({
    /** recallai_streaming: Recall.ai's own speech-to-text (paid). meeting_captions: Google Meet captions (free, no auto language). */
    transcription: z.enum(['recallai_streaming', 'meeting_captions']),
    languageCode: z.string().regex(RECALL_LANGUAGE_RE, 'must be "auto" or a language code like en, en_us or de'),
    /** Delete the recording and transcript from Recall.ai once Remi has imported the transcript. */
    deleteMediaAfterImport: z.boolean(),
  })
  .strict();

export const botSchema = z
  .object({
    // Defaults keep bot values saved before providers existed valid.
    provider: z.enum(BOT_PROVIDERS).default('self_hosted'),
    recall: recallBotSchema.default({ ...RECALL_SETTINGS_DEFAULTS }),
    botName: singleLine(60).trim().min(1),
    joinBeforeMinutes: z.number().int().min(0).max(30),
    waitingRoomTimeoutMinutes: z.number().int().min(1).max(60),
    maxDurationMinutes: z.number().int().min(5).max(600),
    leaveWhenAloneMinutes: z.number().int().min(0).max(120),
    autoJoinDefault: z.enum(['all', 'owned', 'none']),
    headless: z.boolean(),
    selectors: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,63}$/, 'invalid selector key'), singleLine(1000)),
  })
  .strict();

export const notificationsSchema = z
  .object({
    pushEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    fromName: text(100).min(1),
    fromEmail: z.email(),
    defaultMeetingReminderMinutes: z.number().int().min(0).max(1440),
    digestEnabled: z.boolean(),
  })
  .strict();

export const SETTINGS_SCHEMAS = {
  branding: brandingSchema,
  theme: themeSchema,
  features: featuresSchema,
  app: appMetaSchema,
  seo: seoSchema,
  ai: aiSchema,
  bot: botSchema,
  notifications: notificationsSchema,
} as const;

export type SettingKey = keyof typeof SETTINGS_SCHEMAS;
export type SettingValue = { [K in SettingKey]: z.output<(typeof SETTINGS_SCHEMAS)[K]> };
export type BotSettings = SettingValue['bot'];
export type RecallBotSettings = BotSettings['recall'];
export type AiSettings = SettingValue['ai'];
export type NotificationSettings = SettingValue['notifications'];

export const SETTING_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingKey[];
export const PUBLIC_SETTING_KEYS: SettingKey[] = ['branding', 'theme', 'features', 'app', 'seo'];
/** Keys an `editor` may change; everything else needs `admin`. */
export const EDITOR_SETTING_KEYS: SettingKey[] = ['branding', 'theme', 'seo'];

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS_SCHEMAS, key);
}

export type SettingValidation<K extends SettingKey> =
  { success: true; value: SettingValue[K] } | { success: false; errors: { field: string; messages: string[] }[] };

export function validateSetting<K extends SettingKey>(key: K, value: unknown): SettingValidation<K> {
  const result = SETTINGS_SCHEMAS[key].safeParse(value);
  if (result.success) return { success: true, value: result.data as SettingValue[K] };
  const byField = new Map<string, string[]>();
  for (const issue of result.error.issues) {
    const field = ['value', ...issue.path.map(String)].join('.');
    byField.set(field, [...(byField.get(field) ?? []), issue.message]);
  }
  return { success: false, errors: [...byField.entries()].map(([field, messages]) => ({ field, messages })) };
}

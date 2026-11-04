import { SETTINGS_DEFAULTS } from './settings.defaults';
import {
  EDITOR_SETTING_KEYS,
  isSettingKey,
  PUBLIC_SETTING_KEYS,
  SETTING_KEYS,
  SettingKey,
  validateSetting,
} from './settings.schemas';

/** Exact `app_settings` values from prisma/seed.sql. */
const SEED: Record<SettingKey, unknown> = {
  branding: {
    appName: 'Remi',
    tagline: 'Your AI meeting assistant that never forgets',
    logoUrl:
      'https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/o_0/w_240,h_64,c_scale/l_text:Arial_44_bold:Remi,co_rgb:5B4FE9,o_100/sample.png',
    logoDarkUrl:
      'https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/o_0/w_240,h_64,c_scale/l_text:Arial_44_bold:Remi,co_white,o_100/sample.png',
    iconUrl:
      'https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/e_colorize,co_rgb:5B4FE9/w_192,h_192,c_scale/l_text:Arial_112_bold:R,co_white/r_36/sample.png',
    faviconUrl:
      'https://res.cloudinary.com/demo/image/upload/c_crop,w_1,h_1/e_colorize,co_rgb:5B4FE9/w_64,h_64,c_scale/l_text:Arial_40_bold:R,co_white/r_12/sample.png',
    supportEmail: 'support@remi.example.com',
    companyName: 'Remi Labs',
  },
  theme: {
    primaryColor: '#5B4FE9',
    primaryForeground: '#FFFFFF',
    accentColor: '#22C3A6',
    sidebarBackground: '#0F0E1A',
    sidebarForeground: '#E7E6F3',
    radius: 10,
    fontFamily: 'Inter',
    defaultMode: 'light',
  },
  features: {
    askAi: true,
    analytics: true,
    reminders: true,
    actionItems: true,
    calendarSync: true,
    meetingUpload: true,
    pushNotifications: true,
    signupsEnabled: true,
  },
  app: {
    maintenanceMode: false,
    maintenanceMessage: 'We are upgrading Remi. Back in a few minutes.',
    minAppVersion: '1.0.0',
    latestAppVersion: '1.0.0',
    androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.remi.app',
    iosStoreUrl: '',
  },
  seo: {
    title: 'Remi — AI meeting notes, action items and reminders',
    description:
      'Remi joins your Google Meet calls, writes the notes, tracks every commitment and reminds you before things are due.',
    ogImageUrl: 'https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,h_630/cld-sample-4.jpg',
    keywords: ['ai meeting assistant', 'meeting notes', 'google meet notetaker', 'action items', 'reminders'],
  },
  ai: {
    model: 'gemini-3.5-flash',
    embeddingModel: 'gemini-embedding-001',
    temperature: 0.3,
    maxOutputTokens: 8192,
    outputLanguage: 'auto',
    enableEmbeddings: true,
  },
  bot: {
    botName: 'Remi Notetaker',
    joinBeforeMinutes: 1,
    waitingRoomTimeoutMinutes: 10,
    maxDurationMinutes: 180,
    leaveWhenAloneMinutes: 2,
    autoJoinDefault: 'all',
    headless: false,
    selectors: {
      nameInput: "input[aria-label='Your name'], input[placeholder='Your name']",
      joinButtonText: 'Ask to join|Join now|Join anyway',
      micOffButton: "[role='button'][aria-label*='Turn off microphone'], button[aria-label*='Turn off microphone']",
      camOffButton: "[role='button'][aria-label*='Turn off camera'], button[aria-label*='Turn off camera']",
      dismissButtonText: 'Got it|Dismiss|Continue without microphone and camera',
      captionsButton: "button[aria-label*='Turn on captions']",
      captionsRegion: "div[role='region'][aria-label='Captions']",
      captionBlock: "div[role='region'][aria-label='Captions'] > div > div",
      captionSpeaker: '.NWpY1d, .zs7s8d',
      captionText: '.ygicle, .iTTPOb',
      leaveButton: "button[aria-label='Leave call']",
      participantCount: '[data-avatar-count], .uGOf1d',
      inCallIndicator: "button[aria-label='Leave call']",
      waitingRoomText:
        "Asking to join|Please wait until a meeting host brings you into the call|You'll join the call when someone lets you in",
      deniedText: "You can't join this video call|You can't join this call|Someone in the call denied your request|You've been removed",
      endedText: "You left the meeting|The call has ended|Return to home screen|You've been removed from the meeting",
    },
  },
  notifications: {
    pushEnabled: true,
    emailEnabled: false,
    fromName: 'Remi',
    fromEmail: 'no-reply@remi.example.com',
    defaultMeetingReminderMinutes: 10,
    digestEnabled: true,
  },
};

function fieldsOf(result: ReturnType<typeof validateSetting>): string[] {
  return result.success ? [] : result.errors.map((e) => e.field);
}

describe('settings schemas', () => {
  it('has the eight contract keys', () => {
    expect([...SETTING_KEYS].sort()).toEqual(
      ['ai', 'app', 'bot', 'branding', 'features', 'notifications', 'seo', 'theme'].sort(),
    );
  });

  it.each(SETTING_KEYS)('default for %s validates', (key) => {
    const result = validateSetting(key, SETTINGS_DEFAULTS[key]);
    expect(result.success).toBe(true);
  });

  it.each(SETTING_KEYS)('seed.sql value for %s validates and round-trips', (key) => {
    const result = validateSetting(key, SEED[key]);
    expect(result).toEqual({ success: true, value: SEED[key] });
  });

  it('defaults match the seed values exactly', () => {
    expect(SETTINGS_DEFAULTS).toEqual(SEED);
  });

  it('rejects a non-hex colour', () => {
    const result = validateSetting('theme', {
      ...(SEED.theme as object),
      primaryColor: 'red',
    });
    expect(fieldsOf(result)).toEqual(['value.primaryColor']);
  });

  it('accepts only 6-digit hex colours (values are injected into CSS)', () => {
    for (const c of ['#A1B2C3', '#ffffff']) {
      expect(validateSetting('theme', { ...(SEED.theme as object), accentColor: c }).success).toBe(true);
    }
    for (const c of ['#fff', '#A1B2C3FF', 'red', '#12345G', '#123456;}body{x:y']) {
      expect(validateSetting('theme', { ...(SEED.theme as object), accentColor: c }).success).toBe(false);
    }
  });

  it('rejects unsafe font families and URLs', () => {
    expect(validateSetting('theme', { ...(SEED.theme as object), fontFamily: "Inter'; } *{x" }).success).toBe(false);
    for (const logoUrl of [
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'http://example.com/a.png',
      '//evil.com/x',
    ]) {
      expect(validateSetting('branding', { ...(SEED.branding as object), logoUrl }).success).toBe(false);
    }
  });

  it('rejects multi-line or oversized bot selectors', () => {
    const bot = SEED.bot as { selectors: Record<string, string> };
    const selectors = { ...bot.selectors, leaveButton: "button\n[aria-label='x']" };
    expect(validateSetting('bot', { ...(SEED.bot as object), selectors }).success).toBe(false);
    const big = { ...bot.selectors, leaveButton: 'x'.repeat(1001) };
    expect(validateSetting('bot', { ...(SEED.bot as object), selectors: big }).success).toBe(false);
  });

  it('rejects a temperature above 2', () => {
    const result = validateSetting('ai', {
      ...(SEED.ai as object),
      temperature: 3,
    });
    expect(fieldsOf(result)).toEqual(['value.temperature']);
  });

  it('rejects unknown keys (strict objects)', () => {
    const result = validateSetting('features', {
      ...(SEED.features as object),
      betaThing: true,
    });
    expect(result.success).toBe(false);
    expect(fieldsOf(result)).toEqual(['value']);
    if (!result.success) expect(result.errors[0].messages.join(' ')).toContain('betaThing');
  });

  it('rejects a missing field', () => {
    const branding = { ...(SEED.branding as Record<string, unknown>) };
    delete branding.appName;
    expect(fieldsOf(validateSetting('branding', branding))).toEqual(['value.appName']);
  });

  it('rejects a bad email', () => {
    const result = validateSetting('notifications', {
      ...(SEED.notifications as object),
      fromEmail: 'nope',
    });
    expect(fieldsOf(result)).toEqual(['value.fromEmail']);
  });

  it('rejects a bad semver', () => {
    const result = validateSetting('app', {
      ...(SEED.app as object),
      minAppVersion: '1.0',
    });
    expect(fieldsOf(result)).toEqual(['value.minAppVersion']);
  });

  it('rejects an invalid autoJoinDefault', () => {
    const result = validateSetting('bot', {
      ...(SEED.bot as object),
      autoJoinDefault: 'some',
    });
    expect(fieldsOf(result)).toEqual(['value.autoJoinDefault']);
  });

  it('reports nested selector paths', () => {
    const bot = SEED.bot as { selectors: Record<string, unknown> };
    const result = validateSetting('bot', {
      ...bot,
      selectors: { ...bot.selectors, nameInput: 42 },
    });
    expect(fieldsOf(result)).toEqual(['value.selectors.nameInput']);
  });

  it('groups several messages for several fields', () => {
    const result = validateSetting('ai', {
      ...(SEED.ai as object),
      temperature: -1,
      maxOutputTokens: 1.5,
    });
    expect(fieldsOf(result).sort()).toEqual(['value.maxOutputTokens', 'value.temperature']);
  });

  it('rejects a non-object value', () => {
    expect(validateSetting('seo', 'nope').success).toBe(false);
    expect(validateSetting('seo', null).success).toBe(false);
  });

  it('isSettingKey only accepts the eight keys', () => {
    expect(isSettingKey('branding')).toBe(true);
    expect(isSettingKey('notifications')).toBe(true);
    expect(isSettingKey('toString')).toBe(false);
    expect(isSettingKey('__proto__')).toBe(false);
    expect(isSettingKey('unknown')).toBe(false);
  });

  it('editor may change only branding, theme and seo', () => {
    expect([...EDITOR_SETTING_KEYS].sort()).toEqual(['branding', 'seo', 'theme']);
  });

  it('public keys are the five client-visible settings', () => {
    expect([...PUBLIC_SETTING_KEYS].sort()).toEqual(['app', 'branding', 'features', 'seo', 'theme']);
  });

  describe('ai.model rejects deprecated Gemini generations', () => {
    const withModel = (model: string) => validateSetting('ai', { ...SETTINGS_DEFAULTS.ai, model });

    it.each([
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'models/gemini-2.5-flash-lite',
    ])('rejects %s', (model) => {
      const result = withModel(model);
      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).toContain('deprecated');
    });

    it.each(['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-4-argon'])(
      'accepts %s',
      (model) => {
        expect(withModel(model).success).toBe(true);
      },
    );
  });
});

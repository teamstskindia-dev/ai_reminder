import type { SettingValue } from './settings.schemas';

/**
 * Fallback values (identical to supabase/seed.sql) used when a row is missing or invalid,
 * so a half-seeded database never takes the platform down.
 */
export const SETTINGS_DEFAULTS: SettingValue = {
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

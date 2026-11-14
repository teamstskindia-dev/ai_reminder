import type { OnboardingSlideContent, PublicConfig, Section } from '@/api/types';

/**
 * Bundled fallback used only when the API is unreachable on the very first launch (no cached config).
 * Mirrors backend/supabase/seed.sql so the app still opens and looks right. The live config from
 * GET /public/config always wins as soon as it is available.
 */
export const BUNDLED_CONFIG_VERSION = 'bundled-defaults';

export const DEFAULT_CONFIG: PublicConfig = {
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
  navigation: {
    header: [],
    footer: [],
    sidebar: [],
    mobile_tab: [
      { id: 'default-tab-home', label: 'Home', href: 'home', icon: 'home', groupLabel: null, isExternal: false, sortOrder: 0 },
      { id: 'default-tab-meetings', label: 'Meetings', href: 'meetings', icon: 'meetings', groupLabel: null, isExternal: false, sortOrder: 1 },
      { id: 'default-tab-reminders', label: 'Reminders', href: 'reminders', icon: 'reminders', groupLabel: null, isExternal: false, sortOrder: 2 },
      { id: 'default-tab-ask', label: 'Ask', href: 'ask', icon: 'ask-ai', groupLabel: null, isExternal: false, sortOrder: 3 },
      { id: 'default-tab-profile', label: 'Profile', href: 'profile', icon: 'profile', groupLabel: null, isExternal: false, sortOrder: 4 },
    ],
  },
  banners: [
    {
      id: 'default-banner-ask',
      placement: 'mobile_home',
      variant: 'info',
      title: 'Tip: ask Remi anything',
      body: 'Try "What did I promise this week?" in the Ask tab.',
      imageUrl: null,
      ctaLabel: 'Open Ask',
      ctaUrl: 'remi://ask',
    },
  ],
  version: BUNDLED_CONFIG_VERSION,
};

/** Seed onboarding slides, used when /public/sections can't be fetched. */
export const DEFAULT_ONBOARDING: Section<OnboardingSlideContent>[] = [
  {
    id: 'default-slide-1',
    page: 'mobile_onboarding',
    type: 'onboarding_slide',
    sortOrder: 0,
    content: {
      title: 'Your friend who remembers everything',
      description: "Talk, type or record. I keep the important bits so you don't have to.",
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/c_fill,w_800,h_800/cld-sample-4.jpg',
      backgroundColor: '#EEF0FF',
    },
  },
  {
    id: 'default-slide-2',
    page: 'mobile_onboarding',
    type: 'onboarding_slide',
    sortOrder: 1,
    content: {
      title: 'Never drop a promise',
      description: 'I pull reminders and to-dos out of your conversations, meetings and chats.',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/c_fill,w_800,h_800/samples/people/kitchen-bar.jpg',
      backgroundColor: '#E8FBF6',
    },
  },
  {
    id: 'default-slide-3',
    page: 'mobile_onboarding',
    type: 'onboarding_slide',
    sortOrder: 2,
    content: {
      title: 'Gets you, a little more every day',
      description: 'English, Hinglish or a mix: I learn your style and grow with you. You stay in control.',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/c_fill,w_800,h_800/samples/people/jazz.jpg',
      backgroundColor: '#FFF4E8',
    },
  },
];

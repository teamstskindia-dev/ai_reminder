import type { Branding, Theme } from '@/lib/api/types';

/** Seed defaults (backend/supabase/seed.sql) used when a preview needs a value that is not loaded yet. */
export const DEFAULT_THEME: Theme = {
  primaryColor: '#5B4FE9',
  primaryForeground: '#FFFFFF',
  accentColor: '#22C3A6',
  sidebarBackground: '#0F0E1A',
  sidebarForeground: '#E7E6F3',
  radius: 10,
  fontFamily: 'Inter',
  defaultMode: 'light',
};

export const DEFAULT_BRANDING: Branding = {
  appName: 'Remi',
  tagline: 'Your AI meeting assistant that never forgets',
  logoUrl: '',
  logoDarkUrl: '',
  iconUrl: '',
  faviconUrl: '',
  supportEmail: 'support@remi.example.com',
  companyName: 'Remi Labs',
};

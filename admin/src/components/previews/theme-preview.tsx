'use client';

import { AlarmClock, Bell, Check, House, MessageSquareText, Moon, Search, Sun, User, Video } from 'lucide-react';
import { useState } from 'react';

import { RemoteImage } from '@/components/common/remote-image';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Branding, Theme } from '@/lib/api/types';

import { GoogleFontLink } from './google-font';
import { themeVars } from './use-preview-config';

type PreviewMode = 'light' | 'dark';

const SURFACES: Record<PreviewMode, Record<string, string>> = {
  light: {
    '--pv-bg': '#F6F6F9',
    '--pv-card': '#FFFFFF',
    '--pv-fg': '#111118',
    '--pv-muted': '#6B6B78',
    '--pv-border': '#E4E4EA',
    '--pv-track': '#EDEDF2',
  },
  dark: {
    '--pv-bg': '#0B0B10',
    '--pv-card': '#17171F',
    '--pv-fg': '#F4F4F6',
    '--pv-muted': '#9A9AA8',
    '--pv-border': '#2A2A35',
    '--pv-track': '#26262F',
  },
};

const r = 'var(--pv-radius)';

function ScoreRing({ score }: { score: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 64 64" className="size-16" role="img" aria-label={`Meeting score ${score}`}>
      <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--pv-track)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke="var(--pv-accent)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--pv-fg)">
        {score}
      </text>
    </svg>
  );
}

function WebAppPreview({ branding }: { branding: Branding }) {
  const nav = [
    { label: 'Home', icon: House, active: true },
    { label: 'Reports', icon: Video },
    { label: 'Reminders', icon: AlarmClock },
    { label: 'Ask Remi', icon: MessageSquareText },
  ];
  return (
    <div
      className="flex h-80 overflow-hidden border text-[11px]"
      style={{ background: 'var(--pv-bg)', color: 'var(--pv-fg)', borderColor: 'var(--pv-border)', borderRadius: r }}
    >
      <aside className="flex w-36 shrink-0 flex-col gap-3 p-3" style={{ background: 'var(--pv-sidebar)', color: 'var(--pv-sidebar-fg)' }}>
        <RemoteImage
          src={branding.logoDarkUrl}
          alt={`${branding.appName} logo`}
          fit="contain"
          position="left"
          className="h-6 w-24"
          fallback={<span className="text-sm font-bold">{branding.appName}</span>}
        />
        <nav className="space-y-1">
          {nav.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2 px-2 py-1.5"
              style={
                item.active
                  ? { background: 'var(--pv-primary)', color: 'var(--pv-primary-fg)', borderRadius: r }
                  : { opacity: 0.8 }
              }
            >
              <item.icon className="size-3.5" aria-hidden />
              {item.label}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--pv-border)', background: 'var(--pv-card)' }}>
          <div
            className="flex flex-1 items-center gap-1.5 border px-2 py-1"
            style={{ borderColor: 'var(--pv-border)', color: 'var(--pv-muted)', borderRadius: r }}
          >
            <Search className="size-3" aria-hidden /> Search meetings
          </div>
          <Bell className="size-3.5" style={{ color: 'var(--pv-muted)' }} aria-hidden />
          <span className="size-5 rounded-full" style={{ background: 'var(--pv-accent)' }} />
        </div>
        <div className="flex-1 space-y-3 overflow-hidden p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Good morning, Priya</p>
            <div className="flex gap-1.5">
              <span className="border px-2 py-1" style={{ borderColor: 'var(--pv-border)', borderRadius: r }}>
                Upload
              </span>
              <span className="px-2 py-1 font-medium" style={{ background: 'var(--pv-primary)', color: 'var(--pv-primary-fg)', borderRadius: r }}>
                Add meeting
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 border p-2" style={{ background: 'var(--pv-card)', borderColor: 'var(--pv-border)', borderRadius: r }}>
              <ScoreRing score={82} />
              <div>
                <p className="font-semibold">Weekly sync</p>
                <p style={{ color: 'var(--pv-muted)' }}>Meeting score</p>
              </div>
            </div>
            <div className="space-y-1.5 border p-2" style={{ background: 'var(--pv-card)', borderColor: 'var(--pv-border)', borderRadius: r }}>
              <p className="font-semibold">Action items</p>
              <div className="flex items-center gap-1.5">
                <span
                  className="flex size-3.5 items-center justify-center"
                  style={{ background: 'var(--pv-primary)', color: 'var(--pv-primary-fg)', borderRadius: 4 }}
                >
                  <Check className="size-2.5" aria-hidden />
                </span>
                <span className="line-through" style={{ color: 'var(--pv-muted)' }}>
                  Send the deck
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3.5 border" style={{ borderColor: 'var(--pv-muted)', borderRadius: 4 }} />
                Book design review
              </div>
            </div>
          </div>
          <div className="border p-2" style={{ background: 'var(--pv-card)', borderColor: 'var(--pv-border)', borderRadius: r }}>
            <p className="font-semibold">Report ready</p>
            <p style={{ color: 'var(--pv-muted)' }}>3 action items · 2 decisions · positive sentiment</p>
            <span className="mt-1 inline-block font-medium" style={{ color: 'var(--pv-primary)' }}>
              Open report →
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhonePreview({ branding }: { branding: Branding }) {
  const tabs = [
    { label: 'Home', icon: House, active: true },
    { label: 'Meetings', icon: Video },
    { label: 'Reminders', icon: AlarmClock },
    { label: 'Ask', icon: MessageSquareText },
    { label: 'Profile', icon: User },
  ];
  return (
    <div className="mx-auto w-[220px] rounded-[2.25rem] border-[6px] border-neutral-900 bg-neutral-900 shadow-lg">
      <div
        className="flex h-[420px] flex-col overflow-hidden rounded-[1.8rem] text-[10px]"
        style={{ background: 'var(--pv-bg)', color: 'var(--pv-fg)' }}
      >
        <div className="flex justify-center pt-1.5">
          <span className="h-3.5 w-16 rounded-full bg-neutral-900" />
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5">
            <RemoteImage src={branding.iconUrl} alt="" className="size-5 rounded-md" />
            <span className="text-xs font-semibold">{branding.appName}</span>
          </div>
          <Bell className="size-3.5" style={{ color: 'var(--pv-muted)' }} aria-hidden />
        </div>
        <div className="flex-1 space-y-2 px-3">
          <div className="border p-2.5" style={{ background: 'var(--pv-card)', borderColor: 'var(--pv-border)', borderRadius: r }}>
            <p style={{ color: 'var(--pv-muted)' }}>Next meeting · 10:30</p>
            <p className="text-xs font-semibold">Design review</p>
            <p className="mt-1" style={{ color: 'var(--pv-accent)' }}>
              ● Notetaker will join
            </p>
          </div>
          <div className="flex items-center gap-2 border p-2.5" style={{ background: 'var(--pv-card)', borderColor: 'var(--pv-border)', borderRadius: r }}>
            <ScoreRing score={82} />
            <div>
              <p className="font-semibold">Weekly sync</p>
              <p style={{ color: 'var(--pv-muted)' }}>2 open action items</p>
            </div>
          </div>
          <div
            className="py-2 text-center text-xs font-medium"
            style={{ background: 'var(--pv-primary)', color: 'var(--pv-primary-fg)', borderRadius: r }}
          >
            Ask {branding.appName}
          </div>
        </div>
        <div className="grid grid-cols-5 border-t px-1 pt-1.5 pb-3" style={{ borderColor: 'var(--pv-border)', background: 'var(--pv-card)' }}>
          {tabs.map((tab) => (
            <div
              key={tab.label}
              className="flex flex-col items-center gap-0.5"
              style={{ color: tab.active ? 'var(--pv-primary)' : 'var(--pv-muted)' }}
            >
              <tab.icon className="size-3.5" aria-hidden />
              <span className="text-[8px]">{tab.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mini web-app shell and phone frame rendered with the theme being edited (inline CSS variables). */
export function ThemePreview({ theme, branding }: { theme: Theme; branding: Branding }) {
  const initial: PreviewMode = theme.defaultMode === 'dark' ? 'dark' : 'light';
  const [mode, setMode] = useState<PreviewMode>(initial);
  const [prevDefault, setPrevDefault] = useState(theme.defaultMode);
  if (prevDefault !== theme.defaultMode) {
    // Follow the "default mode" select when it changes.
    setPrevDefault(theme.defaultMode);
    setMode(initial);
  }
  return (
    <div className="space-y-4" style={{ ...themeVars(theme), ...SURFACES[mode] } as React.CSSProperties}>
      <GoogleFontLink family={theme.fontFamily} />
      <div className="flex items-center justify-between gap-2 font-sans">
        <p className="text-xs text-muted-foreground">
          Font: <span className="font-medium text-foreground">{theme.fontFamily || '—'}</span> · radius {theme.radius}px
        </p>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={mode}
          onValueChange={(v) => v && setMode(v as PreviewMode)}
          aria-label="Preview colour mode"
        >
          <ToggleGroupItem value="light" aria-label="Light surfaces">
            <Sun />
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="Dark surfaces">
            <Moon />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="space-y-1.5">
        <p className="font-sans text-xs font-medium text-muted-foreground">Web app</p>
        <WebAppPreview branding={branding} />
      </div>
      <div className="space-y-1.5">
        <p className="font-sans text-xs font-medium text-muted-foreground">Android app</p>
        <PhonePreview branding={branding} />
      </div>
    </div>
  );
}

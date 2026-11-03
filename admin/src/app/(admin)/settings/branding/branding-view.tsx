'use client';

import { Globe, Mail, X } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import { PageHeader } from '@/components/common/page-header';
import { RemoteImage } from '@/components/common/remote-image';
import { TextField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { SaveBar } from '@/components/forms/save-bar';
import { SettingLoader, SettingMeta, useSettingForm } from '@/components/forms/settings-form';
import { ImageField } from '@/components/media/image-field';
import { themeVars, usePreviewTheme } from '@/components/previews/use-preview-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppSettingRecord, Branding } from '@/lib/api/types';
import { brandingSchema } from '@/lib/schemas/settings';

function BrandingPreview({ branding }: { branding: Branding }) {
  const theme = usePreviewTheme();
  const name = branding.appName || 'App name';
  return (
    <div className="space-y-4" style={themeVars(theme)}>
      {/* Browser tab with favicon */}
      <div className="overflow-hidden rounded-lg border bg-muted/50">
        <div className="flex items-center gap-2 px-3 pt-2">
          <div className="flex max-w-56 items-center gap-2 rounded-t-md border border-b-0 bg-background px-3 py-1.5 text-xs">
            <RemoteImage src={branding.faviconUrl} alt="" fit="contain" className="size-4" />
            <span className="truncate">{name}</span>
            <X className="size-3 text-muted-foreground" aria-hidden />
          </div>
        </div>
        {/* Website header on a light background */}
        <div className="flex items-center justify-between gap-3 border-t bg-white px-4 py-3 text-neutral-900">
          <RemoteImage
            src={branding.logoUrl}
            alt={`${name} logo`}
            fit="contain"
            position="left"
            className="h-7 w-28"
            fallback={<span className="text-base font-bold">{name}</span>}
          />
          <div className="hidden items-center gap-4 text-xs text-neutral-500 sm:flex">
            <span>Features</span>
            <span>Pricing</span>
          </div>
          <span
            className="px-3 py-1.5 text-xs font-medium"
            style={{ background: 'var(--pv-primary)', color: 'var(--pv-primary-fg)', borderRadius: 'var(--pv-radius)' }}
          >
            Get started
          </span>
        </div>
        <div className="border-t bg-white px-4 py-6 text-center text-neutral-900">
          <p className="text-lg font-semibold">{name}</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-neutral-500">{branding.tagline || 'Your tagline'}</p>
        </div>
      </div>

      {/* Web app sidebar on the dark sidebar colour */}
      <div className="flex overflow-hidden rounded-lg border">
        <div className="w-40 space-y-3 p-3" style={{ background: 'var(--pv-sidebar)', color: 'var(--pv-sidebar-fg)' }}>
          <RemoteImage
            src={branding.logoDarkUrl}
            alt={`${name} logo for dark backgrounds`}
            fit="contain"
            position="left"
            className="h-6 w-24"
            fallback={<span className="text-sm font-bold">{name}</span>}
          />
          <div className="space-y-1 text-[11px] opacity-90">
            {['Home', 'Reports', 'Calendar', 'Ask'].map((item, i) => (
              <div
                key={item}
                className="px-2 py-1"
                style={
                  i === 0
                    ? { background: 'var(--pv-primary)', color: 'var(--pv-primary-fg)', borderRadius: 'var(--pv-radius)' }
                    : undefined
                }
              >
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-2 bg-neutral-50 p-3 text-neutral-900">
          <div className="h-3 w-24 rounded bg-neutral-200" />
          <div className="h-12 rounded-md border border-neutral-200 bg-white" />
          <div className="h-12 rounded-md border border-neutral-200 bg-white" />
        </div>
      </div>

      {/* App icon + footer details */}
      <div className="flex items-center gap-4 rounded-lg border p-3">
        <RemoteImage src={branding.iconUrl} alt={`${name} app icon`} className="size-14 rounded-2xl shadow-sm" />
        <div className="min-w-0 space-y-1 text-xs">
          <p className="text-sm font-medium">{name}</p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="size-3" aria-hidden /> {branding.supportEmail || 'support@…'}
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Globe className="size-3" aria-hidden /> © {new Date().getFullYear()} {branding.companyName || 'Company'}
          </p>
        </div>
      </div>
    </div>
  );
}

function BrandingForm({ record }: { record: AppSettingRecord<'branding'> }) {
  const { form, onSubmit, canEdit, isSaving, readOnlyMessage } = useSettingForm('branding', brandingSchema, record);
  const values = useWatch({ control: form.control }) as Branding;
  const { control } = form;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <fieldset disabled={!canEdit} className="min-w-0 space-y-6">
          <FormSection title="Identity" description="Shown in the website header, page titles, emails and the app.">
            <TextField control={control} name="appName" label="App name" />
            <TextField control={control} name="tagline" label="Tagline" description="Used on the login screen and in SEO fallbacks." />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField control={control} name="companyName" label="Company name" description="Footer copyright." />
              <TextField control={control} name="supportEmail" label="Support email" type="email" />
            </div>
          </FormSection>
          <FormSection
            title="Logos & icons"
            description="Paste any image URL or pick one from the media library. SVG or transparent PNG work best."
          >
            <ImageField control={control} name="logoUrl" label="Logo (light backgrounds)" aspect="logo" folder="branding" />
            <ImageField
              control={control}
              name="logoDarkUrl"
              label="Logo (dark backgrounds)"
              description="Used on the web app sidebar and in dark mode."
              aspect="logo"
              dark
              folder="branding"
            />
            <div className="grid gap-5 md:grid-cols-2">
              <ImageField
                control={control}
                name="iconUrl"
                label="App icon / mark"
                description="Square, at least 192×192."
                aspect="square"
                folder="branding"
              />
              <ImageField
                control={control}
                name="faviconUrl"
                label="Favicon"
                description="Square, 64×64 PNG or ICO."
                aspect="square"
                folder="branding"
              />
            </div>
          </FormSection>
        </fieldset>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live preview</CardTitle>
              <CardDescription>Website header, web-app sidebar and app icon with the current theme.</CardDescription>
            </CardHeader>
            <CardContent>
              <BrandingPreview branding={values} />
            </CardContent>
          </Card>
        </div>
      </div>
      <SaveBar
        isDirty={form.formState.isDirty}
        isSaving={isSaving}
        canSave={canEdit}
        readOnlyMessage={readOnlyMessage}
        onReset={() => form.reset()}
      />
    </form>
  );
}

export function BrandingView() {
  return (
    <SettingLoader settingKey="branding">
      {(record) => (
        <>
          <PageHeader
            title="Branding"
            description="Brand name, logos and contact details used across the website, web app, emails and the Android app."
            meta={<SettingMeta record={record} />}
          />
          <BrandingForm record={record} />
        </>
      )}
    </SettingLoader>
  );
}

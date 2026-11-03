'use client';

import { TriangleAlert } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import { PageHeader } from '@/components/common/page-header';
import { ColorField } from '@/components/forms/color-field';
import { SelectField, TextField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { SaveBar } from '@/components/forms/save-bar';
import { SettingLoader, SettingMeta, useSettingForm } from '@/components/forms/settings-form';
import { SliderField } from '@/components/forms/slider-field';
import { contrastRatio } from '@/components/previews/contrast';
import { ThemePreview } from '@/components/previews/theme-preview';
import { usePreviewBranding } from '@/components/previews/use-preview-config';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppSettingRecord, Theme } from '@/lib/api/types';
import { themeSchema } from '@/lib/schemas/settings';

const FONT_SUGGESTIONS = ['Inter', 'Manrope', 'Plus Jakarta Sans', 'DM Sans', 'Poppins', 'Roboto', 'Nunito'];

function ContrastWarnings({ theme }: { theme: Theme }) {
  const checks = [
    { label: 'Primary foreground on primary', ratio: contrastRatio(theme.primaryForeground, theme.primaryColor) },
    { label: 'Sidebar foreground on sidebar background', ratio: contrastRatio(theme.sidebarForeground, theme.sidebarBackground) },
  ].filter((c): c is { label: string; ratio: number } => c.ratio !== null && c.ratio < 4.5);
  if (checks.length === 0) return null;
  return (
    <Alert className="border-amber-500/40 text-amber-900 dark:text-amber-200">
      <TriangleAlert />
      <AlertTitle>Low contrast</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {checks.map((c) => (
            <li key={c.label}>
              {c.label}: {c.ratio.toFixed(2)}:1 — WCAG AA needs at least 4.5:1 for text.
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function ThemeForm({ record }: { record: AppSettingRecord<'theme'> }) {
  const { form, onSubmit, canEdit, isSaving, readOnlyMessage } = useSettingForm('theme', themeSchema, record);
  const values = useWatch({ control: form.control }) as Theme;
  const branding = usePreviewBranding();
  const { control } = form;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <fieldset disabled={!canEdit} className="min-w-0 space-y-6">
          <FormSection
            title="Brand colours"
            description="Become CSS variables on the website and the colour scheme of the Android app."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <ColorField control={control} name="primaryColor" label="Primary" description="Buttons, links, active states." />
              <ColorField
                control={control}
                name="primaryForeground"
                label="Primary foreground"
                description="Text and icons on primary."
              />
              <ColorField control={control} name="accentColor" label="Accent" description="Highlights, score rings, charts." />
            </div>
            <ContrastWarnings theme={values} />
          </FormSection>
          <FormSection title="Web app sidebar" description="The dark navigation rail of the signed-in web app.">
            <div className="grid gap-5 sm:grid-cols-2">
              <ColorField control={control} name="sidebarBackground" label="Sidebar background" />
              <ColorField control={control} name="sidebarForeground" label="Sidebar foreground" />
            </div>
          </FormSection>
          <FormSection title="Shape & type" description="Corner radius and the Google Font used by web and mobile.">
            <SliderField
              control={control}
              name="radius"
              label="Base corner radius"
              description="Cards, buttons and inputs derive their corners from this."
              min={0}
              max={32}
              unit="px"
            />
            <div className="space-y-2">
              <TextField
                control={control}
                name="fontFamily"
                label="Font family"
                placeholder="Inter"
                description="Any Google Fonts family name, spelled exactly as on fonts.google.com."
              />
              <div className="flex flex-wrap gap-1.5" aria-label="Font suggestions">
                {FONT_SUGGESTIONS.map((font) => (
                  <Button
                    key={font}
                    type="button"
                    size="xs"
                    variant={values.fontFamily === font ? 'secondary' : 'outline'}
                    onClick={() => form.setValue('fontFamily', font, { shouldDirty: true, shouldValidate: true })}
                  >
                    {font}
                  </Button>
                ))}
              </div>
            </div>
            <SelectField
              control={control}
              name="defaultMode"
              label="Default colour mode"
              description="What new visitors see before choosing light or dark themselves."
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'Follow the device (system)' },
              ]}
            />
          </FormSection>
        </fieldset>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live preview</CardTitle>
              <CardDescription>
                How the web app and the Android app look with these values. The admin panel itself keeps its neutral look.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ThemePreview theme={values} branding={branding} />
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

export function ThemeView() {
  return (
    <SettingLoader settingKey="theme">
      {(record) => (
        <>
          <PageHeader
            title="Theme"
            description="Colours, corner radius and font for the website, web app and Android app. Changes go live within seconds."
            meta={<SettingMeta record={record} />}
          />
          <ThemeForm record={record} />
        </>
      )}
    </SettingLoader>
  );
}

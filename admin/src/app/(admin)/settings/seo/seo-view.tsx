'use client';

import { useWatch, type Control } from 'react-hook-form';

import { PageHeader } from '@/components/common/page-header';
import { RemoteImage } from '@/components/common/remote-image';
import { TextField, TextareaField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { SaveBar } from '@/components/forms/save-bar';
import { SettingLoader, SettingMeta, useSettingForm } from '@/components/forms/settings-form';
import { TagField } from '@/components/forms/tag-input';
import { ImageField } from '@/components/media/image-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AppSettingRecord, Seo } from '@/lib/api/types';
import { seoSchema } from '@/lib/schemas/settings';
import { cn, truncate } from '@/lib/utils';

const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

function domainOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function CharCounter({ control, name, ideal, max }: { control: Control<Seo>; name: 'title' | 'description'; ideal: number; max: number }) {
  const value = useWatch({ control, name }) ?? '';
  const length = value.length;
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        length > max ? 'text-destructive' : length > ideal ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
      )}
      aria-live="polite"
    >
      {length}/{ideal} recommended
    </span>
  );
}

function SeoPreview({ seo }: { seo: Seo }) {
  const domain = domainOf(WEB_URL);
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Search result</p>
        <div className="rounded-lg border bg-white p-4 font-[Arial,sans-serif] text-neutral-900">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-600">
              {domain.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm text-neutral-800">{domain}</p>
              <p className="truncate text-xs text-neutral-500">{WEB_URL}</p>
            </div>
          </div>
          <p className="mt-2 text-lg leading-snug text-[#1a0dab]">{truncate(seo.title || 'Page title', 60)}</p>
          <p className="mt-1 text-sm leading-snug text-neutral-600">
            {truncate(seo.description || 'Add a description to control the snippet search engines show.', 160)}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Social card (Open Graph)</p>
        <div className="overflow-hidden rounded-lg border bg-white text-neutral-900">
          <RemoteImage src={seo.ogImageUrl} alt="Open Graph image" className="aspect-[1200/630] w-full" />
          <div className="space-y-0.5 border-t bg-neutral-50 px-3 py-2.5">
            <p className="text-xs tracking-wide text-neutral-500 uppercase">{domain}</p>
            <p className="truncate text-sm font-semibold">{seo.title || 'Page title'}</p>
            <p className="line-clamp-2 text-xs text-neutral-600">{seo.description}</p>
          </div>
        </div>
      </div>
      {seo.keywords?.length ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Meta keywords:</span> {seo.keywords.join(', ')}
        </p>
      ) : null}
    </div>
  );
}

function SeoForm({ record }: { record: AppSettingRecord<'seo'> }) {
  const { form, onSubmit, canEdit, isSaving, readOnlyMessage } = useSettingForm('seo', seoSchema, record);
  const values = useWatch({ control: form.control }) as Seo;
  const { control } = form;
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <fieldset disabled={!canEdit} className="min-w-0 space-y-6">
          <FormSection
            title="Default metadata"
            description="Used by the website for the landing page and as the fallback for every page without its own SEO."
          >
            <div className="space-y-1">
              <TextField control={control} name="title" label="Title" />
              <CharCounter control={control} name="title" ideal={60} max={120} />
            </div>
            <div className="space-y-1">
              <TextareaField control={control} name="description" label="Description" rows={3} />
              <CharCounter control={control} name="description" ideal={160} max={320} />
            </div>
            <TagField
              control={control}
              name="keywords"
              label="Keywords"
              description="Press Enter or comma to add. Up to 30."
              placeholder="ai meeting assistant"
            />
          </FormSection>
          <FormSection title="Social sharing" description="The image shown when a link is shared on social networks and chat apps.">
            <ImageField
              control={control}
              name="ogImageUrl"
              label="Open Graph image"
              description="1200×630 px recommended."
              aspect="wide"
              folder="seo"
            />
          </FormSection>
        </fieldset>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
              <CardDescription>Approximate rendering in search results and on social networks.</CardDescription>
            </CardHeader>
            <CardContent>
              <SeoPreview seo={values} />
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

export function SeoView() {
  return (
    <SettingLoader settingKey="seo">
      {(record) => (
        <>
          <PageHeader
            title="SEO"
            description="Search and social metadata for the website. CMS pages can override the title, description and image."
            meta={<SettingMeta record={record} />}
          />
          <SeoForm record={record} />
        </>
      )}
    </SettingLoader>
  );
}

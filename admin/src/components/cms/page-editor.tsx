'use client';

import { ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { RoleGate } from '@/components/auth/role-gate';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { FormField, SelectField, TextareaField, TextField } from '@/components/forms/fields';
import { MarkdownField } from '@/components/forms/markdown-editor';
import { SaveBar } from '@/components/forms/save-bar';
import { ImageField } from '@/components/media/image-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { getErrorMessage, isApiError, markErrorHandled } from '@/lib/api/errors';
import { useCreateCmsPage, useDeleteCmsPage, useUpdateCmsPage, type PageInput } from '@/lib/api/pages';
import type { CmsPage } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { bodyText, nullableImageUrl, optionalTitleText, PAGE_MAX, slug, titleText } from '@/lib/schemas/common';
import { formatDateTime, slugify, truncate } from '@/lib/utils';

import { cmsPageUrl, WEB_URL } from './web-url';
import { SafeLink } from '@/components/common/safe-link';

const pageSchema = z.object({
  title: titleText('Title'),
  slug,
  content: bodyText('Content', PAGE_MAX),
  seo: z.object({
    title: optionalTitleText('SEO title').nullable(),
    description: bodyText('SEO description').nullable(),
    ogImageUrl: nullableImageUrl,
  }),
  status: z.enum(['draft', 'published']),
}) satisfies z.ZodType<Required<PageInput>>;

type PageValues = z.infer<typeof pageSchema>;

const EMPTY: PageValues = {
  title: '',
  slug: '',
  content: '',
  seo: { title: null, description: null, ogImageUrl: null },
  status: 'draft',
};

function toValues(page: CmsPage): PageValues {
  return { title: page.title, slug: page.slug, content: page.content, seo: { ...page.seo }, status: page.status };
}

function SearchSnippet({ values }: { values: PageValues }) {
  const title = values.seo.title || values.title || 'Page title';
  const description = values.seo.description || values.content.replace(/[#*_>`[\]()-]/g, '').trim();
  return (
    <div className="rounded-lg border bg-background p-3 text-left">
      <p className="truncate text-xs text-muted-foreground">
        {WEB_URL.replace(/^https?:\/\//, '')} › p › {values.slug || 'slug'}
      </p>
      <p className="truncate text-sm font-medium text-blue-700 dark:text-blue-400">{title}</p>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {description ? truncate(description, 160) : 'Add a description to control the search snippet.'}
      </p>
    </div>
  );
}

/** Create/edit form for a CMS page (`/content/pages/new` and `/content/pages/:id`). */
export function PageEditor({ page }: { page?: CmsPage }) {
  const router = useRouter();
  const { can } = useAdminSession();
  const canEdit = can('editor');
  const isNew = !page;
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const form = useZodForm(pageSchema, { defaultValues: page ? toValues(page) : EMPTY });
  const { control } = form;
  const values = useWatch({ control }) as PageValues;
  const create = useCreateCmsPage();
  const update = useUpdateCmsPage(page?.id ?? '');
  const remove = useDeleteCmsPage();
  const isSaving = create.isPending || update.isPending;
  useUnsavedChangesGuard(form.formState.isDirty && canEdit);

  const onSubmit = form.handleSubmit(async (body) => {
    try {
      if (isNew) {
        const created = await create.mutateAsync(body);
        form.reset(toValues(created));
        router.replace(`/content/pages/${created.id}`);
      } else {
        const saved = await update.mutateAsync(body);
        form.reset(toValues(saved));
      }
    } catch (error) {
      if (isApiError(error) && error.code === 'CONFLICT') {
        form.setError('slug', { type: 'server', message: getErrorMessage(error) }, { shouldFocus: true });
        markErrorHandled(error);
        return;
      }
      applyFormErrors(error, form);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader
        back={{ href: '/content/pages', label: 'Pages' }}
        title={isNew ? 'New page' : page.title}
        meta={
          page ? (
            <>
              <StatusBadge status={page.status} />
              <span className="font-mono">/p/{page.slug}</span>
              <span>· Updated {formatDateTime(page.updatedAt)}</span>
            </>
          ) : undefined
        }
        actions={
          page ? (
            <>
              <Button variant="outline" asChild>
                <SafeLink href={cmsPageUrl(page.slug)}>
                  <ExternalLink /> View on site
                </SafeLink>
              </Button>
              <RoleGate minRole="editor">
                <ConfirmDialog
                  title="Delete this page?"
                  description={`/p/${page.slug} will return 404 on the website. Navigation links pointing to it are not removed.`}
                  confirmLabel="Delete page"
                  destructive
                  onConfirm={async () => {
                    await remove.mutateAsync(page.id);
                    form.reset();
                    router.replace('/content/pages');
                  }}
                  trigger={
                    <Button type="button" variant="destructive">
                      <Trash2 /> Delete
                    </Button>
                  }
                />
              </RoleGate>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset disabled={!canEdit} className="min-w-0 space-y-6">
          <Card>
            <CardContent className="space-y-5">
              <FormField
                control={control}
                name="title"
                label="Title"
                render={({ field, id, aria }) => (
                  <Input
                    id={id}
                    {...aria}
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value}
                    placeholder="About Remi"
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      if (!slugTouched) {
                        form.setValue('slug', slugify(e.target.value), {
                          shouldDirty: true,
                          shouldValidate: form.formState.isSubmitted,
                        });
                      }
                    }}
                  />
                )}
              />
              <FormField
                control={control}
                name="slug"
                label="Slug"
                description={
                  slugTouched
                    ? 'Lowercase letters, numbers and hyphens. Changing it breaks existing links.'
                    : 'Generated from the title until you edit it.'
                }
                render={({ field, id, aria }) => (
                  <div className="flex items-center gap-2">
                    <InputGroup>
                      <InputGroupAddon>
                        <InputGroupText className="font-mono text-xs">/p/</InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        id={id}
                        {...aria}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value}
                        className="font-mono"
                        placeholder="about"
                        onChange={(e) => {
                          setSlugTouched(true);
                          field.onChange(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                        }}
                      />
                    </InputGroup>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Regenerate slug from title"
                      title="Regenerate from title"
                      onClick={() => {
                        setSlugTouched(false);
                        form.setValue('slug', slugify(form.getValues('title')), { shouldDirty: true, shouldValidate: true });
                      }}
                    >
                      <RefreshCw />
                    </Button>
                  </div>
                )}
              />
              <MarkdownField control={control} name="content" label="Content" rows={22} />
            </CardContent>
          </Card>
        </fieldset>

        <fieldset disabled={!canEdit} className="min-w-0 space-y-6 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publishing</CardTitle>
              <CardDescription>Only published pages are served by the website.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SelectField
                control={control}
                name="status"
                label="Status"
                options={[
                  { value: 'draft', label: 'Draft — hidden from the website' },
                  { value: 'published', label: 'Published — live at /p/{slug}' },
                ]}
              />
              {page ? (
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Published</dt>
                    <dd>{formatDateTime(page.publishedAt, 'Never')}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd>{formatDateTime(page.updatedAt)}</dd>
                  </div>
                </dl>
              ) : null}
              {page && page.status !== 'published' ? (
                <p className="text-xs text-muted-foreground">
                  This page is a draft, so “View on site” returns 404 until you publish it.
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">SEO</CardTitle>
              <CardDescription>Empty fields fall back to the page title and global SEO settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TextField control={control} name="seo.title" label="SEO title" nullable placeholder={values.title} />
              <TextareaField control={control} name="seo.description" label="Meta description" nullable rows={3} />
              <ImageField
                control={control}
                name="seo.ogImageUrl"
                label="Social image"
                description="1200×630 recommended."
                nullable
                aspect="wide"
                folder="seo"
              />
              <SearchSnippet values={values} />
            </CardContent>
          </Card>
        </fieldset>
      </div>

      <SaveBar
        isDirty={form.formState.isDirty}
        isSaving={isSaving}
        canSave={canEdit}
        saveLabel={isNew ? 'Create page' : 'Save page'}
        readOnlyMessage="Read-only: editing pages requires the Editor role."
        onReset={isNew ? undefined : () => form.reset()}
      />
    </form>
  );
}

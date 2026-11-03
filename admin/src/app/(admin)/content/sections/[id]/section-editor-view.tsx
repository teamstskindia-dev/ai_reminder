'use client';

import { AlertTriangle, Braces, ExternalLink, FileQuestion, ListTree, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useWatch, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { RoleGate } from '@/components/auth/role-gate';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, FormSkeleton } from '@/components/common/states';
import { StatusBadge } from '@/components/common/status-badge';
import { SelectField, SwitchField, TextField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { JsonEditor } from '@/components/forms/json-editor';
import { SaveBar } from '@/components/forms/save-bar';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumb-context';
import { SectionPreview } from '@/components/sections/previews';
import { SectionContentForm, type SectionFormValues } from '@/components/sections/section-content-form';
import { isSectionPage, PLATFORM_LABELS, SECTION_PAGE_META } from '@/components/sections/section-meta';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { useDeleteSection, useSection, useUpdateSection } from '@/lib/api/sections';
import type { AdminSection, SectionContent, SectionType } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { requiredString } from '@/lib/schemas/common';
import { SECTION_TYPE_META, sectionContentSchemas } from '@/lib/schemas/sections';
import { formatRelative, humanize } from '@/lib/utils';
import { SafeLink } from '@/components/common/safe-link';

const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

function contentSchema(type: SectionType): z.ZodType<SectionContent[SectionType], SectionContent[SectionType]> {
  return sectionContentSchemas[type] as unknown as z.ZodType<SectionContent[SectionType], SectionContent[SectionType]>;
}

/** Whole-form schema: common fields + the content schema for this section's type. */
function buildSectionFormSchema(type: SectionType): z.ZodType<SectionFormValues, SectionFormValues> {
  return z.object({
    name: requiredString('Name').max(80, 'Keep the name under 80 characters'),
    platform: z.enum(['web', 'mobile', 'all']),
    isActive: z.boolean(),
    content: contentSchema(type),
  });
}

function toFormValues(section: AdminSection): SectionFormValues {
  return {
    name: section.name,
    platform: section.platform,
    isActive: section.isActive,
    content: section.content,
  };
}

/** Flatten nested react-hook-form errors into `{ path, message }` rows for a summary. */
function flattenErrors(errors: FieldErrors, prefix = ''): { path: string; message: string }[] {
  const rows: { path: string; message: string }[] = [];
  for (const [key, value] of Object.entries(errors)) {
    if (!value || key === 'ref') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const leaf = value as { message?: unknown; type?: unknown };
    if (typeof leaf.message === 'string' && leaf.message) {
      rows.push({ path, message: leaf.message });
    } else if (typeof value === 'object' && typeof leaf.type !== 'string') {
      rows.push(...flattenErrors(value as FieldErrors, path));
    }
  }
  return rows;
}

function readablePath(path: string): string {
  return path
    .split('.')
    .map((part) => (/^\d+$/.test(part) ? `#${Number(part) + 1}` : humanize(part.replace(/([a-z])([A-Z])/g, '$1 $2'))))
    .join(' › ');
}

function ErrorSummary({ errors }: { errors: FieldErrors<SectionFormValues> }) {
  const rows = flattenErrors(errors as FieldErrors);
  if (rows.length === 0) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertTriangle />
      <AlertTitle>Fix {rows.length === 1 ? 'this field' : `these ${rows.length} fields`} before saving</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4">
          {rows.slice(0, 8).map((row) => (
            <li key={row.path}>
              <span className="font-medium">{readablePath(row.path)}</span>: {row.message}
            </li>
          ))}
          {rows.length > 8 ? <li>…and {rows.length - 8} more</li> : null}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function SectionEditorForm({ section }: { section: AdminSection }) {
  const { can } = useAdminSession();
  const canEdit = can('editor');
  const schema = useMemo(() => buildSectionFormSchema(section.type), [section.type]);
  const form = useZodForm(schema, { defaultValues: toFormValues(section) });
  const update = useUpdateSection();
  const [tab, setTab] = useState<'form' | 'json'>('form');
  const [jsonKey, setJsonKey] = useState(0);
  const content = useWatch({ control: form.control, name: 'content' });
  const { isDirty, errors, submitCount } = form.formState;
  useUnsavedChangesGuard(isDirty && canEdit);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync({ id: section.id, ...values });
      form.reset(toFormValues(saved));
    } catch (error) {
      // Paths may be absolute (content.items.2.title) or relative to the content object (items.2.title).
      applyFormErrors(error, form, { addPrefix: 'content.' });
    }
  });

  const validateJson = (value: unknown): string | null => {
    const result = contentSchema(section.type).safeParse(value);
    if (result.success) return null;
    const issue = result.error.issues[0];
    if (!issue) return 'Invalid content';
    return issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          {submitCount > 0 ? <ErrorSummary errors={errors} /> : null}
          <fieldset disabled={!canEdit} className="min-w-0">
            <FormSection stacked title="Section" description="Internal name, where it appears and whether it is live.">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="name" label="Name" description="Only shown in the admin panel." />
                <SelectField
                  control={form.control}
                  name="platform"
                  label="Platform"
                  description="Which clients receive this section."
                  options={[
                    { value: 'web', label: PLATFORM_LABELS.web },
                    { value: 'mobile', label: PLATFORM_LABELS.mobile },
                    { value: 'all', label: PLATFORM_LABELS.all },
                  ]}
                />
              </div>
              <SwitchField
                control={form.control}
                name="isActive"
                label="Active"
                description="Inactive sections are kept but not sent to the website or app."
              />
              <p className="text-sm text-muted-foreground">
                Page:{' '}
                <span className="font-medium text-foreground">
                  {isSectionPage(section.page) ? SECTION_PAGE_META[section.page].label : section.page}
                </span>{' '}
                · Type: <span className="font-medium text-foreground">{SECTION_TYPE_META[section.type].label}</span>
              </p>
            </FormSection>
          </fieldset>

          <Tabs
            value={tab}
            onValueChange={(value) => {
              if (value === 'json') setJsonKey((k) => k + 1);
              setTab(value as 'form' | 'json');
            }}
          >
            <TabsList>
              <TabsTrigger value="form">
                <ListTree /> Form
              </TabsTrigger>
              <TabsTrigger value="json">
                <Braces /> Advanced (JSON)
              </TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="pt-4">
              <fieldset disabled={!canEdit} className="min-w-0 space-y-6">
                <SectionContentForm type={section.type} form={form} disabled={!canEdit} />
              </fieldset>
            </TabsContent>
            <TabsContent value="json" className="pt-4">
              <FormSection
                stacked
                title="Content JSON"
                description={`Edit the raw content object for a “${SECTION_TYPE_META[section.type].label}” section. Valid changes apply to the form immediately; invalid JSON is never saved.`}
              >
                <JsonEditor
                  key={jsonKey}
                  label="Section content JSON"
                  value={form.getValues('content')}
                  validate={validateJson}
                  disabled={!canEdit}
                  rows={22}
                  onChange={(value) =>
                    form.setValue('content', value as SectionContent[SectionType], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              </FormSection>
            </TabsContent>
          </Tabs>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
              <CardDescription>An approximation using the saved theme. Updates as you type.</CardDescription>
            </CardHeader>
            <CardContent>
              <SectionPreview type={section.type} content={content} page={section.page} />
            </CardContent>
          </Card>
        </div>
      </div>
      <SaveBar
        isDirty={isDirty}
        isSaving={update.isPending}
        canSave={canEdit}
        readOnlyMessage="Read-only: editing sections requires the Editor role."
        onReset={() => form.reset()}
      />
    </form>
  );
}

function SectionEditor({ section }: { section: AdminSection }) {
  const router = useRouter();
  const remove = useDeleteSection();
  const pageMeta = isSectionPage(section.page) ? SECTION_PAGE_META[section.page] : null;
  const backHref = `/content/sections?view=${encodeURIComponent(section.page)}`;

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: pageMeta ? pageMeta.label : 'Sections' }}
        title={section.name}
        meta={
          <>
            <Badge variant="secondary">{SECTION_TYPE_META[section.type].label}</Badge>
            <Badge variant="outline">{PLATFORM_LABELS[section.platform]}</Badge>
            <StatusBadge status={section.isActive ? 'active' : 'inactive'} label={section.isActive ? 'Live' : 'Hidden'} />
            <span>Updated {formatRelative(section.updatedAt)}</span>
          </>
        }
        actions={
          <>
            {pageMeta?.webPath ? (
              <Button variant="outline" asChild>
                <SafeLink href={`${WEB_URL}${pageMeta.webPath}`}>
                  <ExternalLink /> View on site
                </SafeLink>
              </Button>
            ) : null}
            <RoleGate minRole="editor">
              <ConfirmDialog
                title="Delete this section?"
                description={`“${section.name}” is removed from the ${pageMeta?.label.toLowerCase() ?? section.page} immediately. This cannot be undone.`}
                confirmLabel="Delete section"
                destructive
                onConfirm={async () => {
                  await remove.mutateAsync(section.id);
                  router.replace(backHref);
                }}
                trigger={
                  <Button variant="destructive">
                    <Trash2 /> Delete
                  </Button>
                }
              />
            </RoleGate>
          </>
        }
      />
      <SectionEditorForm key={section.id} section={section} />
    </>
  );
}

export function SectionEditorView() {
  const { id } = useParams<{ id: string }>();
  const section = useSection(id);
  useBreadcrumbLabel(`/content/sections/${id}`, section.data?.name);

  if (section.isPending) return <FormSkeleton rows={9} />;
  if (section.isError) return <ErrorState error={section.error} onRetry={() => void section.refetch()} />;
  if (!section.data) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title="Section not found"
        description="It may have been deleted by another admin."
        action={
          <Button asChild variant="outline">
            <Link href="/content/sections">Back to sections</Link>
          </Button>
        }
      />
    );
  }
  return <SectionEditor section={section.data} />;
}

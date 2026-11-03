'use client';

import { Bell, FileQuestion, Mail } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { CopyButton } from '@/components/common/copy-button';
import { Markdown } from '@/components/common/markdown';
import { PageHeader } from '@/components/common/page-header';
import { RemoteImage } from '@/components/common/remote-image';
import { EmptyState, ErrorState, FormSkeleton } from '@/components/common/states';
import { FormField, SwitchField, TextField, TextareaField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { MarkdownEditor } from '@/components/forms/markdown-editor';
import { SaveBar } from '@/components/forms/save-bar';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumb-context';
import { usePreviewBranding } from '@/components/previews/use-preview-config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { useNotificationTemplates, useUpdateNotificationTemplate } from '@/lib/api/notifications';
import { REMINDER_CHANNELS, type NotificationTemplate, type ReminderChannel } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { bodyText, optionalTitleText, requiredString, titleText } from '@/lib/schemas/common';
import { cn, extractTemplateVariables, formatRelative, renderTemplate } from '@/lib/utils';

import { ChannelsField } from '../../channels-field';
import { NotificationsNav } from '../../notifications-nav';
import { SAMPLE_VALUES, TEMPLATE_VARIABLES } from '../../template-samples';

const templateSchema = z
  .object({
    name: requiredString('Name').max(120),
    titleTemplate: titleText('Title template'),
    bodyTemplate: bodyText('Body template'),
    emailSubject: optionalTitleText('Email subject').nullable(),
    emailBody: bodyText('Email body').nullable(),
    channels: z.array(z.enum(REMINDER_CHANNELS)).min(1, 'Pick at least one channel'),
    isActive: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.channels.includes('email') && !value.emailSubject?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['emailSubject'], message: 'Add a subject when the email channel is on' });
    }
  });

type TemplateForm = z.infer<typeof templateSchema>;

function Preview({ values }: { values: TemplateForm }) {
  const branding = usePreviewBranding();
  const title = renderTemplate(values.titleTemplate, SAMPLE_VALUES);
  const body = renderTemplate(values.bodyTemplate, SAMPLE_VALUES);
  const subject = renderTemplate(values.emailSubject, SAMPLE_VALUES);
  const emailBody = renderTemplate(values.emailBody, SAMPLE_VALUES);
  const on = (c: ReminderChannel) => values.channels?.includes(c);

  return (
    <div className="space-y-5">
      <div className={cn('space-y-1.5', !on('push') && 'opacity-40')}>
        <p className="text-xs font-medium text-muted-foreground">Push{!on('push') ? ' (off)' : ''}</p>
        <div className="rounded-2xl bg-neutral-100 p-3 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-50">
          <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
            <RemoteImage src={branding.iconUrl} alt="" className="size-4 rounded" />
            <span>{branding.appName}</span>
            <span>· now</span>
          </div>
          <p className="mt-1 text-sm font-semibold">{title || 'Title'}</p>
          {body ? <p className="text-sm text-neutral-600 dark:text-neutral-300">{body}</p> : null}
        </div>
      </div>
      <div className={cn('space-y-1.5', !on('in_app') && 'opacity-40')}>
        <p className="text-xs font-medium text-muted-foreground">In-app{!on('in_app') ? ' (off)' : ''}</p>
        <div className="flex gap-3 rounded-lg border p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            <Bell className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{title || 'Title'}</p>
            {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">Just now</p>
          </div>
          <span className="ml-auto mt-1 size-2 shrink-0 rounded-full bg-sky-500" aria-label="Unread" />
        </div>
      </div>
      <div className={cn('space-y-1.5', !on('email') && 'opacity-40')}>
        <p className="text-xs font-medium text-muted-foreground">Email{!on('email') ? ' (off)' : ''}</p>
        <div className="overflow-hidden rounded-lg border">
          <div className="space-y-0.5 border-b bg-muted/40 px-3 py-2 text-xs">
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="size-3" aria-hidden /> {branding.appName} &lt;no-reply@…&gt;
            </p>
            <p className="text-sm font-medium">{subject || 'No subject'}</p>
          </div>
          <div className="p-3">
            {emailBody ? <Markdown>{emailBody}</Markdown> : <p className="text-sm text-muted-foreground">No email body.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({ template }: { template: NotificationTemplate }) {
  const { can } = useAdminSession();
  const canEdit = can('admin');
  const update = useUpdateNotificationTemplate(template.key);
  const form = useZodForm(templateSchema, {
    defaultValues: {
      name: template.name,
      titleTemplate: template.titleTemplate,
      bodyTemplate: template.bodyTemplate,
      emailSubject: template.emailSubject,
      emailBody: template.emailBody,
      channels: template.channels,
      isActive: template.isActive,
    },
  });
  const { control } = form;
  const values = useWatch({ control }) as TemplateForm;
  useUnsavedChangesGuard(form.formState.isDirty && canEdit);

  const known = TEMPLATE_VARIABLES[template.key] ?? [];
  const found = extractTemplateVariables(values.titleTemplate, values.bodyTemplate, values.emailSubject, values.emailBody);
  const variables = [...known, ...found.filter((v) => !known.includes(v))];

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const saved = await update.mutateAsync({
        name: v.name,
        titleTemplate: v.titleTemplate,
        bodyTemplate: v.bodyTemplate,
        emailSubject: v.emailSubject?.trim() ? v.emailSubject : null,
        emailBody: v.emailBody?.trim() ? v.emailBody : null,
        channels: v.channels,
        isActive: v.isActive,
      });
      form.reset({
        name: saved.name,
        titleTemplate: saved.titleTemplate,
        bodyTemplate: saved.bodyTemplate,
        emailSubject: saved.emailSubject,
        emailBody: saved.emailBody,
        channels: saved.channels,
        isActive: saved.isActive,
      });
    } catch (error) {
      applyFormErrors(error, form);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <fieldset disabled={!canEdit} className="min-w-0 space-y-6">
          <FormSection title="Template" description={`Key: ${template.key} · updated ${formatRelative(template.updatedAt)}`}>
            <TextField control={control} name="name" label="Name" />
            <SwitchField
              control={control}
              name="isActive"
              label="Active"
              description="Inactive templates are not sent at all."
            />
            <ChannelsField control={control} name="channels" label="Channels" />
          </FormSection>
          <FormSection title="Push & in-app" description="Short title and body. Plain text.">
            <TextField control={control} name="titleTemplate" label="Title" inputProps={{ className: 'font-mono text-xs' }} />
            <TextareaField control={control} name="bodyTemplate" label="Body" rows={3} monospace />
          </FormSection>
          <FormSection title="Email" description="Subject and Markdown body. Required when the email channel is on.">
            <TextField
              control={control}
              name="emailSubject"
              label="Subject"
              nullable
              inputProps={{ className: 'font-mono text-xs' }}
            />
            <FormField
              control={control}
              name="emailBody"
              label="Body (Markdown)"
              render={({ field, id, aria }) => (
                <MarkdownEditor
                  id={id}
                  {...aria}
                  value={field.value ?? ''}
                  onChange={(v) => field.onChange(v === '' ? null : v)}
                  onBlur={field.onBlur}
                  disabled={field.disabled}
                  rows={10}
                />
              )}
            />
          </FormSection>
        </fieldset>
        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Variables</CardTitle>
              <CardDescription>Available for this template, with the sample values used in the preview.</CardDescription>
            </CardHeader>
            <CardContent>
              {variables.length ? (
                <ul className="space-y-1.5">
                  {variables.map((v) => (
                    <li key={v} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs">
                          {`{{${v}}}`}
                          {!known.includes(v) && known.length ? (
                            <span className="ml-1.5 font-sans text-[11px] text-amber-600">not provided</span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground" title={SAMPLE_VALUES[v]}>
                          {SAMPLE_VALUES[v] ?? `[${v}]`}
                        </p>
                      </div>
                      <CopyButton value={`{{${v}}}`} label={`Copy {{${v}}}`} size="icon-xs" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No variables.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
              <CardDescription>Rendered with sample values.</CardDescription>
            </CardHeader>
            <CardContent>
              <Preview values={values} />
            </CardContent>
          </Card>
        </div>
      </div>
      <SaveBar
        isDirty={form.formState.isDirty}
        isSaving={update.isPending}
        canSave={canEdit}
        readOnlyMessage="Read-only: editing templates requires the Admin role."
        onReset={() => form.reset()}
      />
    </form>
  );
}

export function TemplateEditorView() {
  const { key: rawKey } = useParams<{ key: string }>();
  const key = decodeURIComponent(rawKey);
  const templates = useNotificationTemplates();
  const template = templates.data?.find((t) => t.key === key);
  useBreadcrumbLabel(`/notifications/templates/${rawKey}`, template?.name);

  return (
    <>
      <PageHeader
        back={{ href: '/notifications/templates', label: 'Templates' }}
        title={template?.name ?? 'Template'}
        meta={template ? <span className="font-mono">{template.key}</span> : null}
      />
      <NotificationsNav />
      {templates.isPending ? (
        <FormSkeleton />
      ) : templates.isError ? (
        <ErrorState error={templates.error} onRetry={() => void templates.refetch()} />
      ) : !template ? (
        <EmptyState
          icon={<FileQuestion />}
          title="Template not found"
          description={`There is no notification template with the key "${key}".`}
          action={
            <Button variant="outline" asChild>
              <Link href="/notifications/templates">Back to templates</Link>
            </Button>
          }
        />
      ) : (
        <TemplateEditor key={`${template.key}-${template.updatedAt}`} template={template} />
      )}
    </>
  );
}

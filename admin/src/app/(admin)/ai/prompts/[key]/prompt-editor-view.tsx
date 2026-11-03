'use client';

import { FileQuestion, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef } from 'react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, FormSkeleton } from '@/components/common/states';
import { FormField, TextField, TextareaField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { SaveBar } from '@/components/forms/save-bar';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumb-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { useAiPrompts, useUpdateAiPrompt } from '@/lib/api/ai';
import type { AiPrompt } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { bodyText, requiredString } from '@/lib/schemas/common';
import { extractTemplateVariables, formatDateTime, formatRelative } from '@/lib/utils';

import { AiNav } from '../../ai-nav';
import { KNOWN_PROMPT_VARIABLES } from '../../prompt-variables';

const promptSchema = z.object({
  name: requiredString('Name').max(120),
  description: bodyText('Description').nullable(),
  // Prompts are long-form instructions; 50k characters is far above any real prompt but bounds abuse.
  content: requiredString('Prompt content').max(50_000, 'Prompt must be 50,000 characters or fewer'),
});

function VariableButton({ name, hint, onInsert, disabled }: { name: string; hint?: string; onInsert: () => void; disabled: boolean }) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onInsert}
        className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60"
        title={`Insert {{${name}}} at the cursor`}
      >
        <Plus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
        <span className="min-w-0">
          <span className="block font-mono text-xs">{`{{${name}}}`}</span>
          {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
        </span>
      </button>
    </li>
  );
}

function PromptEditor({ prompt }: { prompt: AiPrompt }) {
  const { can } = useAdminSession();
  const canEdit = can('admin');
  const update = useUpdateAiPrompt(prompt.key);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const form = useZodForm(promptSchema, {
    defaultValues: { name: prompt.name, description: prompt.description, content: prompt.content },
  });
  const { control } = form;
  const content = useWatch({ control, name: 'content' }) ?? '';
  useUnsavedChangesGuard(form.formState.isDirty && canEdit);

  const found = extractTemplateVariables(content);
  const known = KNOWN_PROMPT_VARIABLES[prompt.key] ?? [];
  const knownMissing = known.filter((v) => !found.includes(v.name));
  const knownByName = new Map(known.map((v) => [v.name, v.description]));

  const insert = (name: string) => {
    const el = textareaRef.current;
    const token = `{{${name}}}`;
    const current = form.getValues('content') ?? '';
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    form.setValue('content', next, { shouldDirty: true, shouldValidate: true });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync({
        content: values.content,
        name: values.name,
        description: values.description,
      });
      form.reset({ name: saved.name, description: saved.description, content: saved.content });
    } catch (error) {
      applyFormErrors(error, form);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <fieldset disabled={!canEdit} className="min-w-0 space-y-6">
          <FormSection title="Details" description="Shown to admins only.">
            <TextField control={control} name="name" label="Name" />
            <TextareaField control={control} name="description" label="Description" nullable rows={2} />
          </FormSection>
          <FormSection
            stacked
            title="Prompt"
            description="System instructions sent to Gemini. {{variables}} are replaced by the backend before each call."
          >
            <FormField
              control={control}
              name="content"
              label="Content"
              description={`${content.length.toLocaleString()} characters · ${content.split('\n').length} lines`}
              render={({ field, id, aria }) => (
                <Textarea
                  id={id}
                  {...aria}
                  name={field.name}
                  ref={(el) => {
                    field.ref(el);
                    textareaRef.current = el;
                  }}
                  onBlur={field.onBlur}
                  disabled={field.disabled}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value)}
                  rows={28}
                  spellCheck={false}
                  className="min-h-[28rem] font-mono text-xs leading-relaxed"
                />
              )}
            />
          </FormSection>
        </fieldset>
        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Version</CardTitle>
              <CardDescription>
                Currently v{prompt.version}, updated {formatRelative(prompt.updatedAt)} ({formatDateTime(prompt.updatedAt)}).
                {canEdit ? ` Saving creates version ${prompt.version + 1}.` : ''}
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Variables</CardTitle>
              <CardDescription>Click to insert at the cursor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Used in this prompt ({found.length})</p>
                {found.length ? (
                  <ul className="-mx-2">
                    {found.map((name) => (
                      <VariableButton
                        key={name}
                        name={name}
                        hint={knownByName.get(name) ?? (known.length ? 'Not provided by the backend for this prompt' : undefined)}
                        disabled={!canEdit}
                        onInsert={() => insert(name)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No variables yet.</p>
                )}
              </div>
              {knownMissing.length ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Also available</p>
                  <ul className="-mx-2">
                    {knownMissing.map((v) => (
                      <VariableButton
                        key={v.name}
                        name={v.name}
                        hint={v.description}
                        disabled={!canEdit}
                        onInsert={() => insert(v.name)}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              {prompt.key === 'meeting_report' ? (
                <Button type="button" variant="outline" size="sm" asChild className="w-full">
                  <Link href="/ai/playground">Test in the playground</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
      <SaveBar
        isDirty={form.formState.isDirty}
        isSaving={update.isPending}
        canSave={canEdit}
        readOnlyMessage="Read-only: editing prompts requires the Admin role."
        saveLabel="Save new version"
        onReset={() => form.reset()}
      />
    </form>
  );
}

export function PromptEditorView() {
  const { key: rawKey } = useParams<{ key: string }>();
  const key = decodeURIComponent(rawKey);
  const prompts = useAiPrompts();
  const prompt = prompts.data?.find((p) => p.key === key);
  useBreadcrumbLabel(`/ai/prompts/${rawKey}`, prompt?.name);

  return (
    <>
      <PageHeader
        back={{ href: '/ai/prompts', label: 'Prompts' }}
        title={prompt?.name ?? 'Prompt'}
        meta={
          prompt ? (
            <>
              <span className="font-mono">{prompt.key}</span>
              <Badge variant="secondary">v{prompt.version}</Badge>
            </>
          ) : null
        }
      />
      <AiNav />
      {prompts.isPending ? (
        <FormSkeleton />
      ) : prompts.isError ? (
        <ErrorState error={prompts.error} onRetry={() => void prompts.refetch()} />
      ) : !prompt ? (
        <EmptyState
          icon={<FileQuestion />}
          title="Prompt not found"
          description={`There is no prompt with the key "${key}".`}
          action={
            <Button variant="outline" asChild>
              <Link href="/ai/prompts">Back to prompts</Link>
            </Button>
          }
        />
      ) : (
        <PromptEditor key={`${prompt.key}-${prompt.version}`} prompt={prompt} />
      )}
    </>
  );
}

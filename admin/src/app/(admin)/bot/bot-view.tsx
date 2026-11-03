'use client';

import { Plus, TriangleAlert, X } from 'lucide-react';
import { useFieldArray, useWatch, type FieldPath, type UseFormSetError } from 'react-hook-form';
import { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { PageHeader } from '@/components/common/page-header';
import { NumberField, SelectField, SwitchField, TextField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { SaveBar } from '@/components/forms/save-bar';
import { SettingLoader, SettingMeta } from '@/components/forms/settings-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { useUpdateSetting } from '@/lib/api/settings';
import type { AppSettingRecord, BotSettings } from '@/lib/api/types';
import { applyApiErrors, useZodForm } from '@/lib/forms';
import { ROLE_LABELS, settingEditRole } from '@/lib/roles';
import { botSettingsSchema, selectorValue } from '@/lib/schemas/settings';
import { cn } from '@/lib/utils';

const SELECTOR_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/** Form shape: selectors as editable rows instead of a record. Converted to `BotSettings` on save. */
const botFormSchema = botSettingsSchema
  .extend({
    selectors: z.array(
      z.object({
        key: z.string().trim().regex(SELECTOR_KEY_RE, 'Letters, numbers and _ only, starting with a letter'),
        value: selectorValue,
      }),
    ),
  })
  .superRefine((value, ctx) => {
    const seen = new Map<string, number>();
    value.selectors.forEach((row, index) => {
      if (seen.has(row.key)) {
        ctx.addIssue({ code: 'custom', path: ['selectors', index, 'key'], message: `Duplicate key "${row.key}"` });
      } else {
        seen.set(row.key, index);
      }
    });
  });

type BotForm = z.infer<typeof botFormSchema>;

function toForm(value: BotSettings): BotForm {
  return { ...value, selectors: Object.entries(value.selectors).map(([key, selector]) => ({ key, value: selector })) };
}

function fromForm(values: BotForm): BotSettings {
  return botSettingsSchema.parse({
    ...values,
    selectors: Object.fromEntries(values.selectors.map((row) => [row.key, row.value])),
  });
}

const AUTO_JOIN_OPTIONS = [
  { value: 'all', label: 'All meetings — every calendar event with a Meet link' },
  { value: 'owned', label: 'Owned — only meetings the user organises' },
  { value: 'none', label: 'None — users opt in per meeting' },
];

function SelectorsEditor({ form, disabled }: { form: ReturnType<typeof useZodForm<BotForm, BotForm>>; disabled: boolean }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'selectors' });
  const rows = useWatch({ control: form.control, name: 'selectors' }) ?? [];
  const errors = form.formState.errors.selectors;

  return (
    <div className="space-y-3">
      <Alert className="border-amber-500/40 text-amber-900 dark:text-amber-200">
        <TriangleAlert />
        <AlertTitle>Google Meet DOM selectors</AlertTitle>
        <AlertDescription>
          The bot finds Meet&apos;s buttons and captions with these CSS selectors. Meet changes its markup without notice,
          so fix them here when joins or captions start failing — no deploy needed. Keys ending in{' '}
          <code className="font-mono">Text</code> are visible texts to match, separated by{' '}
          <code className="font-mono">|</code>. A wrong selector stops the bot from joining.
        </AlertDescription>
      </Alert>
      <div className="hidden grid-cols-[14rem_minmax(0,1fr)_2rem] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
        <span>Key</span>
        <span>Selector / texts</span>
        <span className="sr-only">Remove</span>
      </div>
      <ul className="space-y-3">
        {fields.map((field, index) => {
          const row = rows[index];
          const rowErrors = errors?.[index];
          const isText = row?.key?.endsWith('Text');
          const parts = isText ? (row?.value ?? '').split('|').map((p) => p.trim()).filter(Boolean) : [];
          return (
            <li key={field.id} className="space-y-1.5 rounded-lg border p-2 md:border-0 md:p-0">
              <div className="grid gap-2 md:grid-cols-[14rem_minmax(0,1fr)_2rem]">
                <Input
                  {...form.register(`selectors.${index}.key`)}
                  aria-label={`Selector ${index + 1} key`}
                  aria-invalid={Boolean(rowErrors?.key)}
                  disabled={disabled}
                  placeholder="joinButtonText"
                  className="font-mono text-xs"
                />
                <Input
                  {...form.register(`selectors.${index}.value`)}
                  aria-label={`Selector ${index + 1} value`}
                  aria-invalid={Boolean(rowErrors?.value)}
                  disabled={disabled}
                  placeholder={isText ? 'Ask to join|Join now' : "button[aria-label='Leave call']"}
                  className="font-mono text-xs"
                  spellCheck={false}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove selector ${row?.key || index + 1}`}
                  disabled={disabled}
                  onClick={() => remove(index)}
                >
                  <X />
                </Button>
              </div>
              {parts.length ? (
                <div className="flex flex-wrap gap-1 md:pl-[14.5rem]" aria-label="Matched texts">
                  {parts.map((part, i) => (
                    <Badge key={`${part}-${i}`} variant="secondary" className="font-normal">
                      {part}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {rowErrors?.key || rowErrors?.value ? (
                <FieldError className={cn('text-xs md:pl-1')} errors={[rowErrors.key, rowErrors.value]} />
              ) : null}
            </li>
          );
        })}
      </ul>
      {fields.length === 0 ? <p className="text-sm text-muted-foreground">No selectors — the bot cannot operate Meet.</p> : null}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => append({ key: '', value: '' })}>
        <Plus /> Add selector
      </Button>
    </div>
  );
}

function BotSettingsForm({ record }: { record: AppSettingRecord<'bot'> }) {
  const { canEditSetting } = useAdminSession();
  const canEdit = canEditSetting('bot');
  const mutation = useUpdateSetting('bot');
  const form = useZodForm(botFormSchema, { defaultValues: toForm(record.value) });
  const { control } = form;
  useUnsavedChangesGuard(form.formState.isDirty && canEdit);

  /** Server paths look like "selectors.joinButtonText"; map them onto the matching row. */
  const setServerError: UseFormSetError<BotForm> = (name, error, options) => {
    const match = /^selectors\.([^.]+)$/.exec(name);
    if (match) {
      const index = form.getValues('selectors').findIndex((row) => row.key === match[1]);
      const target = (index >= 0 ? `selectors.${index}.value` : 'selectors') as FieldPath<BotForm>;
      form.setError(target, error, options);
      return;
    }
    form.setError(name, error, options);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await mutation.mutateAsync(fromForm(values));
      form.reset(toForm(saved.value));
    } catch (error) {
      applyApiErrors(error, setServerError, { stripPrefix: 'value.' });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!canEdit} className="min-w-0 space-y-6">
        <FormSection title="Identity" description="How the notetaker appears in the Meet waiting room and participant list.">
          <TextField
            control={control}
            name="botName"
            label="Bot name"
            description="Users can override this per account in their settings."
          />
          <SelectField
            control={control}
            name="autoJoinDefault"
            label="Default auto-join for new users"
            options={AUTO_JOIN_OPTIONS}
          />
        </FormSection>
        <FormSection title="Timing" description="When the bot joins and when it gives up or leaves.">
          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField
              control={control}
              name="joinBeforeMinutes"
              label="Join before start"
              min={0}
              max={30}
              suffix="min"
              description="How early the bot asks to join."
            />
            <NumberField
              control={control}
              name="waitingRoomTimeoutMinutes"
              label="Waiting room timeout"
              min={1}
              max={60}
              suffix="min"
              description="Give up if nobody admits the bot."
            />
            <NumberField
              control={control}
              name="maxDurationMinutes"
              label="Maximum duration"
              min={5}
              max={600}
              suffix="min"
              description="Hard stop for very long calls."
            />
            <NumberField
              control={control}
              name="leaveWhenAloneMinutes"
              label="Leave when alone after"
              min={0}
              max={60}
              suffix="min"
              description="Leave once everyone else has gone."
            />
          </div>
        </FormSection>
        <FormSection title="Browser" description="How the bot runner starts Chromium.">
          <SwitchField
            control={control}
            name="headless"
            label="Headless Chromium"
            description="Google Meet blocks or degrades some headless browsers. Keep off (headful under Xvfb) unless you have verified it works."
          />
        </FormSection>
        <FormSection
          stacked
          title="Selectors"
          description="CSS selectors and texts used to drive Google Meet. Hot-fixable: workers pick up changes within minutes."
        >
          <SelectorsEditor form={form} disabled={!canEdit} />
        </FormSection>
      </fieldset>
      <SaveBar
        isDirty={form.formState.isDirty}
        isSaving={mutation.isPending}
        canSave={canEdit}
        readOnlyMessage={`Read-only: saving bot settings requires the ${ROLE_LABELS[settingEditRole('bot')]} role.`}
        onReset={() => form.reset()}
      />
    </form>
  );
}

export function BotView() {
  return (
    <SettingLoader settingKey="bot">
      {(record) => (
        <>
          <PageHeader
            title="Meeting bot"
            description="Behaviour of the Google Meet notetaker and the DOM selectors it relies on."
            meta={<SettingMeta record={record} />}
          />
          <BotSettingsForm record={record} />
        </>
      )}
    </SettingLoader>
  );
}

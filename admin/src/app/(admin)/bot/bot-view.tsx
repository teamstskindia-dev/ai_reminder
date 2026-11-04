'use client';

import { CircleCheck, CircleX, ExternalLink, Plug, Plus, TriangleAlert, X } from 'lucide-react';
import { useFieldArray, useWatch, type FieldPath, type UseFormSetError } from 'react-hook-form';
import { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { CopyButton } from '@/components/common/copy-button';
import { PageHeader } from '@/components/common/page-header';
import { FormField, NumberField, SelectField, SwitchField, TextField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { SaveBar } from '@/components/forms/save-bar';
import { SettingLoader, SettingMeta } from '@/components/forms/settings-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { useBotProviders, useTestRecall } from '@/lib/api/bot';
import { useUpdateSetting } from '@/lib/api/settings';
import type { AppSettingRecord, BotProvider, BotProviderStatus, BotSettings } from '@/lib/api/types';
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

const PROVIDER_OPTIONS: { value: BotProvider; title: string; badge?: string; description: string }[] = [
  {
    value: 'recall',
    title: 'Recall.ai',
    badge: 'Recommended',
    description:
      'Managed notetaker bots that join Google Meet reliably, record and transcribe. Billed by Recall.ai per recorded hour.',
  },
  {
    value: 'self_hosted',
    title: 'Self-hosted Chromium',
    description:
      'Free, runs in the bot container on your server. Google Meet often refuses automated guests, so joins can fail.',
  },
];

const TRANSCRIPTION_OPTIONS = [
  { value: 'recallai_streaming', label: 'Recall.ai transcription — best accuracy, detects the language (paid)' },
  { value: 'meeting_captions', label: 'Google Meet captions — free, one fixed language, lower accuracy' },
];

function StatusRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
      ) : (
        <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      )}
      <span>
        <span className="font-medium">{label}</span>{' '}
        <span className="text-muted-foreground">— {ok ? 'set' : hint}</span>
      </span>
    </li>
  );
}

/** Server-side readiness of the Recall.ai provider + "Test connection". Secrets are never shown, only set / not set. */
function RecallStatus({ status, canTest }: { status: BotProviderStatus['recall']; canTest: boolean }) {
  const test = useTestRecall();
  const result = test.data;
  const ready = status.apiKeyConfigured && status.webhookSecretConfigured;
  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <ul className="space-y-2" aria-label="Recall.ai server configuration">
        <StatusRow ok={status.apiKeyConfigured} label="API key" hint="set RECALL_API_KEY on the server" />
        <StatusRow
          ok={status.webhookSecretConfigured}
          label="Webhook signing secret"
          hint="set RECALL_WEBHOOK_SECRET on the server"
        />
        <li className="text-sm">
          <span className="font-medium">Region</span>{' '}
          <code className="rounded bg-muted px-1 font-mono text-xs">{status.region}</code>
          <span className="text-muted-foreground">
            {' '}
            — must match where the Recall.ai workspace was created (RECALL_REGION)
          </span>
        </li>
      </ul>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Webhook URL</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border bg-background px-2 py-1.5 font-mono text-xs">
            {status.webhookUrl}
          </code>
          <CopyButton value={status.webhookUrl} label="Copy webhook URL" />
        </div>
        <p className="text-xs text-muted-foreground">
          In the Recall.ai dashboard → Webhooks, add this endpoint and subscribe it to all <code>bot.*</code> events.
        </p>
      </div>
      {!ready ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Create a Recall.ai workspace and an API key (Developers → API Keys) → RECALL_API_KEY.</li>
          <li>Add the webhook URL above, then create a workspace verification secret → RECALL_WEBHOOK_SECRET.</li>
          <li>Put both in the server&apos;s .env.production and recreate the api, worker and bot containers.</li>
        </ol>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canTest || !status.apiKeyConfigured || test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? <Spinner /> : <Plug />} Test connection
        </Button>
        <Button asChild type="button" variant="ghost" size="sm">
          <a href={status.dashboardUrl} target="_blank" rel="noopener noreferrer">
            Recall.ai dashboard <ExternalLink />
          </a>
        </Button>
        {result ? (
          <span
            role="status"
            className={cn('text-sm', result.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}
          >
            {result.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SelfHostedStatus({ status }: { status: BotProviderStatus['selfHosted'] }) {
  return (
    <Alert className="border-amber-500/40 text-amber-900 dark:text-amber-200">
      <TriangleAlert />
      <AlertTitle>Google Meet may refuse the self-hosted bot</AlertTitle>
      <AlertDescription>
        Meet blocks many automated guests (&quot;You can&apos;t join this video call&quot;). Runner mode:{' '}
        <code className="font-mono">{status.mode}</code>
        {status.persistentProfile
          ? ', signed-in bot profile enabled.'
          : ', no signed-in bot profile (BOT_PROFILE_DIR).'}{' '}
        Switch to Recall.ai for reliable joins.
      </AlertDescription>
    </Alert>
  );
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
  const providers = useBotProviders();
  const form = useZodForm(botFormSchema, { defaultValues: toForm(record.value) });
  const { control } = form;
  const provider = useWatch({ control, name: 'provider' });
  const transcription = useWatch({ control, name: 'recall.transcription' });
  const selfHosted = provider === 'self_hosted';
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
        <FormSection
          title="Provider"
          description="Who sends the notetaker into meetings. Takes effect for the next bot that joins; no deploy needed."
        >
          <FormField
            control={control}
            name="provider"
            label="Meeting bot provider"
            render={({ field, id, aria }) => (
              <RadioGroup
                id={id}
                {...aria}
                value={field.value}
                onValueChange={field.onChange}
                disabled={field.disabled}
                className="grid gap-3 md:grid-cols-2"
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`${id}-${option.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-primary/5"
                  >
                    <RadioGroupItem id={`${id}-${option.value}`} value={option.value} className="mt-0.5" />
                    <span className="space-y-1">
                      <span className="flex items-center gap-2 font-medium">
                        {option.title}
                        {option.badge ? <Badge variant="secondary">{option.badge}</Badge> : null}
                      </span>
                      <span className="block text-sm text-muted-foreground">{option.description}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            )}
          />
          {providers.data ? (
            selfHosted ? (
              <SelfHostedStatus status={providers.data.selfHosted} />
            ) : (
              <RecallStatus status={providers.data.recall} canTest={canEdit} />
            )
          ) : providers.isError ? (
            <p className="text-sm text-destructive">Could not load the provider status.</p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Checking server configuration…
            </p>
          )}
          {!selfHosted ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                control={control}
                name="recall.transcription"
                label="Transcription"
                options={TRANSCRIPTION_OPTIONS}
                className="sm:col-span-2"
              />
              <TextField
                control={control}
                name="recall.languageCode"
                label="Language"
                placeholder="auto"
                description={
                  transcription === 'meeting_captions'
                    ? 'Meet captions cannot detect the language: use a code like en or de ("auto" = Meet default, English).'
                    : '"auto" detects the spoken language; or a code like en, en_us, de, hi.'
                }
              />
              <SwitchField
                control={control}
                name="recall.deleteMediaAfterImport"
                label="Delete recording from Recall.ai after import"
                description="Remi keeps the transcript; the audio/video is not stored anywhere."
              />
            </div>
          ) : null}
        </FormSection>
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
              description={
                selfHosted
                  ? 'Give up if nobody admits the bot.'
                  : 'Give up if nobody admits the bot (Recall.ai: at most 10 min on Meet).'
              }
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
        {selfHosted ? (
          <>
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
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Browser and Google Meet selector settings apply to the self-hosted provider only; they are kept for when you
            switch back.
          </p>
        )}
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
            description="Who runs the Google Meet notetaker, how it behaves, and the DOM selectors the self-hosted bot relies on."
            meta={<SettingMeta record={record} />}
          />
          <BotSettingsForm record={record} />
        </>
      )}
    </SettingLoader>
  );
}

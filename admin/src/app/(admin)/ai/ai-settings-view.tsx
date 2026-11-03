'use client';

import { useWatch, type UseFormSetValue } from 'react-hook-form';

import { PageHeader } from '@/components/common/page-header';
import { NumberField, SwitchField, TextField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { SaveBar } from '@/components/forms/save-bar';
import { SettingLoader, SettingMeta, useSettingForm } from '@/components/forms/settings-form';
import { SliderField } from '@/components/forms/slider-field';
import { Button } from '@/components/ui/button';
import type { AiSettings, AppSettingRecord } from '@/lib/api/types';
import { aiSettingsSchema } from '@/lib/schemas/settings';

import { AiNav } from './ai-nav';

const MODEL_SUGGESTIONS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];
const LANGUAGE_SUGGESTIONS = ['auto', 'English', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese'];

function Chips({
  values,
  current,
  onPick,
  label,
}: {
  values: string[];
  current: string | undefined;
  onPick: (value: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={label}>
      {values.map((v) => (
        <Button key={v} type="button" size="xs" variant={current === v ? 'secondary' : 'outline'} onClick={() => onPick(v)}>
          {v}
        </Button>
      ))}
    </div>
  );
}

function AiForm({ record }: { record: AppSettingRecord<'ai'> }) {
  const { form, onSubmit, canEdit, isSaving, readOnlyMessage } = useSettingForm('ai', aiSettingsSchema, record);
  const { control } = form;
  const values = useWatch({ control }) as AiSettings;
  const setValue: UseFormSetValue<AiSettings> = form.setValue;
  const pick = (name: 'model' | 'outputLanguage') => (value: string) =>
    setValue(name, value, { shouldDirty: true, shouldValidate: true });

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!canEdit} className="min-w-0 space-y-6">
        <FormSection
          title="Models"
          description="Gemini models used by the report pipeline and Ask AI. Changes apply to the next job — no deploy needed."
        >
          <div className="space-y-2">
            <TextField
              control={control}
              name="model"
              label="Generation model"
              description="Writes meeting reports, action items, reminders and Ask AI answers."
            />
            <Chips values={MODEL_SUGGESTIONS} current={values.model} onPick={pick('model')} label="Model suggestions" />
          </div>
          <TextField
            control={control}
            name="embeddingModel"
            label="Embedding model"
            description="768-dimension embeddings for meeting memory (pgvector). Changing it requires re-embedding old meetings."
          />
          <SwitchField
            control={control}
            name="enableEmbeddings"
            label="Enable embeddings"
            description="Off = new meetings are not embedded, so Ask AI cannot find them."
          />
        </FormSection>
        <FormSection title="Generation" description="Sampling and output limits for every Gemini call.">
          <SliderField
            control={control}
            name="temperature"
            label="Temperature"
            description="Lower is more factual and repeatable; higher is more creative. 0.2–0.4 suits reports."
            min={0}
            max={2}
            step={0.1}
          />
          <NumberField
            control={control}
            name="maxOutputTokens"
            label="Max output tokens"
            min={256}
            max={65536}
            step={256}
            suffix="tokens"
          />
          <div className="space-y-2">
            <TextField
              control={control}
              name="outputLanguage"
              label="Output language"
              description='"auto" writes reports in the main language of the transcript; otherwise a language name such as "English".'
            />
            <Chips
              values={LANGUAGE_SUGGESTIONS}
              current={values.outputLanguage}
              onPick={pick('outputLanguage')}
              label="Language suggestions"
            />
          </div>
        </FormSection>
      </fieldset>
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

export function AiSettingsView() {
  return (
    <>
      <PageHeader
        title="AI"
        description="Gemini models, generation parameters, prompts and a playground to test the meeting-report pipeline."
      />
      <AiNav />
      <SettingLoader settingKey="ai">
        {(record) => (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <SettingMeta record={record} />
            </div>
            <AiForm record={record} />
          </div>
        )}
      </SettingLoader>
    </>
  );
}

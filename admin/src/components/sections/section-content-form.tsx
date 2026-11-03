'use client';

import { Info } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { ColorField } from '@/components/forms/color-field';
import { TextareaField, TextField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { IconField } from '@/components/forms/icon-select';
import { MarkdownField } from '@/components/forms/markdown-editor';
import { TagField } from '@/components/forms/tag-input';
import { ImageField } from '@/components/media/image-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import type { Platform, SectionContent, SectionType } from '@/lib/api/types';

import { ArrayFieldList } from './array-field-list';

/** Editor form values: the section's common fields plus its typed content. */
export interface SectionFormValues<T extends SectionType = SectionType> {
  name: string;
  platform: Platform;
  isActive: boolean;
  content: SectionContent[T];
}

export type SectionFormApi<T extends SectionType = SectionType> = UseFormReturn<
  SectionFormValues<T>,
  unknown,
  SectionFormValues<T>
>;

const HREF_HINT = 'A path like /pricing or /#features, a full URL, or a deep link such as remi://ask.';
const MEDIA_FOLDER = 'sections';

interface TypeFormProps<T extends SectionType> {
  form: SectionFormApi<T>;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// hero
// ---------------------------------------------------------------------------

function HeroFields({ form, disabled }: TypeFormProps<'hero'>) {
  const { control } = form;
  const switchId = useId();
  const secondary = useWatch({ control, name: 'content.secondaryCta' });

  return (
    <>
      <FormSection stacked title="Headline" description="The first thing visitors read.">
        <TextField
          control={control}
          name="content.eyebrow"
          label="Eyebrow"
          nullable
          placeholder="Optional"
          description="Small label above the title. Leave empty to hide it."
        />
        <TextField control={control} name="content.title" label="Title" />
        <TextareaField control={control} name="content.subtitle" label="Subtitle" rows={3} />
      </FormSection>
      <FormSection stacked title="Buttons">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={control} name="content.primaryCta.label" label="Primary button label" />
          <TextField
            control={control}
            name="content.primaryCta.href"
            label="Primary button link"
            description={HREF_HINT}
          />
        </div>
        <Field orientation="horizontal" className="rounded-lg border p-3">
          <Switch
            id={switchId}
            checked={secondary !== null && secondary !== undefined}
            disabled={disabled}
            onCheckedChange={(checked) =>
              form.setValue('content.secondaryCta', checked ? { label: '', href: '' } : null, {
                shouldDirty: true,
                shouldValidate: form.formState.isSubmitted,
              })
            }
          />
          <div className="flex flex-col gap-0.5">
            <FieldLabel htmlFor={switchId}>Show a secondary button</FieldLabel>
            <FieldDescription>Usually a softer action such as “See pricing”.</FieldDescription>
          </div>
        </Field>
        {secondary ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="content.secondaryCta.label" label="Secondary button label" />
            <TextField
              control={control}
              name="content.secondaryCta.href"
              label="Secondary button link"
              description={HREF_HINT}
            />
          </div>
        ) : null}
      </FormSection>
      <FormSection stacked title="Image & badges">
        <ImageField
          control={control}
          name="content.imageUrl"
          label="Image"
          description="Optional illustration or product screenshot."
          nullable
          aspect="wide"
          folder={MEDIA_FOLDER}
        />
        <TagField
          control={control}
          name="content.badges"
          label="Badges"
          description="Short trust signals shown under the buttons. Press Enter to add."
          placeholder="e.g. Free plan available"
        />
      </FormSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// logos
// ---------------------------------------------------------------------------

function LogosFields({ form, disabled }: TypeFormProps<'logos'>) {
  const { control } = form;
  const items = useWatch({ control, name: 'content.items' });
  return (
    <>
      <FormSection stacked title="Heading">
        <TextField control={control} name="content.title" label="Title" placeholder="Trusted by…" />
      </FormSection>
      <FormSection stacked title="Logos" description="Transparent PNG or SVG logos look best. They are shown in a row.">
        <ArrayFieldList
          control={control}
          name="content.items"
          itemNoun="logo"
          itemTitle={(i) => items?.[i]?.name || `Logo ${i + 1}`}
          disabled={disabled}
          newItem={() => ({ name: '', imageUrl: '' })}
          renderItem={(i) => (
            <>
              <TextField control={control} name={`content.items.${i}.name` as const} label="Company name" />
              <ImageField
                control={control}
                name={`content.items.${i}.imageUrl` as const}
                label="Logo image"
                aspect="logo"
                folder={MEDIA_FOLDER}
              />
            </>
          )}
        />
      </FormSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// features
// ---------------------------------------------------------------------------

function FeaturesFields({ form, disabled }: TypeFormProps<'features'>) {
  const { control } = form;
  const items = useWatch({ control, name: 'content.items' });
  return (
    <>
      <FormSection stacked title="Heading">
        <TextField control={control} name="content.eyebrow" label="Eyebrow" nullable placeholder="Optional" />
        <TextField control={control} name="content.title" label="Title" />
        <TextareaField control={control} name="content.subtitle" label="Subtitle" nullable rows={2} placeholder="Optional" />
      </FormSection>
      <FormSection stacked title="Features" description="Each feature has an icon, a title, a description and an optional image.">
        <ArrayFieldList
          control={control}
          name="content.items"
          itemNoun="feature"
          itemTitle={(i) => items?.[i]?.title || `Feature ${i + 1}`}
          disabled={disabled}
          newItem={() => ({ icon: 'sparkles' as const, title: '', description: '', imageUrl: null })}
          renderItem={(i) => (
            <>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
                <IconField control={control} name={`content.items.${i}.icon` as const} label="Icon" />
                <TextField control={control} name={`content.items.${i}.title` as const} label="Title" />
              </div>
              <TextareaField
                control={control}
                name={`content.items.${i}.description` as const}
                label="Description"
                rows={2}
              />
              <ImageField
                control={control}
                name={`content.items.${i}.imageUrl` as const}
                label="Image (optional)"
                nullable
                aspect="wide"
                folder={MEDIA_FOLDER}
              />
            </>
          )}
        />
      </FormSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// steps
// ---------------------------------------------------------------------------

function StepsFields({ form, disabled }: TypeFormProps<'steps'>) {
  const { control } = form;
  const items = useWatch({ control, name: 'content.items' });
  return (
    <>
      <FormSection stacked title="Heading">
        <TextField control={control} name="content.title" label="Title" />
        <TextareaField control={control} name="content.subtitle" label="Subtitle" nullable rows={2} placeholder="Optional" />
      </FormSection>
      <FormSection stacked title="Steps" description="Shown as a numbered sequence in this order.">
        <ArrayFieldList
          control={control}
          name="content.items"
          itemNoun="step"
          itemTitle={(i) => `${i + 1}. ${items?.[i]?.title || 'Untitled step'}`}
          disabled={disabled}
          newItem={() => ({ title: '', description: '' })}
          renderItem={(i) => (
            <>
              <TextField control={control} name={`content.items.${i}.title` as const} label="Title" />
              <TextareaField
                control={control}
                name={`content.items.${i}.description` as const}
                label="Description"
                rows={2}
              />
            </>
          )}
        />
      </FormSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

function StatsFields({ form, disabled }: TypeFormProps<'stats'>) {
  const { control } = form;
  return (
    <FormSection stacked title="Stats" description="Big numbers with a short label, e.g. “92%” / “of action items completed on time”.">
      <ArrayFieldList
        control={control}
        name="content.items"
        itemNoun="stat"
        columns={2}
        disabled={disabled}
        newItem={() => ({ value: '', label: '' })}
        renderItem={(i) => (
          <>
            <TextField control={control} name={`content.items.${i}.value` as const} label="Value" placeholder="4.2 hrs" />
            <TextField control={control} name={`content.items.${i}.label` as const} label="Label" />
          </>
        )}
      />
    </FormSection>
  );
}

// ---------------------------------------------------------------------------
// testimonials
// ---------------------------------------------------------------------------

function TestimonialsFields({ form, disabled }: TypeFormProps<'testimonials'>) {
  const { control } = form;
  const items = useWatch({ control, name: 'content.items' });
  return (
    <>
      <FormSection stacked title="Heading">
        <TextField control={control} name="content.title" label="Title" />
      </FormSection>
      <FormSection stacked title="Testimonials">
        <ArrayFieldList
          control={control}
          name="content.items"
          itemNoun="testimonial"
          itemTitle={(i) => items?.[i]?.name || `Testimonial ${i + 1}`}
          disabled={disabled}
          newItem={() => ({ quote: '', name: '', role: '', avatarUrl: null })}
          renderItem={(i) => (
            <>
              <TextareaField control={control} name={`content.items.${i}.quote` as const} label="Quote" rows={3} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={control} name={`content.items.${i}.name` as const} label="Name" />
                <TextField
                  control={control}
                  name={`content.items.${i}.role` as const}
                  label="Role"
                  placeholder="Product Manager"
                />
              </div>
              <ImageField
                control={control}
                name={`content.items.${i}.avatarUrl` as const}
                label="Avatar (optional)"
                nullable
                aspect="square"
                folder={MEDIA_FOLDER}
              />
            </>
          )}
        />
      </FormSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// pricing
// ---------------------------------------------------------------------------

function PricingFields({ form }: TypeFormProps<'pricing'>) {
  const { control } = form;
  return (
    <FormSection stacked title="Pricing table">
      <Alert>
        <Info />
        <AlertDescription>
          <span>
            Only the heading is edited here. The plan cards come from{' '}
            <Link href="/content/plans" className="font-medium underline underline-offset-4">
              Content → Plans
            </Link>{' '}
            (active plans, in their sort order).
          </span>
        </AlertDescription>
      </Alert>
      <TextField control={control} name="content.title" label="Title" />
      <TextareaField control={control} name="content.subtitle" label="Subtitle" nullable rows={2} placeholder="Optional" />
    </FormSection>
  );
}

// ---------------------------------------------------------------------------
// faq
// ---------------------------------------------------------------------------

function FaqFields({ form, disabled }: TypeFormProps<'faq'>) {
  const { control } = form;
  const items = useWatch({ control, name: 'content.items' });
  return (
    <>
      <FormSection stacked title="Heading">
        <TextField control={control} name="content.title" label="Title" />
      </FormSection>
      <FormSection stacked title="Questions">
        <ArrayFieldList
          control={control}
          name="content.items"
          itemNoun="question"
          itemTitle={(i) => items?.[i]?.question || `Question ${i + 1}`}
          disabled={disabled}
          newItem={() => ({ question: '', answer: '' })}
          renderItem={(i) => (
            <>
              <TextField control={control} name={`content.items.${i}.question` as const} label="Question" />
              <TextareaField control={control} name={`content.items.${i}.answer` as const} label="Answer" rows={3} />
            </>
          )}
        />
      </FormSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// cta
// ---------------------------------------------------------------------------

function CtaFields({ form }: TypeFormProps<'cta'>) {
  const { control } = form;
  return (
    <>
      <FormSection stacked title="Copy">
        <TextField control={control} name="content.title" label="Title" />
        <TextareaField control={control} name="content.subtitle" label="Subtitle" nullable rows={2} placeholder="Optional" />
      </FormSection>
      <FormSection stacked title="Button">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={control} name="content.cta.label" label="Button label" />
          <TextField control={control} name="content.cta.href" label="Button link" description={HREF_HINT} />
        </div>
      </FormSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// rich_text
// ---------------------------------------------------------------------------

function RichTextFields({ form }: TypeFormProps<'rich_text'>) {
  return (
    <FormSection stacked title="Content" description="GitHub-flavoured markdown: headings, lists, links, tables and quotes.">
      <MarkdownField control={form.control} name="content.markdown" label="Markdown" rows={18} />
    </FormSection>
  );
}

// ---------------------------------------------------------------------------
// onboarding_slide
// ---------------------------------------------------------------------------

function OnboardingSlideFields({ form }: TypeFormProps<'onboarding_slide'>) {
  const { control } = form;
  return (
    <>
      <FormSection stacked title="Slide copy" description="Slides are shown in order the first time someone opens the Android app.">
        <TextField control={control} name="content.title" label="Title" />
        <TextareaField control={control} name="content.description" label="Description" rows={3} />
      </FormSection>
      <FormSection stacked title="Visuals">
        <ImageField
          control={control}
          name="content.imageUrl"
          label="Illustration"
          description="Square images work best (shown above the text)."
          nullable
          aspect="square"
          folder={MEDIA_FOLDER}
        />
        <ColorField
          control={control}
          name="content.backgroundColor"
          label="Background colour"
          description="Leave empty to use the app's default background."
          nullable
        />
      </FormSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------

/**
 * Structured content form for a section. The editor owns one form typed with the content union; each type's
 * fields receive the same form narrowed to that type (a single cast at this boundary).
 */
export function SectionContentForm({
  type,
  form,
  disabled,
}: {
  type: SectionType;
  form: SectionFormApi;
  disabled?: boolean;
}) {
  switch (type) {
    case 'hero':
      return <HeroFields form={form as unknown as SectionFormApi<'hero'>} disabled={disabled} />;
    case 'logos':
      return <LogosFields form={form as unknown as SectionFormApi<'logos'>} disabled={disabled} />;
    case 'features':
      return <FeaturesFields form={form as unknown as SectionFormApi<'features'>} disabled={disabled} />;
    case 'steps':
      return <StepsFields form={form as unknown as SectionFormApi<'steps'>} disabled={disabled} />;
    case 'stats':
      return <StatsFields form={form as unknown as SectionFormApi<'stats'>} disabled={disabled} />;
    case 'testimonials':
      return <TestimonialsFields form={form as unknown as SectionFormApi<'testimonials'>} disabled={disabled} />;
    case 'pricing':
      return <PricingFields form={form as unknown as SectionFormApi<'pricing'>} disabled={disabled} />;
    case 'faq':
      return <FaqFields form={form as unknown as SectionFormApi<'faq'>} disabled={disabled} />;
    case 'cta':
      return <CtaFields form={form as unknown as SectionFormApi<'cta'>} disabled={disabled} />;
    case 'rich_text':
      return <RichTextFields form={form as unknown as SectionFormApi<'rich_text'>} disabled={disabled} />;
    case 'onboarding_slide':
      return (
        <OnboardingSlideFields form={form as unknown as SectionFormApi<'onboarding_slide'>} disabled={disabled} />
      );
    default:
      return null;
  }
}

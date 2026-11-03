'use client';

import { useState } from 'react';
import type { FieldPath } from 'react-hook-form';
import { z } from 'zod';

import { FormField, NumberField, SwitchField, TextareaField, TextField } from '@/components/forms/fields';
import { StringListField } from '@/components/forms/string-list-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { getErrorMessage, isApiError, markErrorHandled } from '@/lib/api/errors';
import { useCreatePlan, useUpdatePlan, type PlanInput } from '@/lib/api/plans';
import type { AdminPlan } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { requiredString, slug } from '@/lib/schemas/common';
import { slugify } from '@/lib/utils';

const limit = z
  .number({ error: 'Enter a number or tick Unlimited' })
  .int('Use a whole number')
  .min(0, 'Cannot be negative')
  .nullable();

const price = z.number({ error: 'Enter a price' }).min(0, 'Price cannot be negative');

const planSchema = z.object({
  name: requiredString('Name').max(40),
  slug,
  description: z.string().trim().max(200).nullable(),
  priceMonthly: price,
  priceYearly: price,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO currency code like USD'),
  // Validated at the list level so the message shows under the list (items have no error slot of their own).
  features: z
    .array(z.string())
    .max(20, 'Use at most 20 features')
    .refine((items) => items.every((item) => item.trim() !== ''), 'Fill in or remove empty features'),
  limits: z.object({ meetingsPerMonth: limit, aiQueriesPerDay: limit, uploadMinutesPerMonth: limit }),
  ctaLabel: z.string().trim().max(40).nullable(),
  isPopular: z.boolean(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number({ error: 'Enter a number' }).int().min(0),
}) satisfies z.ZodType<Required<PlanInput>>;

type PlanValues = z.infer<typeof planSchema>;

function toValues(plan: AdminPlan | null, nextSortOrder: number): PlanValues {
  if (!plan) {
    return {
      name: '',
      slug: '',
      description: null,
      priceMonthly: 0,
      priceYearly: 0,
      currency: 'USD',
      features: [],
      limits: { meetingsPerMonth: null, aiQueriesPerDay: null, uploadMinutesPerMonth: null },
      ctaLabel: null,
      isPopular: false,
      isDefault: false,
      isActive: true,
      sortOrder: nextSortOrder,
    };
  }
  return {
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    currency: plan.currency,
    features: [...plan.features],
    limits: { ...plan.limits },
    ctaLabel: plan.ctaLabel,
    isPopular: plan.isPopular,
    isDefault: plan.isDefault,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
  };
}

const LIMITS: { name: FieldPath<PlanValues>; label: string; unit: string }[] = [
  { name: 'limits.meetingsPerMonth', label: 'Meetings per month', unit: 'meetings' },
  { name: 'limits.aiQueriesPerDay', label: 'Ask-AI queries per day', unit: 'queries' },
  { name: 'limits.uploadMinutesPerMonth', label: 'Upload minutes per month', unit: 'min' },
];

/** Number input with an "Unlimited" checkbox that stores `null`. */
function LimitInput({
  id,
  value,
  onChange,
  onBlur,
  unit,
  disabled,
  ...aria
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur: () => void;
  unit: string;
  disabled?: boolean;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}) {
  const [lastNumber, setLastNumber] = useState<number>(value ?? 10);
  const unlimited = value === null;
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <Input
          id={id}
          type="number"
          min={0}
          step={1}
          disabled={disabled || unlimited}
          value={unlimited || Number.isNaN(value) ? '' : value}
          placeholder={unlimited ? 'Unlimited' : '0'}
          onBlur={onBlur}
          onChange={(e) => {
            const next = e.target.value === '' ? Number.NaN : e.target.valueAsNumber;
            if (!Number.isNaN(next)) setLastNumber(next);
            onChange(next);
          }}
          className="pr-20"
          {...aria}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {unit}
        </span>
      </div>
      <Label className="flex shrink-0 items-center gap-2 font-normal">
        <Checkbox
          checked={unlimited}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked === true ? null : lastNumber)}
        />
        Unlimited
      </Label>
    </div>
  );
}

interface PlanDialogProps {
  plan: AdminPlan | null;
  nextSortOrder: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlanDialog({ plan, nextSortOrder, open, onOpenChange }: PlanDialogProps) {
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const form = useZodForm(planSchema, { defaultValues: toValues(plan, nextSortOrder) });
  const { control } = form;
  const [slugTouched, setSlugTouched] = useState(Boolean(plan));
  const pending = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit(async (body) => {
    try {
      if (plan) await update.mutateAsync({ id: plan.id, ...body });
      else await create.mutateAsync(body);
      onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <DialogHeader>
            <DialogTitle>{plan ? `Edit ${plan.name}` : 'New plan'}</DialogTitle>
            <DialogDescription>
              Plans are shown on the pricing page and in the app, and their limits are enforced by the API.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={control}
              name="name"
              label="Name"
              render={({ field, id, aria }) => (
                <Input
                  id={id}
                  {...aria}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  placeholder="Pro"
                  onChange={(e) => {
                    field.onChange(e.target.value);
                    if (!slugTouched) {
                      form.setValue('slug', slugify(e.target.value), { shouldDirty: true });
                    }
                  }}
                />
              )}
            />
            <FormField
              control={control}
              name="slug"
              label="Slug"
              description="Stable identifier used by the API and clients."
              render={({ field, id, aria }) => (
                <Input
                  id={id}
                  {...aria}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  className="font-mono"
                  onChange={(e) => {
                    setSlugTouched(true);
                    field.onChange(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                  }}
                />
              )}
            />
          </div>
          <TextareaField control={control} name="description" label="Description" nullable rows={2} />

          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField control={control} name="priceMonthly" label="Monthly price" min={0} step={0.01} />
            <NumberField
              control={control}
              name="priceYearly"
              label="Yearly price"
              min={0}
              step={0.01}
              description="Total per year."
            />
            <FormField
              control={control}
              name="currency"
              label="Currency"
              render={({ field, id, aria }) => (
                <Input
                  id={id}
                  {...aria}
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value}
                  maxLength={3}
                  className="font-mono uppercase"
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                />
              )}
            />
          </div>

          <StringListField
            control={control}
            name="features"
            label="Features"
            description="Bullet points on the pricing card, in this order."
            placeholder="Unlimited meetings"
            addLabel="Add feature"
          />

          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">Limits</legend>
            {LIMITS.map((l) => (
              <FormField
                key={l.name}
                control={control}
                name={l.name}
                label={l.label}
                render={({ field, id, aria }) => (
                  <LimitInput
                    id={id}
                    value={field.value as number | null}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    unit={l.unit}
                    disabled={field.disabled}
                    {...aria}
                  />
                )}
              />
            ))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField control={control} name="ctaLabel" label="Button label" nullable placeholder="Start Pro trial" />
            <NumberField
              control={control}
              name="sortOrder"
              label="Sort order"
              min={0}
              step={1}
              description="Lower numbers are shown first."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SwitchField control={control} name="isPopular" label="Popular" description="Highlighted card." />
            <SwitchField control={control} name="isDefault" label="Default" description="Assigned to new users." />
            <SwitchField control={control} name="isActive" label="Active" description="Shown on pricing." />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {plan ? 'Save plan' : 'Create plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

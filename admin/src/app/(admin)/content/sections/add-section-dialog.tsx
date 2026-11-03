'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import { FormField, SelectField, TextField } from '@/components/forms/fields';
import { PLATFORM_LABELS, SECTION_PAGE_META } from '@/components/sections/section-meta';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { useCreateSection, type SectionPage } from '@/lib/api/sections';
import { SECTION_TYPES, type SectionType } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { requiredString } from '@/lib/schemas/common';
import { defaultSectionContent, SECTION_TYPE_META, SUGGESTED_TYPES } from '@/lib/schemas/sections';
import { cn } from '@/lib/utils';

const addSectionSchema = z.object({
  type: z.enum(SECTION_TYPES),
  name: requiredString('Name').max(80, 'Keep the name under 80 characters'),
  platform: z.enum(['web', 'mobile', 'all']),
});

function TypeOption({ type, selected }: { type: SectionType; selected: boolean }) {
  const id = `section-type-${type}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50',
        selected && 'border-primary bg-primary/5',
      )}
    >
      <RadioGroupItem id={id} value={type} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{SECTION_TYPE_META[type].label}</span>
        <span className="block text-xs text-muted-foreground">{SECTION_TYPE_META[type].description}</span>
      </span>
    </label>
  );
}

function AddSectionForm({ page, onDone }: { page: SectionPage; onDone: () => void }) {
  const router = useRouter();
  const create = useCreateSection();
  const suggested = SUGGESTED_TYPES[page] ?? [];
  const others = SECTION_TYPES.filter((t) => !suggested.includes(t));
  const firstType: SectionType = suggested[0] ?? 'hero';
  const form = useZodForm(addSectionSchema, {
    defaultValues: {
      type: firstType,
      name: SECTION_TYPE_META[firstType].label,
      platform: SECTION_PAGE_META[page].defaultPlatform,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const created = await create.mutateAsync({
        page,
        type: values.type,
        name: values.name,
        platform: values.platform,
        isActive: false,
        content: defaultSectionContent(values.type),
      });
      onDone();
      router.push(`/content/sections/${created.id}`);
    } catch (error) {
      applyFormErrors(error, form);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <DialogHeader>
        <DialogTitle>Add a section to the {SECTION_PAGE_META[page].label.toLowerCase()}</DialogTitle>
        <DialogDescription>
          It starts with placeholder content and hidden, so nothing changes on the site until you activate it.
        </DialogDescription>
      </DialogHeader>
      <FormField
        control={form.control}
        name="type"
        label="Section type"
        render={({ field, aria }) => (
          <RadioGroup
            value={field.value}
            onValueChange={(value) => {
              const type = value as SectionType;
              field.onChange(type);
              if (!form.getFieldState('name').isDirty) {
                form.setValue('name', SECTION_TYPE_META[type].label);
              }
            }}
            aria-label="Section type"
            {...aria}
            className="gap-4"
          >
            {suggested.length ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Suggested for this page</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {suggested.map((type) => (
                    <TypeOption key={type} type={type} selected={field.value === type} />
                  ))}
                </div>
              </div>
            ) : null}
            {others.length ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Other types</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {others.map((type) => (
                    <TypeOption key={type} type={type} selected={field.value === type} />
                  ))}
                </div>
              </div>
            ) : null}
          </RadioGroup>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField control={form.control} name="name" label="Name" description="Only shown in the admin panel." />
        <SelectField
          control={form.control}
          name="platform"
          label="Platform"
          options={[
            { value: 'web', label: PLATFORM_LABELS.web },
            { value: 'mobile', label: PLATFORM_LABELS.mobile },
            { value: 'all', label: PLATFORM_LABELS.all },
          ]}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Spinner /> : <Plus />} Add section
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddSectionDialog({
  page,
  open,
  onOpenChange,
}: {
  page: SectionPage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        {open ? <AddSectionForm key={page} page={page} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { TriangleAlert, X } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';

import { BannerPreview } from '@/components/cms/banner-preview';
import { FormField, SelectField, SwitchField, TextareaField, TextField } from '@/components/forms/fields';
import { ImageField } from '@/components/media/image-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useCreateBanner, useUpdateBanner, type BannerInput } from '@/lib/api/banners';
import type { AdminBanner } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { bodyText, nullableHref, nullableImageUrl, optionalTitleText, titleText } from '@/lib/schemas/common';
import { isoToLocalInput, localInputToIso } from '@/lib/utils';

import { PLACEMENT_LABELS, placementWarning, PLATFORM_LABELS, VARIANT_LABELS } from './banner-schedule';

const bannerSchema = z
  .object({
    platform: z.enum(['web', 'mobile', 'all']),
    placement: z.enum(['dashboard', 'landing_top', 'mobile_home']),
    variant: z.enum(['info', 'success', 'warning', 'promo']),
    title: titleText('Title'),
    body: bodyText('Body').nullable(),
    imageUrl: nullableImageUrl,
    ctaLabel: optionalTitleText('Button label').nullable(),
    ctaUrl: nullableHref,
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End must be after the start' });
    }
    if (v.ctaLabel && !v.ctaUrl) {
      ctx.addIssue({ code: 'custom', path: ['ctaUrl'], message: 'Add a link for the button' });
    }
    if (v.ctaUrl && !v.ctaLabel) {
      ctx.addIssue({ code: 'custom', path: ['ctaLabel'], message: 'Add a label for the button' });
    }
  }) satisfies z.ZodType<Required<BannerInput>>;

type BannerValues = z.infer<typeof bannerSchema>;

function toValues(banner: AdminBanner | null): BannerValues {
  if (!banner) {
    return {
      platform: 'web',
      placement: 'dashboard',
      variant: 'info',
      title: '',
      body: null,
      imageUrl: null,
      ctaLabel: null,
      ctaUrl: null,
      startsAt: null,
      endsAt: null,
      isActive: true,
    };
  }
  return {
    platform: banner.platform,
    placement: banner.placement,
    variant: banner.variant,
    title: banner.title,
    body: banner.body,
    imageUrl: banner.imageUrl,
    ctaLabel: banner.ctaLabel,
    ctaUrl: banner.ctaUrl,
    startsAt: banner.startsAt,
    endsAt: banner.endsAt,
    isActive: banner.isActive,
  };
}

function options<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

interface BannerDialogProps {
  banner: AdminBanner | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create/edit a banner with a live preview. Remount (key) per banner so defaults reset. */
export function BannerDialog({ banner, open, onOpenChange }: BannerDialogProps) {
  const create = useCreateBanner();
  const update = useUpdateBanner();
  const form = useZodForm(bannerSchema, { defaultValues: toValues(banner) });
  const { control } = form;
  const values = useWatch({ control }) as BannerValues;
  const pending = create.isPending || update.isPending;
  const warning = placementWarning(values.platform, values.placement);

  const onSubmit = form.handleSubmit(async (body) => {
    try {
      if (banner) await update.mutateAsync({ id: banner.id, ...body });
      else await create.mutateAsync(body);
      onOpenChange(false);
    } catch (error) {
      applyFormErrors(error, form);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-5xl">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{banner ? 'Edit banner' : 'New banner'}</DialogTitle>
            <DialogDescription>
              Banners appear on the web dashboard, the top of the landing page or the mobile home screen.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <SelectField control={control} name="platform" label="Platform" options={options(PLATFORM_LABELS)} />
                <SelectField control={control} name="placement" label="Placement" options={options(PLACEMENT_LABELS)} />
                <SelectField control={control} name="variant" label="Variant" options={options(VARIANT_LABELS)} />
              </div>
              {warning ? (
                <Alert>
                  <TriangleAlert />
                  <AlertDescription>{warning}</AlertDescription>
                </Alert>
              ) : null}
              <TextField control={control} name="title" label="Title" />
              <TextareaField control={control} name="body" label="Body" nullable rows={3} />
              <ImageField control={control} name="imageUrl" label="Image" nullable aspect="wide" folder="banners" />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={control} name="ctaLabel" label="Button label" nullable placeholder="Learn more" />
                <TextField
                  control={control}
                  name="ctaUrl"
                  label="Button link"
                  nullable
                  placeholder="/pricing or remi://ask"
                  description="Paths, full URLs or app deep links."
                  inputProps={{ className: 'font-mono' }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(['startsAt', 'endsAt'] as const).map((name) => (
                  <FormField
                    key={name}
                    control={control}
                    name={name}
                    label={name === 'startsAt' ? 'Starts at' : 'Ends at'}
                    description={name === 'startsAt' ? 'Empty = immediately.' : 'Empty = no end date.'}
                    render={({ field, id, aria }) => (
                      <div className="flex items-center gap-1">
                        <Input
                          id={id}
                          type="datetime-local"
                          {...aria}
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={isoToLocalInput(field.value)}
                          onChange={(e) => field.onChange(localInputToIso(e.target.value))}
                        />
                        {field.value ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Clear ${name === 'startsAt' ? 'start' : 'end'} date`}
                            onClick={() => field.onChange(null)}
                          >
                            <X />
                          </Button>
                        ) : null}
                      </div>
                    )}
                  />
                ))}
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Times use your browser&apos;s timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}) and are
                stored in UTC.
              </p>
              <SwitchField control={control} name="isActive" label="Active" description="Inactive banners are never shown." />
            </div>
            <div className="space-y-2 lg:sticky lg:top-0 lg:self-start">
              <p className="text-sm font-medium">Live preview</p>
              <div className="rounded-lg border bg-muted/40 p-3">
                <BannerPreview banner={values} />
              </div>
              <p className="text-xs text-muted-foreground">Uses the saved brand theme colours and radius.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {banner ? 'Save banner' : 'Create banner'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

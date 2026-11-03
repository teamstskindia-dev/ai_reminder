'use client';

import { TriangleAlert } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';

import { FEATURE_KEYS, FEATURE_LABELS } from '@/components/cms/feature-options';
import { SelectField, SwitchField, TextField } from '@/components/forms/fields';
import { IconField } from '@/components/forms/icon-select';
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
import { Spinner } from '@/components/ui/spinner';
import { useCreateNavItem, useUpdateNavItem, type NavItemInput } from '@/lib/api/navigation';
import type { AdminNavItem, NavLocation } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { href, iconKey, requiredString, routeName } from '@/lib/schemas/common';

export const LOCATION_META: Record<NavLocation, { label: string; description: string }> = {
  header: { label: 'Website header', description: 'Top navigation of the marketing site.' },
  footer: { label: 'Website footer', description: 'Footer links grouped into columns by group label.' },
  sidebar: { label: 'Web app sidebar', description: 'Signed-in web app sidebar. Use app paths.' },
  mobile_tab: {
    label: 'Mobile tabs',
    description: 'Bottom tabs of the Android app, in this order. Hrefs are expo-router tab names.',
  },
};

export const SIDEBAR_PATHS = [
  '/dashboard',
  '/analytics/reports',
  '/analytics/overview',
  '/calendar',
  '/action-items',
  '/reminders',
  '/ask',
  '/settings',
] as const;
export const MOBILE_TABS = ['home', 'meetings', 'reminders', 'ask', 'profile'] as const;
const SITE_EXAMPLES = ['/pricing', '/#features', '/#how-it-works', '/p/about', '/login'] as const;

const navFields = {
  label: requiredString('Label').max(60, 'Keep labels under 60 characters'),
  icon: iconKey.nullable(),
  groupLabel: z.string().trim().max(40).nullable(),
  requiredFeature: z.enum(FEATURE_KEYS).nullable(),
  isExternal: z.boolean(),
  isActive: z.boolean(),
};

/** Web locations take paths/URLs (allow-listed schemes only); mobile tabs take expo-router route names. */
const webNavSchema = z.object({ ...navFields, href }) satisfies z.ZodType<Required<Omit<NavItemInput, 'location'>>>;
const mobileNavSchema = z.object({ ...navFields, href: routeName }) satisfies z.ZodType<
  Required<Omit<NavItemInput, 'location'>>
>;

type NavValues = z.infer<typeof webNavSchema>;

function defaults(item: AdminNavItem | null): NavValues {
  if (!item) {
    return {
      label: '',
      href: '',
      icon: null,
      groupLabel: null,
      requiredFeature: null,
      isExternal: false,
      isActive: true,
    };
  }
  return {
    label: item.label,
    href: item.href,
    icon: item.icon,
    groupLabel: item.groupLabel,
    requiredFeature: item.requiredFeature,
    isExternal: item.isExternal,
    isActive: item.isActive,
  };
}

function HrefHints({ location, onPick }: { location: NavLocation; onPick: (href: string) => void }) {
  const hints: readonly string[] =
    location === 'sidebar' ? SIDEBAR_PATHS : location === 'mobile_tab' ? MOBILE_TABS : SITE_EXAMPLES;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {location === 'sidebar'
          ? 'Valid web app paths:'
          : location === 'mobile_tab'
            ? 'Valid tab names:'
            : 'Paths, anchors, /p/{slug} pages, full URLs or mailto: links. Examples:'}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {hints.map((hint) => (
          <button
            key={hint}
            type="button"
            onClick={() => onPick(hint)}
            className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-xs hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}

interface NavItemDialogProps {
  location: NavLocation;
  item: AdminNavItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create/edit a navigation item. Remount (key) per item so defaults reset. */
export function NavItemDialog({ location, item, open, onOpenChange }: NavItemDialogProps) {
  const create = useCreateNavItem();
  const update = useUpdateNavItem();
  const form = useZodForm(location === 'mobile_tab' ? mobileNavSchema : webNavSchema, { defaultValues: defaults(item) });
  const { control } = form;
  const currentHref = useWatch({ control, name: 'href' });
  const pending = create.isPending || update.isPending;
  const unknownTab =
    location === 'mobile_tab' && currentHref.trim() !== '' && !(MOBILE_TABS as readonly string[]).includes(currentHref.trim());
  const unknownSidebar =
    location === 'sidebar' && currentHref.trim() !== '' && !(SIDEBAR_PATHS as readonly string[]).includes(currentHref.trim());

  const onSubmit = form.handleSubmit(async (values) => {
    const body: Omit<NavItemInput, 'location'> = {
      ...values,
      groupLabel: location === 'footer' ? values.groupLabel : null,
    };
    try {
      if (item) await update.mutateAsync({ id: item.id, ...body });
      else await create.mutateAsync({ location, ...body });
      onOpenChange(false);
    } catch (error) {
      applyFormErrors(error, form);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{item ? 'Edit navigation item' : 'Add navigation item'}</DialogTitle>
            <DialogDescription>{LOCATION_META[location].label}</DialogDescription>
          </DialogHeader>
          <TextField control={control} name="label" label="Label" placeholder="Pricing" />
          <div className="space-y-2">
            <TextField
              control={control}
              name="href"
              label={location === 'mobile_tab' ? 'Tab name' : 'Link'}
              inputProps={{ className: 'font-mono' }}
            />
            <HrefHints
              location={location}
              onPick={(value) => form.setValue('href', value, { shouldDirty: true, shouldValidate: true })}
            />
            {unknownTab ? (
              <Alert>
                <TriangleAlert />
                <AlertDescription>
                  “{currentHref}” is not a tab the app knows. Unknown tab names are ignored by the mobile app.
                </AlertDescription>
              </Alert>
            ) : null}
            {unknownSidebar ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Not one of the standard web app paths — make sure the website has this route.
              </p>
            ) : null}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <IconField
              control={control}
              name="icon"
              label="Icon"
              nullable
              description={location === 'header' || location === 'footer' ? 'Usually not shown on the website.' : undefined}
            />
            <SelectField
              control={control}
              name="requiredFeature"
              label="Requires feature"
              nullable
              noneLabel="Always shown"
              options={FEATURE_KEYS.map((key) => ({ value: key, label: FEATURE_LABELS[key] }))}
              description="Hidden when this feature flag is off."
            />
          </div>
          {location === 'footer' ? (
            <TextField
              control={control}
              name="groupLabel"
              label="Footer column"
              nullable
              placeholder="Product"
              description="Items with the same column label are grouped together."
            />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <SwitchField control={control} name="isExternal" label="External link" description="Opens in a new tab." />
            <SwitchField control={control} name="isActive" label="Active" description="Visible to users." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null}
              {item ? 'Save' : 'Add item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

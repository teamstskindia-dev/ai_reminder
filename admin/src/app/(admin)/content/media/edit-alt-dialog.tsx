'use client';

import { z } from 'zod';

import { RemoteImage } from '@/components/common/remote-image';
import { TextareaField } from '@/components/forms/fields';
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
import { useUpdateMedia } from '@/lib/api/media';
import type { MediaAsset } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';

const altSchema = z.object({ alt: z.string().trim().max(300, 'Keep alt text under 300 characters').nullable() });

export function EditAltDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: MediaAsset | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateMedia();
  const form = useZodForm(altSchema, { defaultValues: { alt: asset?.alt ?? null } });

  const onSubmit = form.handleSubmit(async ({ alt }) => {
    if (!asset) return;
    try {
      await update.mutateAsync({ id: asset.id, alt: alt === '' ? null : alt });
      onOpenChange(false);
    } catch (error) {
      applyFormErrors(error, form);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Edit alt text</DialogTitle>
            <DialogDescription>Describes the image for screen readers and when it fails to load.</DialogDescription>
          </DialogHeader>
          {asset ? (
            <RemoteImage
              src={asset.url}
              alt={asset.alt ?? asset.publicId}
              fit="contain"
              className="h-40 w-full rounded-md border bg-muted"
            />
          ) : null}
          <TextareaField control={form.control} name="alt" label="Alt text" nullable rows={3} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Spinner /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

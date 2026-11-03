'use client';

import { ImagePlus, X } from 'lucide-react';
import { useState } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';

import { RemoteImage } from '@/components/common/remote-image';
import { FormField, type BaseFieldProps } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { MediaPicker } from './media-picker';

interface ImageInputProps {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur?: () => void;
  /** Allow clearing to `null` (for `string | null` contract fields). */
  nullable?: boolean;
  disabled?: boolean;
  folder?: string;
  /** Thumbnail box shape. */
  aspect?: 'square' | 'wide' | 'logo';
  /** Checkerboard/dark background so white logos are visible. */
  dark?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

const ASPECT_CLASSES = {
  square: 'size-16',
  wide: 'h-16 w-28',
  logo: 'h-16 w-36',
} as const;

/** URL text input + thumbnail preview + "Choose from library". Pasting any URL always works. */
export function ImageInput({
  id,
  value,
  onChange,
  onBlur,
  nullable = false,
  disabled,
  folder,
  aspect = 'wide',
  dark = false,
  ...aria
}: ImageInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          'shrink-0 overflow-hidden rounded-md border',
          ASPECT_CLASSES[aspect],
          dark ? 'bg-neutral-900' : 'bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:12px_12px]',
        )}
      >
        <RemoteImage src={value} alt="Preview" fit="contain" className="size-full" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Input
          id={id}
          value={value ?? ''}
          disabled={disabled}
          placeholder="https://res.cloudinary.com/…"
          inputMode="url"
          onBlur={onBlur}
          onChange={(e) => {
            const next = e.target.value.trim();
            onChange(nullable && next === '' ? null : next);
          }}
          {...aria}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setPickerOpen(true)}>
            <ImagePlus /> Choose from library
          </Button>
          {nullable && value ? (
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
              <X /> Remove
            </Button>
          ) : null}
        </div>
      </div>
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedUrl={value}
        folder={folder}
        onSelect={(asset) => onChange(asset.url)}
      />
    </div>
  );
}

export function ImageField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  nullable,
  folder,
  aspect,
  dark,
  ...props
}: BaseFieldProps<T, N, TT> & Pick<ImageInputProps, 'nullable' | 'folder' | 'aspect' | 'dark'>) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => (
        <ImageInput
          id={id}
          value={(field.value as string | null) ?? null}
          onChange={(v) => field.onChange(v)}
          onBlur={field.onBlur}
          nullable={nullable}
          disabled={field.disabled}
          folder={folder}
          aspect={aspect}
          dark={dark}
          {...aria}
        />
      )}
    />
  );
}

'use client';

import { useId } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { HEX_COLOR_RE } from '@/lib/schemas/common';
import { cn } from '@/lib/utils';

import { FormField, type BaseFieldProps } from './fields';

function toSixDigit(hex: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`;
  }
  return hex;
}

interface ColorInputProps {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  onBlur?: () => void;
  nullable?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Native colour picker + hex text input kept in sync. */
export function ColorInput({ id, value, onChange, onBlur, nullable, disabled, className, ...aria }: ColorInputProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const valid = Boolean(value && HEX_COLOR_RE.test(value));
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label
        className={cn(
          'relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-xs',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        style={{ background: valid ? (value as string) : 'transparent' }}
        title="Pick a colour"
      >
        <span className="sr-only">Pick a colour</span>
        <input
          type="color"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          value={valid ? toSixDigit(value as string) : '#000000'}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onBlur={onBlur}
        />
        {!valid ? (
          <span className="absolute inset-0 bg-[repeating-conic-gradient(#d4d4d4_0_25%,transparent_0_50%)] bg-[length:8px_8px]" />
        ) : null}
      </label>
      <Input
        id={inputId}
        value={value ?? ''}
        placeholder={nullable ? 'None' : '#000000'}
        maxLength={7}
        disabled={disabled}
        className="font-mono uppercase"
        onBlur={onBlur}
        onChange={(e) => {
          let next = e.target.value.trim();
          if (next && !next.startsWith('#')) next = `#${next}`;
          onChange(nullable && next === '' ? null : next.toUpperCase());
        }}
        {...aria}
      />
    </div>
  );
}

export function ColorField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  nullable,
  ...props
}: BaseFieldProps<T, N, TT> & { nullable?: boolean }) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => (
        <ColorInput
          id={id}
          value={(field.value as string | null) ?? null}
          onChange={field.onChange}
          onBlur={field.onBlur}
          nullable={nullable}
          disabled={field.disabled}
          {...aria}
        />
      )}
    />
  );
}

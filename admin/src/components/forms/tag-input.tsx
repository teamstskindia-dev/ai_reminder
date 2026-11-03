'use client';

import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import type { FieldPath, FieldValues } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { FormField, type BaseFieldProps } from './fields';

interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Chips input: Enter or comma adds a tag, Backspace on an empty input removes the last one. */
export function TagInput({ id, value, onChange, onBlur, placeholder, disabled, className, ...aria }: TagInputProps) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const part of parts) if (!next.includes(part)) next.push(part);
    onChange(next);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
        aria['aria-invalid'] && 'border-destructive ring-3 ring-destructive/20',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {value.map((tag, index) => (
        <Badge key={`${tag}-${index}`} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            className="rounded-sm p-0.5 hover:bg-foreground/10"
            aria-label={`Remove ${tag}`}
            disabled={disabled}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="min-w-24 flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
        onChange={(e) => {
          if (e.target.value.includes(',')) add(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) add(draft);
          onBlur?.();
        }}
        {...aria}
      />
    </div>
  );
}

export function TagField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  placeholder = 'Type and press Enter',
  ...props
}: BaseFieldProps<T, N, TT> & { placeholder?: string }) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => (
        <TagInput
          id={id}
          value={(field.value as string[] | undefined) ?? []}
          onChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={placeholder}
          disabled={field.disabled}
          {...aria}
        />
      )}
    />
  );
}

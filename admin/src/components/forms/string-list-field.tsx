'use client';

import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import type { FieldPath, FieldValues } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { FormField, type BaseFieldProps } from './fields';

interface StringListEditorProps {
  id?: string;
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  placeholder?: string;
  addLabel?: string;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Editable ordered list of strings (e.g. plan feature bullets). */
export function StringListEditor({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  addLabel = 'Add item',
  disabled,
  ...aria
}: StringListEditorProps) {
  const update = (index: number, text: string) => onChange(value.map((v, i) => (i === index ? text : v)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item as string);
    onChange(next);
  };

  return (
    <div className="space-y-2" id={id} {...aria}>
      {value.map((item, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}.</span>
          <Input
            value={item}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={`Item ${index + 1}`}
            onBlur={onBlur}
            onChange={(e) => update(index, e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move up"
            disabled={disabled || index === 0}
            onClick={() => move(index, index - 1)}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Move down"
            disabled={disabled || index === value.length - 1}
            onClick={() => move(index, index + 1)}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove item"
            disabled={disabled}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, ''])}>
        <Plus /> {addLabel}
      </Button>
    </div>
  );
}

export function StringListField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  placeholder,
  addLabel,
  ...props
}: BaseFieldProps<T, N, TT> & { placeholder?: string; addLabel?: string }) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => (
        <StringListEditor
          id={id}
          value={(field.value as string[] | undefined) ?? []}
          onChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={placeholder}
          addLabel={addLabel}
          disabled={field.disabled}
          {...aria}
        />
      )}
    />
  );
}

'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  useFieldArray,
  type Control,
  type FieldArray,
  type FieldArrayPath,
  type FieldValues,
} from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ArrayFieldListProps<T extends FieldValues, N extends FieldArrayPath<T>> {
  control: Control<T, unknown, T>;
  name: N;
  /** Factory for a new, empty item. */
  newItem: () => FieldArray<T, N>;
  renderItem: (index: number) => ReactNode;
  /** Singular noun used in headings and buttons, e.g. "feature". */
  itemNoun: string;
  /** Optional heading text for an item (defaults to "<Noun> n"). */
  itemTitle?: (index: number) => string;
  maxItems?: number;
  disabled?: boolean;
  /** Lay items out in a grid (for small items like stats). */
  columns?: 1 | 2;
  /** Error message for the array itself (e.g. min/max). */
  error?: string;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** useFieldArray UI: each item in a card with move up/down and remove, plus an "Add" button. */
export function ArrayFieldList<T extends FieldValues, N extends FieldArrayPath<T>>({
  control,
  name,
  newItem,
  renderItem,
  itemNoun,
  itemTitle,
  maxItems,
  disabled,
  columns = 1,
  error,
}: ArrayFieldListProps<T, N>) {
  const { fields, append, remove, move } = useFieldArray<T, N, 'key', T>({ control, name, keyName: 'key' });
  const atMax = maxItems !== undefined && fields.length >= maxItems;

  return (
    <div className="space-y-3">
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No {itemNoun}s yet.
        </p>
      ) : (
        <ol className={cn('grid gap-3', columns === 2 && 'md:grid-cols-2')}>
          {fields.map((field, index) => (
            <li key={field.key} className="rounded-lg border bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{itemTitle?.(index) ?? `${capitalize(itemNoun)} ${index + 1}`}</span>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${itemNoun} ${index + 1} up`}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${itemNoun} ${index + 1} down`}
                    disabled={disabled || index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${itemNoun} ${index + 1}`}
                    disabled={disabled}
                    onClick={() => remove(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-4">{renderItem(index)}</div>
            </li>
          ))}
        </ol>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || atMax}
        onClick={() => append(newItem())}
      >
        <Plus /> Add {itemNoun}
      </Button>
    </div>
  );
}

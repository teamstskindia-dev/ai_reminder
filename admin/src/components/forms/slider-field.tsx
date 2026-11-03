'use client';

import type { FieldPath, FieldValues } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

import { FormField, type BaseFieldProps } from './fields';

/** Slider + numeric input kept in sync (the input carries the label for assistive tech). */
export function SliderField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  min,
  max,
  step = 1,
  unit,
  ...props
}: BaseFieldProps<T, N, TT> & { min: number; max: number; step?: number; unit?: string }) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => {
        const value = typeof field.value === 'number' && !Number.isNaN(field.value) ? field.value : min;
        const decimals = step < 1 ? String(step).split('.')[1]?.length ?? 1 : 0;
        return (
          <div className="flex items-center gap-4">
            <Slider
              min={min}
              max={max}
              step={step}
              value={[value]}
              disabled={field.disabled}
              onValueChange={(v) => field.onChange(Number((v[0] ?? min).toFixed(decimals)))}
              onValueCommit={() => field.onBlur()}
              className="flex-1"
            />
            <div className="relative w-24 shrink-0">
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                min={min}
                max={max}
                step={step}
                {...aria}
                name={field.name}
                ref={field.ref}
                disabled={field.disabled}
                onBlur={field.onBlur}
                value={Number.isNaN(field.value as number) ? '' : (field.value as number)}
                onChange={(e) => field.onChange(e.target.value === '' ? Number.NaN : e.target.valueAsNumber)}
                className={unit ? 'pr-8' : undefined}
              />
              {unit ? (
                <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
                  {unit}
                </span>
              ) : null}
            </div>
          </div>
        );
      }}
    />
  );
}

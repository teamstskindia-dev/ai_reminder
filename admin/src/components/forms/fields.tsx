'use client';

import { useId, type ReactNode } from 'react';
import {
  useController,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface BaseFieldProps<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T> {
  control: Control<T, unknown, TT>;
  name: N;
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
  disabled?: boolean;
}

export interface FieldRenderArgs<T extends FieldValues, N extends FieldPath<T>> {
  field: ControllerRenderProps<T, N>;
  id: string;
  invalid: boolean;
  /** aria attributes to spread on the control. */
  aria: { 'aria-invalid': boolean; 'aria-describedby'?: string };
}

/**
 * Generic react-hook-form field: label, description, error message and aria wiring around any control.
 */
export function FormField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  control,
  name,
  label,
  description,
  className,
  disabled,
  orientation = 'vertical',
  render,
}: BaseFieldProps<T, N, TT> & {
  orientation?: 'vertical' | 'horizontal';
  render: (args: FieldRenderArgs<T, N>) => ReactNode;
}) {
  const id = useId();
  const { field, fieldState } = useController<T, N, TT>({ control, name, disabled });
  const invalid = Boolean(fieldState.error);
  const descId = description ? `${id}-desc` : undefined;
  const errId = invalid ? `${id}-err` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(' ') || undefined;
  const control_ = render({ field, id, invalid, aria: { 'aria-invalid': invalid, 'aria-describedby': describedBy } });

  if (orientation === 'horizontal') {
    return (
      <Field orientation="horizontal" data-invalid={invalid} className={cn('items-start', className)}>
        <FieldContent>
          {label ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : null}
          {description ? <FieldDescription id={descId}>{description}</FieldDescription> : null}
          <FieldError id={errId} errors={[fieldState.error]} />
        </FieldContent>
        {control_}
      </Field>
    );
  }

  return (
    <Field data-invalid={invalid} className={className}>
      {label ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : null}
      {control_}
      {description ? <FieldDescription id={descId}>{description}</FieldDescription> : null}
      <FieldError id={errId} errors={[fieldState.error]} />
    </Field>
  );
}

type InputProps = Omit<React.ComponentProps<typeof Input>, 'name' | 'value' | 'onChange' | 'defaultValue'>;

/** Text input. With `nullable`, an empty input is stored as `null` (for `string | null` contract fields). */
export function TextField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  nullable = false,
  inputProps,
  placeholder,
  type = 'text',
  ...props
}: BaseFieldProps<T, N, TT> & {
  nullable?: boolean;
  placeholder?: string;
  type?: 'text' | 'email' | 'url' | 'password' | 'search';
  inputProps?: InputProps;
}) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => (
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          {...aria}
          {...inputProps}
          name={field.name}
          ref={field.ref}
          onBlur={field.onBlur}
          disabled={field.disabled}
          value={(field.value as string | null | undefined) ?? ''}
          onChange={(e) => field.onChange(nullable && e.target.value === '' ? null : e.target.value)}
        />
      )}
    />
  );
}

export function TextareaField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  nullable = false,
  rows = 3,
  placeholder,
  monospace = false,
  ...props
}: BaseFieldProps<T, N, TT> & { nullable?: boolean; rows?: number; placeholder?: string; monospace?: boolean }) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => (
        <Textarea
          id={id}
          rows={rows}
          placeholder={placeholder}
          className={cn(monospace && 'font-mono text-xs leading-relaxed')}
          {...aria}
          name={field.name}
          ref={field.ref}
          onBlur={field.onBlur}
          disabled={field.disabled}
          value={(field.value as string | null | undefined) ?? ''}
          onChange={(e) => field.onChange(nullable && e.target.value === '' ? null : e.target.value)}
        />
      )}
    />
  );
}

/**
 * Number input. Empty input → `null` when `nullable`, otherwise NaN (which the schema rejects with a
 * friendly "must be a number" message).
 */
export function NumberField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  nullable = false,
  min,
  max,
  step,
  suffix,
  placeholder,
  ...props
}: BaseFieldProps<T, N, TT> & {
  nullable?: boolean;
  min?: number;
  max?: number;
  step?: number | 'any';
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => {
        const value = field.value as number | null | undefined;
        return (
          <div className="relative">
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={step}
              placeholder={placeholder}
              className={cn(suffix && 'pr-16')}
              {...aria}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              disabled={field.disabled}
              value={value === null || value === undefined || Number.isNaN(value) ? '' : value}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') field.onChange(nullable ? null : Number.NaN);
                else field.onChange(e.target.valueAsNumber);
              }}
            />
            {suffix ? (
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                {suffix}
              </span>
            ) : null}
          </div>
        );
      }}
    />
  );
}

export function SwitchField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>(
  props: BaseFieldProps<T, N, TT>,
) {
  return (
    <FormField
      {...props}
      orientation="horizontal"
      className={cn('rounded-lg border p-3', props.className)}
      render={({ field, id, aria }) => (
        <Switch
          id={id}
          {...aria}
          name={field.name}
          ref={field.ref}
          onBlur={field.onBlur}
          disabled={field.disabled}
          checked={Boolean(field.value)}
          onCheckedChange={field.onChange}
        />
      )}
    />
  );
}

export interface SelectOption<V extends string = string> {
  value: V;
  label: ReactNode;
  description?: string;
}

/** Select bound to a string field. `nullable` adds a "None" option stored as `null`. */
export function SelectField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>({
  options,
  placeholder = 'Select…',
  nullable = false,
  noneLabel = 'None',
  triggerClassName,
  ...props
}: BaseFieldProps<T, N, TT> & {
  options: SelectOption[];
  placeholder?: string;
  nullable?: boolean;
  noneLabel?: string;
  triggerClassName?: string;
}) {
  const NONE = '__none__';
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => (
        <Select
          name={field.name}
          disabled={field.disabled}
          value={(field.value as string | null | undefined) ?? (nullable ? NONE : '')}
          onValueChange={(v) => field.onChange(nullable && v === NONE ? null : v)}
        >
          <SelectTrigger id={id} ref={field.ref} onBlur={field.onBlur} className={cn('w-full', triggerClassName)} {...aria}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {nullable ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

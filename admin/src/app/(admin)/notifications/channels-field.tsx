'use client';

import type { FieldPath, FieldValues } from 'react-hook-form';

import { FormField, type BaseFieldProps } from '@/components/forms/fields';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { REMINDER_CHANNELS, type ReminderChannel } from '@/lib/api/types';

import { CHANNEL_META } from './channels';

/** Checkbox group over the three delivery channels. */
export function ChannelsField<T extends FieldValues, N extends FieldPath<T>, TT extends FieldValues = T>(
  props: BaseFieldProps<T, N, TT>,
) {
  return (
    <FormField
      {...props}
      render={({ field, id, aria }) => {
        const value = (field.value as ReminderChannel[] | undefined) ?? [];
        const toggle = (channel: ReminderChannel, checked: boolean) => {
          const next = checked ? [...value, channel] : value.filter((c) => c !== channel);
          field.onChange(REMINDER_CHANNELS.filter((c) => next.includes(c)));
        };
        return (
          <div id={id} role="group" className="grid gap-2 sm:grid-cols-3" {...aria}>
            {REMINDER_CHANNELS.map((channel) => {
              const meta = CHANNEL_META[channel];
              const checkboxId = `${id}-${channel}`;
              return (
                <Label
                  key={channel}
                  htmlFor={checkboxId}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 font-normal has-data-[state=checked]:border-primary/40 has-data-[state=checked]:bg-primary/5"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={value.includes(channel)}
                    disabled={field.disabled}
                    onCheckedChange={(checked) => toggle(channel, checked === true)}
                    onBlur={field.onBlur}
                  />
                  <span className="space-y-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <meta.icon className="size-3.5" aria-hidden /> {meta.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">{meta.description}</span>
                  </span>
                </Label>
              );
            })}
          </div>
        );
      }}
    />
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateReminder, useUpdateReminder } from "@/hooks/queries/use-reminders";
import { applyFieldErrors } from "@/lib/form-errors";
import type { Reminder, ReminderChannel } from "@/lib/api/types";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/format";
import { toastError } from "@/lib/notify";
import { useFeature } from "@/providers/config-provider";

const CHANNELS: { value: ReminderChannel; label: string; hint: string }[] = [
  { value: "push", label: "Push", hint: "Phone notification" },
  { value: "in_app", label: "In-app", hint: "Bell + toast" },
  { value: "email", label: "Email", hint: "Inbox" },
];

const schema = z.object({
  title: z.string().trim().min(1, "Add a title").max(200),
  body: z.string().max(1000),
  remindAt: z
    .string()
    .min(1, "Pick a date and time")
    .refine((v) => {
      const iso = fromLocalInputValue(v);
      return iso !== null && new Date(iso).getTime() > Date.now();
    }, "Choose a time in the future"),
  channels: z.array(z.enum(["push", "in_app", "email"])).min(1, "Pick at least one channel"),
});

type FormValues = z.infer<typeof schema>;
const FIELDS = ["title", "body", "remindAt", "channels"] as const;

export interface ReminderPrefill {
  title?: string;
  body?: string;
  remindAt?: string;
  meetingId?: string;
  actionItemId?: string;
}

function defaultTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toLocalInputValue(d);
}

export function ReminderDialog({
  open,
  onOpenChange,
  reminder,
  prefill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this reminder; omit to create. */
  reminder?: Reminder | null;
  prefill?: ReminderPrefill;
}) {
  const create = useCreateReminder({ silent: true });
  const update = useUpdateReminder({ silent: true });
  const pushEnabled = useFeature("pushNotifications");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", body: "", remindAt: "", channels: ["push", "in_app"] },
  });
  const { errors } = form.formState;
  const pending = create.isPending || update.isPending;

  // Reset only when the dialog opens (props may be re-created on every parent render).
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    form.reset({
      title: reminder?.title ?? prefill?.title ?? "",
      body: reminder?.body ?? prefill?.body ?? "",
      remindAt: toLocalInputValue(reminder?.remindAt ?? prefill?.remindAt) || defaultTime(),
      channels: reminder?.channels?.length ? reminder.channels : pushEnabled ? ["push", "in_app"] : ["in_app"],
    });
  }, [open, reminder, prefill, form, pushEnabled]);

  const onSubmit = form.handleSubmit((values) => {
    const remindAt = fromLocalInputValue(values.remindAt) as string;
    const done = () => {
      toast.success(reminder ? "Reminder updated" : "Reminder set");
      onOpenChange(false);
    };
    const fail = (error: unknown) => {
      if (!applyFieldErrors(error, form.setError, FIELDS)) toastError(error);
    };
    if (reminder) {
      update.mutate(
        { id: reminder.id, input: { title: values.title, body: values.body || null, remindAt, channels: values.channels } },
        { onSuccess: done, onError: fail },
      );
    } else {
      create.mutate(
        {
          title: values.title,
          body: values.body || undefined,
          remindAt,
          channels: values.channels,
          meetingId: prefill?.meetingId,
          actionItemId: prefill?.actionItemId,
        },
        { onSuccess: done, onError: fail },
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{reminder ? "Edit reminder" : "New reminder"}</DialogTitle>
            <DialogDescription>We&apos;ll nudge you at the time you choose.</DialogDescription>
          </DialogHeader>
          <Field id="reminder-title" label="Title" error={errors.title?.message}>
            <Input id="reminder-title" placeholder="Send the proposal to Acme" aria-invalid={Boolean(errors.title)} {...form.register("title")} />
          </Field>
          <Field id="reminder-body" label="Notes" hint="Optional">
            <Textarea id="reminder-body" rows={3} placeholder="Anything you want to remember" {...form.register("body")} />
          </Field>
          <Field id="reminder-at" label="Remind me at" error={errors.remindAt?.message}>
            <Input id="reminder-at" type="datetime-local" aria-invalid={Boolean(errors.remindAt)} {...form.register("remindAt")} />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Notify me via</legend>
            <Controller
              control={form.control}
              name="channels"
              render={({ field }) => (
                <div className="grid grid-cols-3 gap-2">
                  {CHANNELS.filter((c) => c.value !== "push" || pushEnabled).map((channel) => {
                    const checked = field.value.includes(channel.value);
                    const id = `channel-${channel.value}`;
                    return (
                      <label
                        key={channel.value}
                        htmlFor={id}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-brand-soft/50"
                      >
                        <Checkbox
                          id={id}
                          checked={checked}
                          onCheckedChange={(next) =>
                            field.onChange(
                              next ? [...field.value, channel.value] : field.value.filter((v) => v !== channel.value),
                            )
                          }
                        />
                        <span>
                          <span className="block font-medium leading-none">{channel.label}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{channel.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
            {errors.channels?.message && <p className="text-xs text-destructive">{errors.channels.message}</p>}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : reminder ? "Save changes" : "Set reminder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCreateActionItem, useUpdateActionItem } from "@/hooks/queries/use-action-items";
import { applyFieldErrors } from "@/lib/form-errors";
import type { ActionItem, Priority } from "@/lib/api/types";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/format";
import { toastError } from "@/lib/notify";
import { useFeature } from "@/providers/config-provider";

const schema = z
  .object({
    title: z.string().trim().min(1, "Add a title").max(200),
    description: z.string().max(2000),
    dueAt: z.string(),
    priority: z.enum(["low", "medium", "high"]),
    remind: z.boolean(),
  })
  .refine((v) => !v.remind || Boolean(v.dueAt), { message: "Set a due date to get a reminder", path: ["dueAt"] });

type FormValues = z.infer<typeof schema>;
const FIELDS = ["title", "description", "dueAt", "priority", "remind"] as const;

export function ActionItemDialog({
  open,
  onOpenChange,
  item,
  meetingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this item; omit to create. */
  item?: ActionItem | null;
  /** Link a new item to a meeting. */
  meetingId?: string;
}) {
  const create = useCreateActionItem({ silent: true });
  const update = useUpdateActionItem({ silent: true });
  const remindersOn = useFeature("reminders");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "", dueAt: "", priority: "medium", remind: false },
  });
  const { errors } = form.formState;
  const pending = create.isPending || update.isPending;

  // Reset only when the dialog opens, so background refetches never wipe the user's edits.
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    form.reset({
      title: item?.title ?? "",
      description: item?.description ?? "",
      dueAt: toLocalInputValue(item?.dueAt),
      priority: item?.priority ?? "medium",
      remind: false,
    });
  }, [open, item, form]);

  const onSubmit = form.handleSubmit((values) => {
    const dueAt = fromLocalInputValue(values.dueAt);
    const fail = (error: unknown) => {
      if (!applyFieldErrors(error, form.setError, FIELDS)) toastError(error);
    };
    if (item) {
      update.mutate(
        {
          id: item.id,
          input: { title: values.title, description: values.description || null, dueAt, priority: values.priority },
        },
        {
          onSuccess: () => {
            toast.success("Action item updated");
            onOpenChange(false);
          },
          onError: fail,
        },
      );
    } else {
      create.mutate(
        {
          title: values.title,
          description: values.description || undefined,
          dueAt: dueAt ?? undefined,
          priority: values.priority,
          meetingId,
          remind: remindersOn && values.remind ? true : undefined,
        },
        {
          onSuccess: () => {
            toast.success(values.remind ? "Action item added — we'll remind you" : "Action item added");
            onOpenChange(false);
          },
          onError: fail,
        },
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{item ? "Edit action item" : "New action item"}</DialogTitle>
            <DialogDescription>Track a commitment and when it&apos;s due.</DialogDescription>
          </DialogHeader>
          <Field id="ai-title" label="Title" error={errors.title?.message}>
            <Input id="ai-title" placeholder="Share the Q4 roadmap deck" aria-invalid={Boolean(errors.title)} {...form.register("title")} />
          </Field>
          <Field id="ai-description" label="Description" hint="Optional">
            <Textarea id="ai-description" rows={3} {...form.register("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field id="ai-due" label="Due" error={errors.dueAt?.message}>
              <Input id="ai-due" type="datetime-local" aria-invalid={Boolean(errors.dueAt)} {...form.register("dueAt")} />
            </Field>
            <Field id="ai-priority" label="Priority">
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(v) => field.onChange(v as Priority)}>
                    <SelectTrigger id="ai-priority" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
          {!item && remindersOn && (
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 px-3 py-2.5">
              <label htmlFor="ai-remind" className="text-sm">
                <span className="block font-medium">Remind me</span>
                <span className="block text-xs text-muted-foreground">Get a reminder when it&apos;s due</span>
              </label>
              <Controller
                control={form.control}
                name="remind"
                render={({ field }) => <Switch id="ai-remind" checked={field.value} onCheckedChange={field.onChange} />}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : item ? "Save changes" : "Add action item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

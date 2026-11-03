"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCreateMeeting } from "@/hooks/queries/use-meetings";
import { applyFieldErrors } from "@/lib/form-errors";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/format";
import { MEET_URL_PATTERN } from "@/lib/meeting";
import { toastError } from "@/lib/notify";
import { reportHref } from "@/lib/routes";

const schema = z.object({
  meetingUrl: z
    .string()
    .trim()
    .min(1, "Paste the Google Meet link")
    .regex(MEET_URL_PATTERN, "Use a Google Meet link like https://meet.google.com/abc-defg-hij"),
  title: z.string().trim().min(1, "Give the meeting a title").max(200),
  startAt: z.string().min(1, "Choose when it starts"),
  autoJoin: z.boolean(),
});

type FormValues = z.infer<typeof schema>;
const FIELDS = ["meetingUrl", "title", "startAt", "autoJoin"] as const;

function nextQuarterHour(): string {
  const d = new Date();
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0);
  return toLocalInputValue(d);
}

export function AddMeetingDialog({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const create = useCreateMeeting({ silent: true });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { meetingUrl: "", title: "", startAt: "", autoJoin: true },
  });
  const { errors } = form.formState;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) form.reset({ meetingUrl: "", title: "", startAt: nextQuarterHour(), autoJoin: true });
  };

  const onSubmit = form.handleSubmit((values) => {
    const startAt = fromLocalInputValue(values.startAt);
    if (!startAt) {
      form.setError("startAt", { message: "Invalid date" });
      return;
    }
    create.mutate(
      { title: values.title, meetingUrl: values.meetingUrl, startAt, autoJoin: values.autoJoin },
      {
        onSuccess: (meeting) => {
          toast.success("Meeting added", { description: values.autoJoin ? "The notetaker will join when it starts." : undefined });
          setOpen(false);
          router.push(reportHref(meeting.id));
        },
        onError: (error) => {
          if (!applyFieldErrors(error, form.setError, FIELDS)) toastError(error);
        },
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> Add meeting
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Add a meeting</DialogTitle>
            <DialogDescription>Paste a Google Meet link and the notetaker will join at the start time.</DialogDescription>
          </DialogHeader>
          <Field id="meetingUrl" label="Google Meet link" error={errors.meetingUrl?.message}>
            <Input
              id="meetingUrl"
              inputMode="url"
              autoComplete="off"
              placeholder="https://meet.google.com/abc-defg-hij"
              aria-invalid={Boolean(errors.meetingUrl)}
              {...form.register("meetingUrl")}
            />
          </Field>
          <Field id="title" label="Title" error={errors.title?.message}>
            <Input id="title" placeholder="Weekly product sync" aria-invalid={Boolean(errors.title)} {...form.register("title")} />
          </Field>
          <Field id="startAt" label="Starts at" error={errors.startAt?.message}>
            <Input id="startAt" type="datetime-local" aria-invalid={Boolean(errors.startAt)} {...form.register("startAt")} />
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 px-3 py-2.5">
            <label htmlFor="autoJoin" className="text-sm">
              <span className="block font-medium">Send the notetaker</span>
              <span className="block text-xs text-muted-foreground">Join automatically at the start time</span>
            </label>
            <Controller
              control={form.control}
              name="autoJoin"
              render={({ field }) => <Switch id="autoJoin" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add meeting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

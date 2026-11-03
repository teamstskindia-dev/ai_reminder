'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Megaphone, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';

import { RoleGate } from '@/components/auth/role-gate';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { UserMultiPicker } from '@/components/common/user-picker';
import { DataTable } from '@/components/data-table/data-table';
import { FormField, SelectField, TextField, TextareaField } from '@/components/forms/fields';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useListParams } from '@/hooks/use-url-state';
import { useBroadcasts, useCreateBroadcast } from '@/lib/api/notifications';
import { usePlans } from '@/lib/api/plans';
import { REMINDER_CHANNELS, type AdminPlan, type Broadcast, type BroadcastAudience } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { BODY_MAX, requiredString, titleText } from '@/lib/schemas/common';
import { formatDateTime, formatNumber, formatRelative, truncate } from '@/lib/utils';

import { ChannelBadges, CHANNEL_META } from '../channels';
import { ChannelsField } from '../channels-field';
import { NotificationsNav } from '../notifications-nav';

function audienceLabel(audience: BroadcastAudience, plans: AdminPlan[] | undefined): string {
  switch (audience.type) {
    case 'all':
      return 'All users';
    case 'users':
      return `${audience.userIds.length} selected user${audience.userIds.length === 1 ? '' : 's'}`;
    case 'plan': {
      const plan = plans?.find((p) => p.id === audience.planId);
      return `Plan: ${plan?.name ?? 'unknown plan'}`;
    }
    default:
      return '—';
  }
}

const broadcastSchema = z
  .object({
    title: titleText('Title'),
    body: requiredString('Message').max(BODY_MAX, `Message must be ${BODY_MAX} characters or fewer`),
    channels: z.array(z.enum(REMINDER_CHANNELS)).min(1, 'Pick at least one channel'),
    audienceType: z.enum(['all', 'users', 'plan']),
    users: z.array(z.object({ id: z.string(), email: z.string(), name: z.string().nullable() })),
    planId: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.audienceType === 'users' && value.users.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['users'], message: 'Pick at least one user' });
    }
    if (value.audienceType === 'plan' && !value.planId) {
      ctx.addIssue({ code: 'custom', path: ['planId'], message: 'Pick a plan' });
    }
  });

type BroadcastForm = z.infer<typeof broadcastSchema>;

const DEFAULTS: BroadcastForm = {
  title: '',
  body: '',
  channels: ['push', 'in_app'],
  audienceType: 'all',
  users: [],
  planId: null,
};

function toAudience(values: BroadcastForm): BroadcastAudience {
  if (values.audienceType === 'users') return { type: 'users', userIds: values.users.map((u) => u.id) };
  if (values.audienceType === 'plan') return { type: 'plan', planId: values.planId ?? '' };
  return { type: 'all' };
}

function NewBroadcastDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const plans = usePlans();
  const create = useCreateBroadcast();
  const form = useZodForm(broadcastSchema, { defaultValues: DEFAULTS });
  const { control } = form;
  const audienceType = useWatch({ control, name: 'audienceType' });
  const [pending, setPending] = useState<BroadcastForm | null>(null);

  const close = () => {
    onOpenChange(false);
    form.reset(DEFAULTS);
  };

  const onSubmit = form.handleSubmit((values) => setPending(values));

  const send = async () => {
    if (!pending) return;
    try {
      await create.mutateAsync({
        title: pending.title,
        body: pending.body,
        channels: pending.channels,
        audience: toAudience(pending),
      });
      setPending(null);
      close();
    } catch (error) {
      // The mutation already toasted; close the confirmation and show field errors on the form.
      setPending(null);
      applyFormErrors(error, form);
    }
  };

  const summary = pending
    ? `${audienceLabel(toAudience(pending), plans.data)} via ${pending.channels.map((c) => CHANNEL_META[c].label).join(', ')}`
    : '';

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <DialogHeader>
              <DialogTitle>New broadcast</DialogTitle>
              <DialogDescription>
                Sends a notification immediately. Users who turned a channel off do not receive it on that channel.
              </DialogDescription>
            </DialogHeader>
            <TextField control={control} name="title" label="Title" placeholder="New: Ask AI across all meetings" />
            <TextareaField control={control} name="body" label="Message" rows={4} />
            <ChannelsField control={control} name="channels" label="Channels" />
            <FormField
              control={control}
              name="audienceType"
              label="Audience"
              render={({ field, id, aria }) => (
                <RadioGroup
                  id={id}
                  {...aria}
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-2 sm:grid-cols-3"
                >
                  {[
                    { value: 'all', label: 'All users' },
                    { value: 'users', label: 'Specific users' },
                    { value: 'plan', label: 'Users on a plan' },
                  ].map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`${id}-${option.value}`}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 font-normal has-data-[state=checked]:border-primary/40 has-data-[state=checked]:bg-primary/5"
                    >
                      <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
                      {option.label}
                    </Label>
                  ))}
                </RadioGroup>
              )}
            />
            {audienceType === 'users' ? (
              <FormField
                control={control}
                name="users"
                label="Users"
                render={({ field, invalid }) => (
                  <UserMultiPicker value={field.value} onChange={field.onChange} invalid={invalid} />
                )}
              />
            ) : null}
            {audienceType === 'plan' ? (
              <SelectField
                control={control}
                name="planId"
                label="Plan"
                placeholder={plans.isPending ? 'Loading plans…' : 'Select a plan'}
                options={(plans.data ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.name} · ${formatNumber(p.usersCount)} user${p.usersCount === 1 ? '' : 's'}`,
                }))}
              />
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">
                <Send /> Review & send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
        title="Send this broadcast now?"
        description={`“${pending ? truncate(pending.title, 80) : ''}” goes to ${summary}. This notifies real users and cannot be undone.`}
        confirmLabel="Send broadcast"
        onConfirm={send}
      />
    </>
  );
}

export function BroadcastsView() {
  const { url, page, limit } = useListParams([] as const);
  const params = useMemo(() => ({ page, limit }), [page, limit]);
  const broadcasts = useBroadcasts(params);
  const plans = usePlans();
  const [open, setOpen] = useState(false);

  const columns = useMemo<ColumnDef<Broadcast>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Broadcast',
        cell: ({ row }) => (
          <div className="max-w-md min-w-0 whitespace-normal">
            <p className="font-medium">{row.original.title}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.body}</p>
          </div>
        ),
      },
      {
        accessorKey: 'channels',
        header: 'Channels',
        cell: ({ row }) => <ChannelBadges channels={row.original.channels} />,
      },
      {
        id: 'audience',
        header: 'Audience',
        cell: ({ row }) => <span className="text-sm">{audienceLabel(row.original.audience, plans.data)}</span>,
      },
      {
        accessorKey: 'sentCount',
        header: 'Sent',
        cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.sentCount)}</span>,
      },
      {
        id: 'createdBy',
        header: 'By',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.createdBy?.name ?? 'System'}</span>,
      },
      {
        accessorKey: 'createdAt',
        header: 'Sent at',
        cell: ({ row }) => (
          <span className="text-muted-foreground" title={formatDateTime(row.original.createdAt)}>
            {formatRelative(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [plans.data],
  );

  return (
    <>
      <PageHeader
        title="Notifications"
        description="One-off announcements sent to all users, selected users or everyone on a plan."
        actions={
          <RoleGate minRole="admin">
            <Button onClick={() => setOpen(true)}>
              <Megaphone /> New broadcast
            </Button>
          </RoleGate>
        }
      />
      <NotificationsNav />
      <DataTable
        columns={columns}
        data={broadcasts.data?.items}
        meta={broadcasts.data?.meta}
        url={url}
        isLoading={broadcasts.isPending}
        isFetching={broadcasts.isFetching}
        error={broadcasts.error}
        onRetry={() => void broadcasts.refetch()}
        getRowId={(b) => b.id}
        empty={{
          icon: <Megaphone />,
          title: 'No broadcasts yet',
          description: 'Broadcasts you send appear here with how many users received them.',
        }}
      />
      <NewBroadcastDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

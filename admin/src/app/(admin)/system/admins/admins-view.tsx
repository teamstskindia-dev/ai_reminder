'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CheckCircle2, KeyRound, Lock, MoreHorizontal, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/states';
import { StatusBadge } from '@/components/common/status-badge';
import { DataTable } from '@/components/data-table/data-table';
import { SelectField, TextField } from '@/components/forms/fields';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { useAdmins, useCreateAdmin, useDeleteAdmin, useUpdateAdmin } from '@/lib/api/admins';
import { ADMIN_ROLES, type AdminRole, type AdminUser } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles';
import { email, requiredString } from '@/lib/schemas/common';
import { formatDate, formatRelative, initials } from '@/lib/utils';

import { PasswordField } from '@/components/system/password-field';
import { SafeAvatarImage } from '@/components/common/safe-avatar-image';

const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');

const createSchema = z.object({
  email,
  name: requiredString('Name').max(120),
  role: z.enum(ADMIN_ROLES),
  password,
});

const resetSchema = z.object({ password });

const roleOptions = ADMIN_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useCreateAdmin();
  const form = useZodForm(createSchema, { defaultValues: { email: '', name: '', role: 'editor', password: '' } });
  const role = useWatch({ control: form.control, name: 'role' });
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      applyFormErrors(error, form);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Invite admin</DialogTitle>
            <DialogDescription>
              Create an account with a temporary password. Share it securely; they can change it from their profile.
            </DialogDescription>
          </DialogHeader>
          <TextField control={form.control} name="email" label="Email" type="email" inputProps={{ autoComplete: 'off' }} />
          <TextField control={form.control} name="name" label="Name" />
          <SelectField
            control={form.control}
            name="role"
            label="Role"
            options={roleOptions}
            description={role ? ROLE_DESCRIPTIONS[role as AdminRole] : undefined}
          />
          <PasswordField control={form.control} name="password" label="Temporary password" description="At least 8 characters." />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : <UserPlus />} Create admin
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ admin, onOpenChange }: { admin: AdminUser | null; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateAdmin();
  const form = useZodForm(resetSchema, { defaultValues: { password: '' } });
  const onSubmit = form.handleSubmit(async ({ password: newPassword }) => {
    if (!admin) return;
    try {
      await update.mutateAsync({ id: admin.id, password: newPassword });
      form.reset();
      onOpenChange(false);
    } catch (error) {
      applyFormErrors(error, form);
    }
  });
  return (
    <Dialog
      open={Boolean(admin)}
      onOpenChange={(open) => {
        if (!open) form.reset();
        onOpenChange(open);
      }}
    >
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {admin?.name} ({admin?.email}). Their existing sessions keep working until they expire.
            </DialogDescription>
          </DialogHeader>
          <PasswordField control={form.control} name="password" label="New password" description="At least 8 characters." />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Spinner /> : <KeyRound />} Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type PendingAction = { type: 'status' | 'delete'; admin: AdminUser } | null;

function RowActions({
  admin,
  isSelf,
  onResetPassword,
  onAction,
}: {
  admin: AdminUser;
  isSelf: boolean;
  onResetPassword: (admin: AdminUser) => void;
  onAction: (action: PendingAction) => void;
}) {
  const update = useUpdateAdmin();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${admin.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="truncate">{admin.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={isSelf}>
            <ShieldCheck /> Change role
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={admin.role}
              onValueChange={(role) => {
                if (role !== admin.role) update.mutate({ id: admin.id, role: role as AdminRole });
              }}
            >
              {ADMIN_ROLES.map((role) => (
                <DropdownMenuRadioItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => onResetPassword(admin)}>
          <KeyRound /> Reset password
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isSelf} onSelect={() => onAction({ type: 'status', admin })}>
          {admin.status === 'active' ? <Ban /> : <CheckCircle2 />}
          {admin.status === 'active' ? 'Disable' : 'Enable'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={isSelf} onSelect={() => onAction({ type: 'delete', admin })}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminsView() {
  const { admin: me, can, isLoading: sessionLoading } = useAdminSession();
  const allowed = can('super_admin');
  const admins = useAdmins({ enabled: allowed });
  const update = useUpdateAdmin();
  const remove = useDeleteAdmin();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  if (!sessionLoading && !allowed) {
    return (
      <>
        <PageHeader title="Admins" />
        <EmptyState
          icon={<Lock />}
          title="Super admins only"
          description="Only super admins can view and manage admin accounts."
        />
      </>
    );
  }

  const columns: ColumnDef<AdminUser>[] = [
    {
      accessorKey: 'name',
      header: 'Admin',
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-8">
            <SafeAvatarImage src={row.original.avatarUrl} />
            <AvatarFallback className="text-xs">{initials(row.original.name || row.original.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-medium">
              {row.original.name}
              {row.original.id === me?.id ? <Badge variant="secondary">You</Badge> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant={row.original.role === 'super_admin' ? 'default' : 'outline'} title={ROLE_DESCRIPTIONS[row.original.role]}>
          {ROLE_LABELS[row.original.role]}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Last login',
      cell: ({ row }) => <span className="text-muted-foreground">{formatRelative(row.original.lastLoginAt)}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => <span className="text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      size: 48,
      cell: ({ row }) => (
        <RowActions
          admin={row.original}
          isSelf={row.original.id === me?.id}
          onResetPassword={setResetFor}
          onAction={setPending}
        />
      ),
    },
  ];

  const target = pending?.admin;
  const disabling = target?.status === 'active';

  return (
    <>
      <PageHeader
        title="Admins"
        description="Accounts that can sign in to this panel. Roles: super admin > admin > editor > viewer."
        actions={
          <Button onClick={() => setInviteOpen(true)} disabled={!allowed}>
            <UserPlus /> Invite admin
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={admins.data}
        isLoading={admins.isPending}
        isFetching={admins.isFetching}
        error={admins.error}
        onRetry={() => void admins.refetch()}
        getRowId={(a) => a.id}
        skeletonRows={4}
        empty={{ title: 'No admins', description: 'Invite the first admin to share the workload.' }}
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ADMIN_ROLES.map((role) => (
          <div key={role} className="rounded-lg border p-3">
            <p className="text-sm font-medium">{ROLE_LABELS[role]}</p>
            <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
          </div>
        ))}
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <ResetPasswordDialog admin={resetFor} onOpenChange={(open) => !open && setResetFor(null)} />
      <ConfirmDialog
        open={pending?.type === 'status'}
        onOpenChange={(open) => !open && setPending(null)}
        title={disabling ? `Disable ${target?.name ?? 'this admin'}?` : `Enable ${target?.name ?? 'this admin'}?`}
        description={
          disabling
            ? 'They are signed out and can no longer sign in until re-enabled.'
            : 'They can sign in again with their existing password.'
        }
        confirmLabel={disabling ? 'Disable' : 'Enable'}
        destructive={disabling}
        onConfirm={async () => {
          if (!target) return;
          await update.mutateAsync({ id: target.id, status: disabling ? 'disabled' : 'active' });
          setPending(null);
        }}
      />
      <ConfirmDialog
        open={pending?.type === 'delete'}
        onOpenChange={(open) => !open && setPending(null)}
        title={`Delete ${target?.name ?? 'this admin'}?`}
        description="The admin account is removed permanently. Their past audit log entries are kept."
        confirmLabel="Delete admin"
        destructive
        typeToConfirm={target?.email}
        onConfirm={async () => {
          if (!target) return;
          await remove.mutateAsync(target.id);
          setPending(null);
        }}
      />
    </>
  );
}

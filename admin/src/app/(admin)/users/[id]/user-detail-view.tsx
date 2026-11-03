'use client';

import {
  Ban,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  ExternalLink,
  Pencil,
  Smartphone,
  Trash2,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { RoleGate } from '@/components/auth/role-gate';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { ErrorState, FormSkeleton } from '@/components/common/states';
import { TextField } from '@/components/forms/fields';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumb-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMeetings } from '@/lib/api/meetings';
import { usePlans } from '@/lib/api/plans';
import type { AdminUserDetail } from '@/lib/api/types';
import { useDeleteUser, useUpdateUser, useUser } from '@/lib/api/users';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { requiredString } from '@/lib/schemas/common';
import { formatDate, formatDateTime, formatNumber, formatRelative, humanize, initials } from '@/lib/utils';
import { SafeAvatarImage } from '@/components/common/safe-avatar-image';

function InfoList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 truncate">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const nameSchema = z.object({ name: requiredString('Name').max(120) });

function EditNameDialog({ user, open, onOpenChange }: { user: AdminUserDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateUser(user.id);
  const form = useZodForm(nameSchema, { defaultValues: { name: user.name ?? '' } });
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ name: values.name });
      onOpenChange(false);
    } catch (error) {
      applyFormErrors(error, form);
    }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Edit name</DialogTitle>
            <DialogDescription>Shown in the app and in meeting reports.</DialogDescription>
          </DialogHeader>
          <TextField control={form.control} name="name" label="Name" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? <Spinner /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlanCard({ user }: { user: AdminUserDetail }) {
  const { can } = useAdminSession();
  const plans = usePlans();
  const update = useUpdateUser(user.id);
  const NONE = '__none__';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plan</CardTitle>
        <CardDescription>Limits and features follow the plan. Billing is outside Remi.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Select
          value={user.plan?.id ?? NONE}
          disabled={!can('admin') || update.isPending || plans.isPending}
          onValueChange={(v) => update.mutate({ planId: v === NONE ? null : v })}
        >
          <SelectTrigger className="w-full" aria-label="Plan">
            <SelectValue placeholder="Select a plan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No plan (default plan applies)</SelectItem>
            {(plans.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
                {!p.isActive ? ' (inactive)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!can('admin') ? <p className="text-xs text-muted-foreground">Changing plans requires the Admin role.</p> : null}
      </CardContent>
    </Card>
  );
}

function RecentMeetings({ userId }: { userId: string }) {
  const meetings = useMeetings({ userId, limit: 5, page: 1 });
  if (meetings.isPending) return <p className="text-sm text-muted-foreground">Loading meetings…</p>;
  if (meetings.isError) return <ErrorState error={meetings.error} onRetry={() => void meetings.refetch()} />;
  if (meetings.data.items.length === 0) return <p className="text-sm text-muted-foreground">No meetings yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Start</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {meetings.data.items.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="max-w-64 truncate">
              <Link href={`/meetings/${m.id}`} className="font-medium hover:underline">
                {m.title}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDateTime(m.startAt)}</TableCell>
            <TableCell>
              <StatusBadge status={m.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function UserDetailContent({ user }: { user: AdminUserDetail }) {
  const router = useRouter();
  const update = useUpdateUser(user.id);
  const remove = useDeleteUser();
  const [editName, setEditName] = useState(false);
  const suspended = user.status === 'suspended';

  return (
    <>
      <PageHeader
        back={{ href: '/users', label: 'Users' }}
        title={
          <span className="flex items-center gap-3">
            <Avatar className="size-10">
              <SafeAvatarImage src={user.avatarUrl} />
              <AvatarFallback>{initials(user.name ?? user.email)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{user.name ?? user.email}</span>
          </span>
        }
        meta={
          <>
            <StatusBadge status={user.status} />
            <span>{user.email}</span>
            <span>· Joined {formatDate(user.createdAt)}</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/meetings?userId=${user.id}`}>
                <Video /> Meetings
              </Link>
            </Button>
            <RoleGate minRole="admin">
              <ConfirmDialog
                title={suspended ? 'Activate this user?' : 'Suspend this user?'}
                description={
                  suspended
                    ? 'They can sign in again and the bot resumes joining their meetings.'
                    : 'They are signed out, cannot sign in, and the bot stops joining their meetings.'
                }
                confirmLabel={suspended ? 'Activate' : 'Suspend'}
                destructive={!suspended}
                onConfirm={() => update.mutateAsync({ status: suspended ? 'active' : 'suspended' })}
                trigger={
                  <Button variant={suspended ? 'default' : 'outline'}>
                    {suspended ? <CheckCircle2 /> : <Ban />}
                    {suspended ? 'Activate' : 'Suspend'}
                  </Button>
                }
              />
            </RoleGate>
            <RoleGate minRole="super_admin">
              <ConfirmDialog
                title="Delete this user permanently?"
                description="This deletes the account and all of its meetings, transcripts, reports, action items and reminders. It cannot be undone."
                confirmLabel="Delete user"
                destructive
                typeToConfirm={user.email}
                onConfirm={async () => {
                  await remove.mutateAsync(user.id);
                  router.replace('/users');
                }}
                trigger={
                  <Button variant="destructive">
                    <Trash2 /> Delete
                  </Button>
                }
              />
            </RoleGate>
          </>
        }
      />

      {suspended ? (
        <Alert variant="destructive" className="mb-6">
          <Ban />
          <AlertDescription>This account is suspended. The user cannot sign in.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
              <RoleGate minRole="admin">
                <CardAction>
                  <Button variant="ghost" size="sm" onClick={() => setEditName(true)}>
                    <Pencil /> Edit name
                  </Button>
                </CardAction>
              </RoleGate>
            </CardHeader>
            <CardContent>
              <InfoList
                items={[
                  { label: 'Name', value: user.name ?? '—' },
                  { label: 'Email', value: user.email },
                  { label: 'Timezone', value: user.timezone },
                  { label: 'Locale', value: user.locale },
                  { label: 'Onboarded', value: formatDateTime(user.onboardedAt, 'Not yet') },
                  { label: 'Last login', value: formatRelative(user.lastLoginAt) },
                  { label: 'Created', value: formatDateTime(user.createdAt) },
                  { label: 'User ID', value: <span className="font-mono text-xs">{user.id}</span> },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent meetings</CardTitle>
              <CardAction>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/meetings?userId=${user.id}`}>
                    View all <ExternalLink />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <RecentMeetings userId={user.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Settings</CardTitle>
              <CardDescription>Managed by the user in the app</CardDescription>
            </CardHeader>
            <CardContent>
              <InfoList
                items={[
                  { label: 'Bot auto-join', value: humanize(user.settings.autoJoin) },
                  { label: 'Bot name', value: user.settings.botName ?? 'Global default' },
                  {
                    label: 'Meeting reminder',
                    value: user.settings.meetingReminderMinutes
                      ? `${user.settings.meetingReminderMinutes} min before`
                      : 'Off',
                  },
                  {
                    label: 'Daily digest',
                    value: user.settings.dailyDigest ? `On at ${String(user.settings.digestHour).padStart(2, '0')}:00` : 'Off',
                  },
                  { label: 'Email notifications', value: user.settings.emailNotifications ? 'On' : 'Off' },
                  { label: 'Push notifications', value: user.settings.pushNotifications ? 'On' : 'Off' },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Devices</CardTitle>
              <CardDescription>Registered for push notifications</CardDescription>
            </CardHeader>
            <CardContent>
              {user.devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No devices registered.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>App version</TableHead>
                      <TableHead>Last seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {user.devices.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="flex items-center gap-2">
                          <Smartphone className="size-4 text-muted-foreground" aria-hidden />
                          {d.deviceName ?? 'Unknown device'}
                        </TableCell>
                        <TableCell>{humanize(d.platform)}</TableCell>
                        <TableCell className="font-mono text-xs">{d.appVersion ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{formatRelative(d.lastSeenAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Meetings', value: user.stats.meetings },
                  { label: 'Completed', value: user.stats.completedMeetings },
                  { label: 'Action items', value: user.stats.actionItems },
                  { label: 'Reminders', value: user.stats.reminders },
                ].map((s) => (
                  <div key={s.label}>
                    <dt className="text-xs text-muted-foreground">{s.label}</dt>
                    <dd className="text-2xl font-semibold tabular-nums">{formatNumber(s.value)}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <PlanCard user={user} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Google Calendar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                {user.integration.connected ? (
                  <CalendarCheck className="size-4 text-emerald-600" aria-hidden />
                ) : (
                  <CalendarX className="size-4 text-muted-foreground" aria-hidden />
                )}
                <StatusBadge status={user.integration.connected ? 'connected' : 'disconnected'} />
              </div>
              <InfoList
                items={[
                  { label: 'Account', value: user.integration.accountEmail ?? '—' },
                  { label: 'Last synced', value: formatRelative(user.integration.lastSyncedAt) },
                ]}
              />
              {user.integration.syncError ? (
                <Alert variant="destructive">
                  <AlertDescription>{user.integration.syncError}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
      <EditNameDialog key={user.name ?? ''} user={user} open={editName} onOpenChange={setEditName} />
    </>
  );
}

export function UserDetailView() {
  const { id } = useParams<{ id: string }>();
  const user = useUser(id);
  useBreadcrumbLabel(`/users/${id}`, user.data?.email);

  if (user.isPending) return <FormSkeleton />;
  if (user.isError) return <ErrorState error={user.error} onRetry={() => void user.refetch()} />;
  return <UserDetailContent user={user.data} />;
}

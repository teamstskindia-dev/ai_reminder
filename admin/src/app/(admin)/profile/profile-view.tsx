'use client';

import { KeyRound, Save } from 'lucide-react';
import { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, FormSkeleton } from '@/components/common/states';
import { TextField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { ImageField } from '@/components/media/image-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { useUpdateMe } from '@/lib/api/auth';
import type { AdminUser } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/roles';
import { requiredString, nullableImageUrl } from '@/lib/schemas/common';
import { formatDateTime, formatRelative } from '@/lib/utils';

import { PasswordField } from '@/components/system/password-field';

const profileSchema = z.object({
  name: requiredString('Name').max(120),
  avatarUrl: nullableImageUrl,
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Use at least 8 characters').max(128, 'Use at most 128 characters'),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  });

function ProfileForm({ admin }: { admin: AdminUser }) {
  const update = useUpdateMe();
  const form = useZodForm(profileSchema, { defaultValues: { name: admin.name, avatarUrl: admin.avatarUrl } });
  useUnsavedChangesGuard(form.formState.isDirty);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync({ name: values.name, avatarUrl: values.avatarUrl });
      form.reset({ name: saved.name, avatarUrl: saved.avatarUrl });
    } catch (error) {
      applyFormErrors(error, form);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FormSection title="Profile" description="How you appear in the admin panel and audit logs.">
        <TextField control={form.control} name="name" label="Name" inputProps={{ autoComplete: 'name' }} />
        <ImageField
          control={form.control}
          name="avatarUrl"
          label="Avatar"
          description="Optional. Square images look best."
          nullable
          aspect="square"
          folder="admins"
        />
        <div>
          <Button type="submit" disabled={!form.formState.isDirty || update.isPending}>
            {update.isPending ? <Spinner /> : <Save />} Save profile
          </Button>
        </div>
      </FormSection>
    </form>
  );
}

function PasswordForm() {
  const update = useUpdateMe();
  const form = useZodForm(passwordSchema, {
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await update.mutateAsync({ currentPassword, newPassword });
      form.reset();
    } catch (error) {
      if (!applyFormErrors(error, form)) {
        form.setError('currentPassword', { type: 'server', message: 'Password not changed — check your current password.' });
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FormSection title="Password" description="Use at least 8 characters. Other sessions stay signed in until they expire.">
        <PasswordField
          control={form.control}
          name="currentPassword"
          label="Current password"
          autoComplete="current-password"
          generate={false}
        />
        <PasswordField control={form.control} name="newPassword" label="New password" />
        <PasswordField
          control={form.control}
          name="confirmPassword"
          label="Confirm new password"
          generate={false}
        />
        <div>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? <Spinner /> : <KeyRound />} Change password
          </Button>
        </div>
      </FormSection>
    </form>
  );
}

export function ProfileView() {
  const { admin, isLoading, error, refetch } = useAdminSession();

  if (isLoading) return <FormSkeleton />;
  if (!admin) return <ErrorState error={error ?? new Error('Not signed in')} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Your profile"
        description="Update your name, avatar and password."
        meta={
          <>
            <Badge variant="secondary">{ROLE_LABELS[admin.role]}</Badge>
            <span>{admin.email}</span>
            <span>· Last login {formatRelative(admin.lastLoginAt)}</span>
          </>
        }
      />
      <div className="space-y-6">
        <FormSection title="Account" description="Your email and role are managed by a super admin.">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="mt-0.5">{admin.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Role</dt>
              <dd className="mt-0.5">
                {ROLE_LABELS[admin.role]}
                <span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[admin.role]}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last login</dt>
              <dd className="mt-0.5">{formatDateTime(admin.lastLoginAt, 'Never')}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Admin since</dt>
              <dd className="mt-0.5">{formatDateTime(admin.createdAt)}</dd>
            </div>
          </dl>
        </FormSection>
        <ProfileForm key={`${admin.name}|${admin.avatarUrl ?? ''}`} admin={admin} />
        <PasswordForm />
      </div>
    </>
  );
}

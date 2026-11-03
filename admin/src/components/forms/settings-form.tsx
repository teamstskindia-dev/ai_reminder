'use client';

import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DefaultValues, FieldValues } from 'react-hook-form';
import type { z } from 'zod';

import { useAdminSession } from '@/components/auth/admin-session';
import { ErrorState, FormSkeleton } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { useSetting, useUpdateSetting } from '@/lib/api/settings';
import type { AppSettingRecord, SettingKey, SettingValue } from '@/lib/api/types';
import { applyFormErrors, useZodForm } from '@/lib/forms';
import { ROLE_LABELS, settingEditRole } from '@/lib/roles';
import { formatRelative } from '@/lib/utils';

/**
 * Loads `GET /admin/settings/:key` and renders the form once the record is available. The form is keyed by
 * `updatedAt`, so a successful save (which refetches) remounts it with the saved values as its baseline.
 */
export function SettingLoader<K extends SettingKey>({
  settingKey,
  children,
}: {
  settingKey: K;
  children: (record: AppSettingRecord<K>) => ReactNode;
}) {
  const query = useSetting(settingKey);
  if (query.isPending) return <FormSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <div key={query.data.updatedAt}>{children(query.data)}</div>;
}

/** Form state + save handler for one settings key. PUT always sends the full object. */
export function useSettingForm<K extends SettingKey, T extends FieldValues & SettingValue[K]>(
  key: K,
  schema: z.ZodType<T, T>,
  record: AppSettingRecord<K>,
) {
  const { canEditSetting } = useAdminSession();
  const canEdit = canEditSetting(key);
  const form = useZodForm(schema, { defaultValues: record.value as DefaultValues<T> });
  const mutation = useUpdateSetting(key);
  useUnsavedChangesGuard(form.formState.isDirty && canEdit);

  const onSubmit = form.handleSubmit(async (value) => {
    try {
      const saved = await mutation.mutateAsync(value);
      form.reset(saved.value as T);
    } catch (error) {
      applyFormErrors(error, form, { stripPrefix: 'value.' });
    }
  });

  return {
    form,
    onSubmit,
    canEdit,
    isSaving: mutation.isPending,
    readOnlyMessage: `Read-only: saving ${key} requires the ${ROLE_LABELS[settingEditRole(key)]} role.`,
  };
}

/** "Updated 3 minutes ago · public" line for settings page headers. */
export function SettingMeta({ record }: { record: AppSettingRecord }) {
  return (
    <>
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3" /> Updated {formatRelative(record.updatedAt)}
      </span>
      <Badge variant={record.isPublic ? 'secondary' : 'outline'} className="font-normal">
        {record.isPublic ? 'Public · sent to web & mobile' : 'Private · backend only'}
      </Badge>
    </>
  );
}

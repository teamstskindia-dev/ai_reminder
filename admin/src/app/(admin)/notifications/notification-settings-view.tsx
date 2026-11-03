'use client';

import { PageHeader } from '@/components/common/page-header';
import { NumberField, SwitchField, TextField } from '@/components/forms/fields';
import { FormSection } from '@/components/forms/form-section';
import { SaveBar } from '@/components/forms/save-bar';
import { SettingLoader, SettingMeta, useSettingForm } from '@/components/forms/settings-form';
import type { AppSettingRecord } from '@/lib/api/types';
import { notificationSettingsSchema } from '@/lib/schemas/settings';

import { NotificationsNav } from './notifications-nav';

function NotificationSettingsForm({ record }: { record: AppSettingRecord<'notifications'> }) {
  const { form, onSubmit, canEdit, isSaving, readOnlyMessage } = useSettingForm(
    'notifications',
    notificationSettingsSchema,
    record,
  );
  const { control } = form;
  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!canEdit} className="min-w-0 space-y-6">
        <FormSection title="Channels" description="Global switches. Users can still turn channels off for themselves.">
          <SwitchField
            control={control}
            name="pushEnabled"
            label="Push notifications"
            description="Send Expo push notifications to registered Android devices."
          />
          <SwitchField
            control={control}
            name="emailEnabled"
            label="Email notifications"
            description="Send emails over SMTP. Requires SMTP credentials on the API."
          />
          <SwitchField
            control={control}
            name="digestEnabled"
            label="Daily digest"
            description="Each morning (at the user's chosen hour) send the day's meetings and open action items."
          />
        </FormSection>
        <FormSection title="Email sender" description="The From header of every email Remi sends.">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField control={control} name="fromName" label="From name" />
            <TextField control={control} name="fromEmail" label="From email" type="email" />
          </div>
        </FormSection>
        <FormSection title="Defaults" description="Applied to new users; existing users keep their own choice.">
          <NumberField
            control={control}
            name="defaultMeetingReminderMinutes"
            label="Meeting reminder"
            description="Minutes before a meeting to send “starting soon”. 0 disables it."
            min={0}
            max={1440}
            suffix="min"
          />
        </FormSection>
      </fieldset>
      <SaveBar
        isDirty={form.formState.isDirty}
        isSaving={isSaving}
        canSave={canEdit}
        readOnlyMessage={readOnlyMessage}
        onReset={() => form.reset()}
      />
    </form>
  );
}

export function NotificationSettingsView() {
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Delivery channels, email sender, message templates and broadcasts to users."
      />
      <NotificationsNav />
      <SettingLoader settingKey="notifications">
        {(record) => (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <SettingMeta record={record} />
            </div>
            <NotificationSettingsForm record={record} />
          </div>
        )}
      </SettingLoader>
    </>
  );
}

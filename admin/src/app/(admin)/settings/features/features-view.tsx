'use client';

import { Construction, Save } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import { PageHeader } from '@/components/common/page-header';
import { SwitchField, TextField, TextareaField } from '@/components/forms/fields';
import { SettingLoader, SettingMeta, useSettingForm } from '@/components/forms/settings-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import type { AppSettingRecord, Features } from '@/lib/api/types';
import { appMetaSchema, featuresSchema } from '@/lib/schemas/settings';

const FEATURE_FLAGS: { key: keyof Features; label: string; description: string }[] = [
  {
    key: 'askAi',
    label: 'Ask AI',
    description: 'Ask questions across all meetings. Hides the Ask page on web and the Ask tab on mobile.',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    description: 'Meeting analytics and scores overview. Hides the Analytics item in the web sidebar.',
  },
  {
    key: 'reminders',
    label: 'Reminders',
    description: 'Reminder list and AI-detected commitment reminders on web and mobile.',
  },
  {
    key: 'actionItems',
    label: 'Action items',
    description: 'Action item tracking. Hides the Action items page and report sections.',
  },
  {
    key: 'calendarSync',
    label: 'Calendar sync',
    description: 'Google Calendar sync and automatic bot scheduling. Off = manual meetings only.',
  },
  {
    key: 'meetingUpload',
    label: 'Meeting upload',
    description: 'Upload recordings or transcripts for processing on web and mobile.',
  },
  {
    key: 'pushNotifications',
    label: 'Push notifications',
    description: 'Push permission prompt and device registration in the Android app.',
  },
  {
    key: 'signupsEnabled',
    label: 'New signups',
    description: 'Off = only existing users can sign in; new Google accounts see "signups disabled".',
  },
];

function CardSaveFooter({
  isDirty,
  isSaving,
  canEdit,
  onReset,
  readOnlyMessage,
}: {
  isDirty: boolean;
  isSaving: boolean;
  canEdit: boolean;
  onReset: () => void;
  readOnlyMessage: string;
}) {
  return (
    <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {!canEdit ? readOnlyMessage : isDirty ? 'Unsaved changes' : 'All changes saved'}
      </p>
      {canEdit ? (
        <div className="flex gap-2">
          <Button type="button" variant="ghost" disabled={!isDirty || isSaving} onClick={onReset}>
            Discard
          </Button>
          <Button type="submit" disabled={!isDirty || isSaving}>
            {isSaving ? <Spinner /> : <Save />} Save
          </Button>
        </div>
      ) : null}
    </CardFooter>
  );
}

function FeaturesForm({ record }: { record: AppSettingRecord<'features'> }) {
  const { form, onSubmit, canEdit, isSaving, readOnlyMessage } = useSettingForm('features', featuresSchema, record);
  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature flags</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            Turn modules on or off for the website and the Android app. Navigation items that require a disabled
            feature are hidden automatically.
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <SettingMeta record={record} />
          </div>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canEdit} className="grid gap-3 md:grid-cols-2">
            {FEATURE_FLAGS.map((flag) => (
              <SwitchField
                key={flag.key}
                control={form.control}
                name={flag.key}
                label={flag.label}
                description={flag.description}
              />
            ))}
          </fieldset>
        </CardContent>
        <CardSaveFooter
          isDirty={form.formState.isDirty}
          isSaving={isSaving}
          canEdit={canEdit}
          onReset={() => form.reset()}
          readOnlyMessage={readOnlyMessage}
        />
      </Card>
    </form>
  );
}

function AppForm({ record }: { record: AppSettingRecord<'app'> }) {
  const { form, onSubmit, canEdit, isSaving, readOnlyMessage } = useSettingForm('app', appMetaSchema, record);
  const maintenance = useWatch({ control: form.control, name: 'maintenanceMode' });
  const { control } = form;
  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">App & maintenance</CardTitle>
          <CardDescription>Maintenance mode and Android version gating.</CardDescription>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <SettingMeta record={record} />
          </div>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!canEdit} className="space-y-6">
            {maintenance ? (
              <Alert variant="destructive">
                <Construction />
                <AlertTitle>Maintenance mode is on</AlertTitle>
                <AlertDescription>
                  Once saved, every signed-in user endpoint returns 503 and the website and app show the message below.
                  Public pages, sign-in and this admin panel keep working.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-4">
              <SwitchField
                control={control}
                name="maintenanceMode"
                label="Maintenance mode"
                description="Temporarily block the web app and mobile app for everyone except admins."
              />
              <TextareaField
                control={control}
                name="maintenanceMessage"
                label="Maintenance message"
                rows={3}
                description="Shown on the maintenance screen on web and mobile."
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                control={control}
                name="minAppVersion"
                label="Minimum app version"
                placeholder="1.0.0"
                description="Older Android builds are forced to update."
              />
              <TextField
                control={control}
                name="latestAppVersion"
                label="Latest app version"
                placeholder="1.2.0"
                description="Older builds see a soft 'update available' prompt."
              />
              <TextField
                control={control}
                name="androidStoreUrl"
                label="Google Play URL"
                type="url"
                placeholder="https://play.google.com/store/apps/details?id=…"
              />
              <TextField
                control={control}
                name="iosStoreUrl"
                label="App Store URL"
                type="url"
                placeholder="Leave empty until the iOS app ships"
              />
            </div>
          </fieldset>
        </CardContent>
        <CardSaveFooter
          isDirty={form.formState.isDirty}
          isSaving={isSaving}
          canEdit={canEdit}
          onReset={() => form.reset()}
          readOnlyMessage={readOnlyMessage}
        />
      </Card>
    </form>
  );
}

export function FeaturesView() {
  return (
    <>
      <PageHeader
        title="Features & app"
        description="Feature flags, maintenance mode and app version requirements. These are public settings sent to the website and the Android app."
      />
      <div className="space-y-6">
        <SettingLoader settingKey="features">{(record) => <FeaturesForm record={record} />}</SettingLoader>
        <SettingLoader settingKey="app">{(record) => <AppForm record={record} />}</SettingLoader>
      </div>
    </>
  );
}

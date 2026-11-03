"use client";

import { AlertTriangle, LogOut, Monitor, Smartphone, Tablet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { EmptyState, ErrorState } from "@/components/common/states";
import { UserAvatar } from "@/components/common/user-avatar";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useDevices } from "@/hooks/queries/use-integrations";
import { useDeleteAccount, useLogout, useSession, useUpdateProfile } from "@/hooks/queries/use-session";
import { useSettings, useUpdateSettings } from "@/hooks/queries/use-settings";
import type { AutoJoinMode, UserSettings } from "@/lib/api/types";
import { timeAgo } from "@/lib/format";
import { useBranding, useFeature } from "@/providers/config-provider";
import { browserTimezone, TimezonePicker } from "./timezone-picker";

export function SettingsCard({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="border-b px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className="space-y-5 p-5">{children}</div>
      {footer && <footer className="flex justify-end gap-2 border-t bg-muted/30 px-5 py-3">{footer}</footer>}
    </section>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <label htmlFor={id} className="space-y-0.5">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-sm text-muted-foreground">{description}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

// ---------- Profile ----------
export function ProfileSection() {
  const { data } = useSession();
  const user = data?.user;
  const update = useUpdateProfile();
  const browserTz = browserTimezone();
  const [name, setName] = useState(user?.name ?? "");
  const [timezone, setTimezone] = useState(user?.timezone || browserTz);
  const dirty = name.trim() !== (user?.name ?? "") || timezone !== user?.timezone;

  if (!user) return null;
  return (
    <SettingsCard
      title="Profile"
      description="How you appear and which timezone reminders use."
      footer={
        <Button
          disabled={!dirty || !name.trim() || update.isPending}
          onClick={() =>
            update.mutate(
              { name: name.trim(), timezone },
              { onSuccess: () => toast.success("Profile saved") },
            )
          }
        >
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      }
    >
      <div className="flex items-center gap-4">
        <UserAvatar name={user.name} email={user.email} src={user.avatarUrl} className="size-14" />
        <div>
          <p className="font-medium">{user.name || user.email}</p>
          <p className="text-sm text-muted-foreground">Photo from your Google account</p>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="profile-name" label="Name">
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <Field id="profile-email" label="Email" hint="Managed by Google sign-in">
          <Input id="profile-email" value={user.email} readOnly disabled />
        </Field>
        <Field
          id="profile-tz"
          label="Timezone"
          hint={
            timezone !== browserTz ? (
              <button type="button" className="text-primary hover:underline" onClick={() => setTimezone(browserTz)}>
                Use this browser&apos;s timezone ({browserTz.replace(/_/g, " ")})
              </button>
            ) : (
              "Matches this browser"
            )
          }
        >
          <TimezonePicker id="profile-tz" value={timezone} onChange={setTimezone} />
        </Field>
        <Field id="profile-plan" label="Plan">
          <Input id="profile-plan" value={user.plan?.name ?? "Free"} readOnly disabled />
        </Field>
      </div>
    </SettingsCard>
  );
}

function useSettingsMutation() {
  const update = useUpdateSettings();
  return (patch: Partial<UserSettings>, message = "Settings saved") =>
    update.mutate(patch, { onSuccess: () => toast.success(message) });
}

function SettingsLoading() {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

// ---------- Meeting bot ----------
const AUTO_JOIN: { value: AutoJoinMode; label: string; description: string }[] = [
  { value: "all", label: "All meetings", description: "Join every calendar meeting with a Google Meet link." },
  { value: "owned", label: "Only meetings I organise", description: "Skip meetings other people invited you to." },
  { value: "none", label: "Don't join automatically", description: "Only join when you send the notetaker yourself." },
];

export function BotSection() {
  const { appName } = useBranding();
  const settings = useSettings();
  const save = useSettingsMutation();
  const [botName, setBotName] = useState<string | null>(null);

  if (settings.isPending) return <SettingsLoading />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;
  const s = settings.data;
  const nameValue = botName ?? s.botName ?? "";

  return (
    <div className="space-y-6">
      <SettingsCard title="Auto-join" description="Which calendar meetings the notetaker joins.">
        <RadioGroup value={s.autoJoin} onValueChange={(v) => save({ autoJoin: v as AutoJoinMode }, "Auto-join updated")} className="gap-3">
          {AUTO_JOIN.map((o) => (
            <Label
              key={o.value}
              htmlFor={`autojoin-${o.value}`}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 font-normal has-data-[state=checked]:border-primary/50 has-data-[state=checked]:bg-brand-soft/40"
            >
              <RadioGroupItem id={`autojoin-${o.value}`} value={o.value} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-sm text-muted-foreground">{o.description}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </SettingsCard>
      <SettingsCard
        title="Notetaker name"
        description="The name other participants see in the Meet waiting room."
        footer={
          <Button
            disabled={botName === null || nameValue === (s.botName ?? "")}
            onClick={() => {
              save({ botName: nameValue.trim() || null }, "Notetaker name saved");
              setBotName(null);
            }}
          >
            Save
          </Button>
        }
      >
        <Field id="bot-name" label="Display name" hint="Leave empty to use the default name.">
          <Input id="bot-name" value={nameValue} onChange={(e) => setBotName(e.target.value)} placeholder={`${appName} Notetaker`} maxLength={60} />
        </Field>
      </SettingsCard>
    </div>
  );
}

// ---------- Notifications ----------
const REMINDER_MINUTES = [0, 1, 5, 10, 15, 30, 60];
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`;

export function NotificationsSection() {
  const settings = useSettings();
  const save = useSettingsMutation();
  const pushFeature = useFeature("pushNotifications");
  if (settings.isPending) return <SettingsLoading />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;
  const s = settings.data;

  return (
    <SettingsCard title="Notifications" description="Changes save automatically.">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label htmlFor="reminder-minutes" className="space-y-0.5">
          <span className="block text-sm font-medium">Meeting starting soon</span>
          <span className="block text-sm text-muted-foreground">Get a heads-up before each meeting.</span>
        </label>
        <Select value={String(s.meetingReminderMinutes)} onValueChange={(v) => save({ meetingReminderMinutes: Number(v) })}>
          <SelectTrigger id="reminder-minutes" className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...new Set([...REMINDER_MINUTES, s.meetingReminderMinutes])]
              .sort((a, b) => a - b)
              .map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m === 0 ? "Off" : `${m} min before`}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-3 border-t pt-5">
        <ToggleRow
          id="daily-digest"
          label="Daily digest"
          description="A morning summary of your meetings and open action items."
          checked={s.dailyDigest}
          onChange={(v) => save({ dailyDigest: v })}
        />
        {s.dailyDigest && (
          <div className="flex items-center justify-between gap-4 pl-0 sm:pl-4">
            <label htmlFor="digest-hour" className="text-sm text-muted-foreground">
              Send at (your timezone)
            </label>
            <Select value={String(s.digestHour)} onValueChange={(v) => save({ digestHour: Number(v) })}>
              <SelectTrigger id="digest-hour" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, h) => (
                  <SelectItem key={h} value={String(h)}>
                    {hourLabel(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="space-y-5 border-t pt-5">
        <ToggleRow
          id="email-notifications"
          label="Email"
          description="Reports and reminders in your inbox."
          checked={s.emailNotifications}
          onChange={(v) => save({ emailNotifications: v })}
        />
        {pushFeature && (
          <ToggleRow
            id="push-notifications"
            label="Push"
            description="Notifications on your phone (Android app)."
            checked={s.pushNotifications}
            onChange={(v) => save({ pushNotifications: v })}
          />
        )}
      </div>
    </SettingsCard>
  );
}

// ---------- Devices ----------
const DEVICE_ICON = { android: Smartphone, ios: Tablet, web: Monitor } as const;

export function DevicesSection() {
  const devices = useDevices();
  return (
    <SettingsCard title="Devices" description="Phones and browsers registered for push notifications.">
      {devices.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : devices.isError ? (
        <ErrorState compact error={devices.error} onRetry={() => devices.refetch()} />
      ) : devices.data.length === 0 ? (
        <EmptyState compact icon={Smartphone} title="No devices yet" description="Sign in on the Android app to get push reminders." />
      ) : (
        <ul className="-my-2 divide-y">
          {devices.data.map((d) => {
            const Icon = DEVICE_ICON[d.platform] ?? Monitor;
            return (
              <li key={d.id} className="flex items-center gap-3 py-3">
                <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.deviceName || d.platform}</span>
                  <span className="block text-xs text-muted-foreground capitalize">
                    {d.platform}
                    {d.appVersion ? ` · v${d.appVersion}` : ""}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">Active {timeAgo(d.lastSeenAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsCard>
  );
}

// ---------- Account ----------
const CONFIRM_PHRASE = "DELETE";

export function AccountSection() {
  const { appName } = useBranding();
  const logout = useLogout();
  const remove = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");

  return (
    <div className="space-y-6">
      <SettingsCard title="Session" description="Sign out of this browser.">
        <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut /> Sign out
        </Button>
      </SettingsCard>
      <section className="overflow-hidden rounded-xl border border-destructive/30 bg-card">
        <header className="border-b border-destructive/20 bg-destructive/5 px-5 py-4">
          <h2 className="font-semibold text-destructive">Delete account</h2>
          <p className="text-sm text-muted-foreground">
            Permanently delete your {appName} account, meetings, reports, action items and reminders. Your Google access is revoked.
          </p>
        </header>
        <div className="p-5">
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) setPhrase("");
            }}
          >
            <DialogTrigger asChild>
              <Button variant="destructive">Delete my account</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" /> Delete your account?
                </DialogTitle>
                <DialogDescription>
                  This permanently deletes everything and cannot be undone. Type <strong className="text-foreground">{CONFIRM_PHRASE}</strong> to confirm.
                </DialogDescription>
              </DialogHeader>
              <Input
                aria-label={`Type ${CONFIRM_PHRASE} to confirm`}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                placeholder={CONFIRM_PHRASE}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={phrase !== CONFIRM_PHRASE || remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? "Deleting…" : "Delete forever"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </section>
    </div>
  );
}

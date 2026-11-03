import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { AlarmClock, Bell, BellRing, Clock, Mail, Newspaper } from 'lucide-react-native';
import { useState } from 'react';
import { Platform } from 'react-native';

import { useUnreadCount } from '@/api/hooks/notifications';
import type { UserSettings } from '@/api/types';
import { ActionSheet } from '@/components/ui/ActionSheet';
import { ListGroup, ListRow, SwitchRow } from '@/components/ui/ListRow';
import { useConfig } from '@/providers/config/ConfigProvider';
import { hourLabel } from '@/utils/format';

const REMINDER_OPTIONS = [0, 5, 10, 15, 30];

function reminderLabel(minutes: number): string {
  return minutes === 0 ? 'Off' : `${minutes} min before`;
}

export function NotificationSettings({ settings, onChange }: { settings: UserSettings; onChange: (patch: Partial<UserSettings>) => void }) {
  const { isEnabled, config } = useConfig();
  const unread = useUnreadCount();
  const [pickingReminder, setPickingReminder] = useState(false);
  const [pickingHour, setPickingHour] = useState(false);

  const pickDigestHour = () => {
    if (Platform.OS !== 'android') {
      setPickingHour(true);
      return;
    }
    const value = new Date();
    value.setHours(settings.digestHour, 0, 0, 0);
    DateTimePickerAndroid.open({
      value,
      mode: 'time',
      is24Hour: false,
      title: 'Daily digest time',
      onValueChange: (_event, date) => onChange({ digestHour: date.getHours() }),
    });
  };

  return (
    <>
      <ListGroup title="Notifications">
        <ListRow
          icon={Bell}
          title="Notifications"
          subtitle={`Everything ${config.branding.appName} has sent you`}
          value={unread.data ? `${unread.data} unread` : null}
          onPress={() => router.push('/notifications')}
        />
        <ListRow
          icon={AlarmClock}
          title="Meeting starting soon"
          value={reminderLabel(settings.meetingReminderMinutes)}
          onPress={() => setPickingReminder(true)}
        />
        <SwitchRow
          icon={Newspaper}
          title="Daily digest"
          subtitle="Your meetings and open items each morning"
          value={settings.dailyDigest}
          onValueChange={(dailyDigest) => onChange({ dailyDigest })}
        />
        {settings.dailyDigest ? (
          <ListRow icon={Clock} title="Digest time" value={hourLabel(settings.digestHour)} onPress={pickDigestHour} />
        ) : null}
        {isEnabled('pushNotifications') ? (
          <SwitchRow
            icon={BellRing}
            title="Push notifications"
            value={settings.pushNotifications}
            onValueChange={(pushNotifications) => onChange({ pushNotifications })}
          />
        ) : null}
        <SwitchRow
          icon={Mail}
          title="Email notifications"
          value={settings.emailNotifications}
          onValueChange={(emailNotifications) => onChange({ emailNotifications })}
        />
      </ListGroup>

      <ActionSheet
        visible={pickingReminder}
        title="Remind me before meetings"
        options={REMINDER_OPTIONS.map((minutes) => ({
          key: String(minutes),
          label: reminderLabel(minutes) + (minutes === settings.meetingReminderMinutes ? '  ✓' : ''),
          onPress: () => onChange({ meetingReminderMinutes: minutes }),
        }))}
        onClose={() => setPickingReminder(false)}
      />
      <ActionSheet
        visible={pickingHour}
        title="Daily digest time"
        options={[6, 7, 8, 9, 10, 12, 17, 20].map((hour) => ({
          key: String(hour),
          label: hourLabel(hour),
          onPress: () => onChange({ digestHour: hour }),
        }))}
        onClose={() => setPickingHour(false)}
      />
    </>
  );
}

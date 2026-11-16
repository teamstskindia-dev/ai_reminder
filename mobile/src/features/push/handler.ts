import * as Notifications from 'expo-notifications';

/** Show notifications as banners (with sound) even while the app is in the foreground. */
export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Must match the server's push `categoryId` for reminders (Done / Snooze buttons on the notification). */
export const REMINDER_CATEGORY = 'reminder';
export const ReminderAction = { done: 'done', snooze15: 'snooze15', snooze60: 'snooze60' } as const;

/**
 * Registers the notification categories (action buttons). The buttons open the app, which then marks the
 * reminder done or snoozes it, so it works without a background task. Best effort.
 */
export function registerNotificationCategories(): void {
  Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
    { identifier: ReminderAction.done, buttonTitle: 'Done', options: { opensAppToForeground: true } },
    { identifier: ReminderAction.snooze15, buttonTitle: 'Snooze 15 min', options: { opensAppToForeground: true } },
    { identifier: ReminderAction.snooze60, buttonTitle: 'In 1 hour', options: { opensAppToForeground: true } },
  ]).catch(() => undefined);
}

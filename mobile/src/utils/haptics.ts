import * as Haptics from 'expo-haptics';

/** Light haptic feedback for key actions. Failures (unsupported device, disabled haptics) are ignored. */
export const haptics = {
  success(): void {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  light(): void {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  selection(): void {
    Haptics.selectionAsync().catch(() => undefined);
  },
  warning(): void {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  },
};

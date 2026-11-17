import { router, type Href } from 'expo-router';

/**
 * Back to the previous screen, or to `fallback` when there is none (the screen was opened from a
 * notification, a deep link or after sign-in). A bare `router.back()` there fails with
 * "The action 'GO_BACK' was not handled by any navigator" and leaves the user stuck.
 */
export function goBack(fallback: Href = '/home'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

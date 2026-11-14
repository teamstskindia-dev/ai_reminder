import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { reportError } from '@/utils/logger';

export type AppleSignInResult =
  | { type: 'success'; identityToken: string; givenName?: string; familyName?: string }
  | { type: 'cancelled' }
  | { type: 'error' };

/** Opens the native Sign in with Apple sheet (iOS only). */
export async function signInWithApple(): Promise<AppleSignInResult> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!credential.identityToken) return { type: 'error' };
    return {
      type: 'success',
      identityToken: credential.identityToken,
      givenName: credential.fullName?.givenName ?? undefined,
      familyName: credential.fullName?.familyName ?? undefined,
    };
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { type: 'cancelled' };
    reportError(error, { source: 'apple-sign-in' });
    return { type: 'error' };
  }
}

/** The official Apple button; renders nothing on Android or where Sign in with Apple is unavailable. */
export function AppleSignInButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  if (Platform.OS !== 'ios' || !available) return null;
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={theme.isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={theme.radii.md}
      style={[styles.button, disabled ? styles.disabled : null]}
      onPress={disabled ? () => undefined : onPress}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 54,
  },
  disabled: {
    opacity: 0.5,
  },
});

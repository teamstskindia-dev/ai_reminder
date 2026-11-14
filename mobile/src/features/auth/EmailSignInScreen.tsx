import { KeyRound, Mail } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getErrorMessage, isApiError } from '@/api/errors';
import { startEmailSignIn } from '@/api/resources/auth';
import { FormScreen } from '@/components/layout/FormScreen';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/providers/AuthProvider';
import { useConfig } from '@/providers/config/ConfigProvider';
import { toast } from '@/utils/toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_SECONDS = 30;

/** Passwordless sign-in: email → 6-digit code → signed in (new accounts are created on first sign-in). */
export function EmailSignInScreen() {
  const { completeEmailSignIn } = useAuth();
  const { config } = useConfig();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await startEmailSignIn(normalized);
      setEmail(normalized);
      setPhase('code');
      setCode('');
      setCooldown(RESEND_SECONDS);
      toast(`Code sent to ${normalized}`);
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't send the code. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { isNewUser } = await completeEmailSignIn(email, code);
      if (isNewUser) toast(`Welcome to ${config.branding.appName}!`);
      // Navigation follows the auth guards (setup for new accounts).
    } catch (e) {
      setError(isApiError(e) && (e.status === 401 || e.status === 403) ? e.message : getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <FormScreen
      footer={
        phase === 'email' ? (
          <Button label="Send code" onPress={() => void sendCode()} loading={busy} fullWidth size="lg" />
        ) : (
          <>
            <Button label="Continue" onPress={() => void verify()} loading={busy} fullWidth size="lg" />
            <Button
              label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              variant="ghost"
              disabled={cooldown > 0 || busy}
              onPress={() => void sendCode()}
              fullWidth
            />
          </>
        )
      }
    >
      <View style={styles.copy}>
        <Text variant="title">{phase === 'email' ? 'Continue with email' : 'Check your inbox'}</Text>
        <Text variant="callout" tone="secondary">
          {phase === 'email'
            ? "We'll email you a 6-digit code. No password needed."
            : `Enter the 6-digit code we sent to ${email}. It expires in 10 minutes.`}
        </Text>
        {__DEV__ && phase === 'code' ? (
          <Text variant="caption" tone="muted">
            Development: if the backend has no SMTP settings, the code is printed in the backend (API) log.
          </Text>
        ) : null}
      </View>

      {phase === 'email' ? (
        <TextField
          label="Email"
          icon={Mail}
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            setError(null);
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => void sendCode()}
          autoFocus
          error={error}
          maxLength={254}
        />
      ) : (
        <>
          <TextField
            label="Code"
            icon={KeyRound}
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="done"
            onSubmitEditing={() => void verify()}
            autoFocus
            error={error}
            maxLength={6}
          />
          <Button
            label="Use a different email"
            variant="ghost"
            size="sm"
            onPress={() => {
              setPhase('email');
              setError(null);
            }}
            style={styles.change}
          />
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  copy: {
    gap: 6,
  },
  change: {
    alignSelf: 'flex-start',
  },
});

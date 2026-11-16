import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { Bell, BellOff, Mail, Mic, MicOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { useUpdateSettings } from '@/api/hooks/profile';
import { Button } from '@/components/ui/Button';
import { ListGroup, SwitchRow } from '@/components/ui/ListRow';
import { registerForPushNotifications } from '@/features/push/registration';
import { useAuth } from '@/providers/AuthProvider';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { reportError } from '@/utils/logger';

import { pick, StepLayout, type StepProps } from '../shared';

/** G — microphone. Already allowed → skipped. Denied → explain; text chat keeps working. */
export function MicStep({ onNext, lang }: StepProps) {
  const [phase, setPhase] = useState<'checking' | 'ask' | 'denied'>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRecordingPermissionsAsync()
      .then((p) => (p.granted ? onNext() : setPhase('ask')))
      .catch(() => setPhase('ask'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allow = async () => {
    setBusy(true);
    try {
      const p = await requestRecordingPermissionsAsync();
      if (p.granted) onNext();
      else setPhase('denied');
    } catch (error) {
      reportError(error, { source: 'setup-mic' });
      setPhase('denied');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'checking') return null;
  if (phase === 'denied') {
    return (
      <StepLayout
        icon={MicOff}
        title={pick(lang, 'No problem', 'Koi baat nahi')}
        body={pick(
          lang,
          'Text chat works fully without the mic. Recording conversations needs it, so you can turn it on any time in your phone settings.',
          'Mic ke bina bhi text chat poori tarah chalega. Conversations record karne ke liye mic chahiye, jo aap kabhi bhi phone settings mein on kar sakte ho.',
        )}
        footer={
          <>
            <Button label={pick(lang, 'Continue', 'Aage chalo')} onPress={onNext} size="lg" fullWidth />
            <Button label={pick(lang, 'Open settings', 'Settings kholo')} variant="ghost" onPress={() => void Linking.openSettings()} fullWidth />
          </>
        }
      />
    );
  }
  return (
    <StepLayout
      icon={Mic}
      title={pick(lang, 'Can I listen when you ask?', 'Jab aap bolo, tab sun sakta hoon?')}
      body={pick(
        lang,
        'The mic lets you record conversations and talk to me by voice. I only listen when you tap record, and raw audio is deleted after processing.',
        'Mic se aap conversations record kar sakte ho aur mujhse bol kar baat kar sakte ho. Main sirf tab sunta hoon jab aap record dabate ho, aur audio process hone ke baad delete ho jaata hai.',
      )}
      footer={
        <>
          <Button label={pick(lang, 'Allow microphone', 'Mic allow karo')} onPress={() => void allow()} loading={busy} size="lg" fullWidth />
          <Button label={pick(lang, 'Not now', 'Abhi nahi')} variant="ghost" onPress={() => setPhase('denied')} fullWidth />
        </>
      }
    />
  );
}

/**
 * H — notifications. Already allowed → registers this device and moves on. Denied or "not now" → push
 * is turned off for the account (no re-prompt after setup) and an email digest is offered instead.
 */
export function NotificationsStep({ onNext, lang }: StepProps) {
  const theme = useTheme();
  const { config } = useConfig();
  const { settings } = useAuth();
  const update = useUpdateSettings();
  const pushAvailable = config.features.pushNotifications;
  const [phase, setPhase] = useState<'checking' | 'ask' | 'denied'>(pushAvailable ? 'checking' : 'denied');
  const [busy, setBusy] = useState(false);
  const [digest, setDigest] = useState(settings?.dailyDigest ?? true);

  useEffect(() => {
    if (!pushAvailable) return;
    Notifications.getPermissionsAsync()
      .then((p) => {
        if (!p.granted) {
          setPhase('ask');
          return;
        }
        void registerForPushNotifications({ brandColor: theme.colors.primary, prompt: false }).catch(() => undefined);
        onNext();
      })
      .catch(() => setPhase('ask'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allow = async () => {
    setBusy(true);
    try {
      const result = await registerForPushNotifications({ brandColor: theme.colors.primary, prompt: true });
      if (result.status === 'denied') {
        setPhase('denied');
        return;
      }
      if (settings && !settings.pushNotifications) update.mutate({ pushNotifications: true });
      onNext();
    } catch (error) {
      reportError(error, { source: 'setup-push' });
      onNext();
    } finally {
      setBusy(false);
    }
  };

  const continueWithoutPush = () => {
    update.mutate({ pushNotifications: false, dailyDigest: digest, ...(digest ? { emailNotifications: true } : {}) });
    onNext();
  };

  if (phase === 'checking') return null;
  if (phase === 'denied') {
    return (
      <StepLayout
        icon={BellOff}
        title={pick(lang, 'Got it, no pings', 'Theek hai, koi ping nahi')}
        body={pick(
          lang,
          'Your morning brief and reminders will wait for you inside the app. Want a short daily email too?',
          'Aapka morning brief aur reminders app ke andar milenge. Ek chhota daily email bhi chahiye?',
        )}
        footer={<Button label={pick(lang, 'Continue', 'Aage chalo')} onPress={continueWithoutPush} size="lg" fullWidth />}
      >
        <ListGroup>
          <SwitchRow
            icon={Mail}
            title={pick(lang, 'Daily email digest', 'Daily email digest')}
            subtitle={pick(lang, 'Your plan and open items each morning', 'Har subah aapka plan aur pending kaam')}
            value={digest}
            onValueChange={setDigest}
          />
        </ListGroup>
      </StepLayout>
    );
  }
  return (
    <StepLayout
      icon={Bell}
      title={pick(lang, 'Can I nudge you?', 'Kya main yaad dila sakta hoon?')}
      body={pick(
        lang,
        'A morning brief, reminders at the right time and an evening check-in. Rare and meaningful, never spammy. Quiet hours are respected.',
        'Subah ka brief, sahi time par reminders aur shaam ka check-in. Kam aur kaam ke, spam bilkul nahi. Quiet hours ka dhyan rakhunga.',
      )}
      footer={
        <>
          <Button label={pick(lang, 'Allow notifications', 'Notifications allow karo')} onPress={() => void allow()} loading={busy} size="lg" fullWidth />
          <Button label={pick(lang, 'Not now', 'Abhi nahi')} variant="ghost" onPress={() => setPhase('denied')} fullWidth />
        </>
      }
    />
  );
}

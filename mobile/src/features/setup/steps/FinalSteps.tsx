import { HandHeart, PartyPopper, ShieldCheck, Sun } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useProfile } from '@/api/hooks/onboarding';
import { useUpdateSettings } from '@/api/hooks/profile';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { firstName } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

import { pick, StepLayout, type StepProps } from '../shared';

/** "HH:MM" → a Date today at that time (pickers work on Dates). */
function toDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 7, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** I — daily rhythm: wake time (morning brief + digest), quiet hours and the evening check-in. */
export function RhythmStep({ onNext, lang }: StepProps) {
  const { settings } = useAuth();
  const update = useUpdateSettings();
  const [wake, setWake] = useState(() => toDate(settings?.wakeTime ?? '07:30'));
  const [quietStart, setQuietStart] = useState(() => toDate(settings?.quietHoursStart ?? '22:30'));
  const [quietEnd, setQuietEnd] = useState(() => toDate(settings?.quietHoursEnd ?? '07:00'));
  const [checkin, setCheckin] = useState(() => toDate(settings?.checkinTime ?? '21:00'));

  const save = () => {
    update.mutate(
      {
        wakeTime: toHHMM(wake),
        quietHoursStart: toHHMM(quietStart),
        quietHoursEnd: toHHMM(quietEnd),
        checkinTime: toHHMM(checkin),
        digestHour: wake.getHours(),
      },
      {
        onSuccess: () => onNext(),
        onError: (e) => toast(getErrorMessage(e, pick(lang, "Couldn't save. Please try again.", 'Save nahi hua. Phir se try karo.'))),
      },
    );
  };

  return (
    <StepLayout
      icon={Sun}
      title={pick(lang, 'Your daily rhythm', 'Aapka daily routine')}
      body={pick(
        lang,
        'I’ll brief you when you wake up, stay quiet when you rest, and check in in the evening.',
        'Aapke uthne par brief dunga, aaram ke time chup rahunga, aur shaam ko haal-chaal puchunga.',
      )}
      footer={<Button label={pick(lang, 'Save and continue', 'Save karke aage chalo')} onPress={save} loading={update.isPending} size="lg" fullWidth />}
    >
      <DateTimeField mode="time" label={pick(lang, 'I usually wake up at', 'Subah uthne ka time')} value={wake} onChange={(d) => d && setWake(d)} />
      <View style={styles.pair}>
        <View style={styles.flex}>
          <DateTimeField mode="time" label={pick(lang, 'Quiet hours from', 'Quiet hours kab se')} value={quietStart} onChange={(d) => d && setQuietStart(d)} />
        </View>
        <View style={styles.flex}>
          <DateTimeField mode="time" label={pick(lang, 'Until', 'Kab tak')} value={quietEnd} onChange={(d) => d && setQuietEnd(d)} />
        </View>
      </View>
      <DateTimeField mode="time" label={pick(lang, 'Evening check-in at', 'Shaam ka check-in')} value={checkin} onChange={(d) => d && setCheckin(d)} />
    </StepLayout>
  );
}

/** J — the one-time note about recording other people. */
export function ConsentStep({ onNext, lang }: StepProps) {
  const update = useUpdateSettings();
  const acknowledge = () => {
    // Best effort: the note was shown either way; never block setup on it.
    update.mutate({ recordingConsentAcknowledged: true });
    onNext();
  };
  return (
    <StepLayout
      icon={ShieldCheck}
      title={pick(lang, 'One quick note', 'Ek zaroori baat')}
      body={pick(
        lang,
        'When you record a conversation, let the people around you know. It’s the respectful thing to do, and in many places it’s the law.',
        'Jab bhi aap koi conversation record karo, saath wale logon ko bata dena. Yeh respect ki baat hai, aur kai jagah law bhi yahi kehta hai.',
      )}
      footer={<Button label={pick(lang, 'Got it', 'Samajh gaya')} onPress={acknowledge} size="lg" fullWidth />}
    >
      <Card muted>
        <Text variant="callout" tone="secondary">
          {pick(
            lang,
            'Raw audio is deleted after processing. Only the transcript, summary and the items you confirm are kept, and you can delete any of it.',
            'Raw audio process hone ke baad delete ho jaata hai. Sirf transcript, summary aur aapke confirm kiye items rehte hain, aur aap kuch bhi delete kar sakte ho.',
          )}
        </Text>
      </Card>
    </StepLayout>
  );
}

/** K → L, M — the first nudge, then Today; the backend sends the welcome email. */
export function NudgeStep({ onFinish, lang }: Omit<StepProps, 'onNext'> & { onFinish: () => Promise<void> }) {
  const theme = useTheme();
  const { user, settings } = useAuth();
  const profile = useProfile();
  const [busy, setBusy] = useState(false);
  const name = profile.data?.preferredName || firstName(user?.name, user?.email);

  const finish = async () => {
    setBusy(true);
    try {
      await onFinish();
      haptics.success();
    } catch (e) {
      toast(getErrorMessage(e, pick(lang, "Couldn't finish setup. Please try again.", 'Setup complete nahi hua. Phir se try karo.')));
      setBusy(false);
    }
  };

  return (
    <StepLayout
      icon={PartyPopper}
      title={pick(lang, `You’re all set${name ? `, ${name}` : ''}!`, `Sab set hai${name ? `, ${name}` : ''}!`)}
      body={pick(
        lang,
        'I’m here whenever you need me. The more we talk, the better I get to know you.',
        'Main hamesha yahin hoon. Jitna hum baat karenge, utna main aapko behtar samjhunga.',
      )}
      footer={<Button label={pick(lang, 'Take me to Today', 'Today par chalo')} onPress={() => void finish()} loading={busy} size="lg" fullWidth />}
    >
      <Card>
        <View style={styles.nudge}>
          <View style={[styles.nudgeIcon, { backgroundColor: theme.colors.accentSoft }]}>
            <HandHeart size={20} color={theme.colors.accentText} />
          </View>
          <View style={styles.flex}>
            <Text variant="subheading">{pick(lang, 'Try this first', 'Pehle yeh try karo')}</Text>
            <Text variant="callout" tone="secondary">
              {pick(
                lang,
                'Record your next conversation, or tell me about your day. I’ll pull out the to-dos and promises for you.',
                'Apni agli conversation record karo, ya mujhe apne din ke baare mein batao. To-dos aur promises main nikaal dunga.',
              )}
            </Text>
          </View>
        </View>
      </Card>
      {settings?.emailNotifications ? (
        <Text variant="caption" tone="muted">
          {pick(lang, 'I’ve also sent you a welcome email with a few quick tips.', 'Maine aapko quick tips ke saath ek welcome email bhi bheja hai.')}
        </Text>
      ) : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: 2,
  },
  pair: {
    flexDirection: 'row',
    gap: 12,
  },
  nudge: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  nudgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

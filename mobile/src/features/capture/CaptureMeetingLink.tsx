import { router } from 'expo-router';
import { CalendarDays, CheckCircle2, Link2, Mail, Send } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { getErrorMessage } from '@/api/errors';
import { useFollowUpDecision, useLinkCapture } from '@/api/hooks/captures';
import type { CaptureDetail, LanguageStyle } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Touchable } from '@/components/ui/Touchable';
import { pick } from '@/features/setup/shared';
import { useTheme } from '@/theme/ThemeProvider';
import { formatTime } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import { toast } from '@/utils/toast';

/**
 * Which calendar meeting this recording belongs to (user-flow §06): the linked meeting, or — when it matches
 * no event yet — the meetings around that time to pick from ("asks which meeting or keeps it standalone").
 */
export function EventLink({ capture, lang }: { capture: CaptureDetail; lang: LanguageStyle }) {
  const theme = useTheme();
  const link = useLinkCapture(capture.id);
  const [standalone, setStandalone] = useState(false);

  if (capture.linkedMeeting) {
    const m = capture.linkedMeeting;
    return (
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`Linked to ${m.title}`}
        onPress={() => router.push(`/meeting/${m.id}`)}
        style={[styles.chip, { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radii.pill }]}
      >
        <CalendarDays size={14} color={theme.colors.primaryText} />
        <Text variant="caption" tone="brand" numberOfLines={1} style={styles.flex}>
          {m.title} · {formatTime(m.startAt)}
        </Text>
      </Touchable>
    );
  }
  if (standalone || !capture.eventSuggestions.length) return null;
  return (
    <Card>
      <View style={styles.body}>
        <View style={styles.row}>
          <Link2 size={16} color={theme.colors.textSecondary} />
          <Text variant="label" style={styles.flex}>
            {pick(lang, 'Was this one of these meetings?', 'Kya ye inme se koi meeting thi?')}
          </Text>
        </View>
        <View style={styles.wrap}>
          {capture.eventSuggestions.map((e) => (
            <Chip
              key={e.id}
              icon={CalendarDays}
              label={`${e.title} · ${formatTime(e.startAt)}`}
              onPress={() => {
                haptics.selection();
                link.mutate(e.id, {
                  onSuccess: () => toast(pick(lang, 'Linked to the meeting', 'Meeting se jod diya')),
                  onError: (err) => toast(getErrorMessage(err)),
                });
              }}
            />
          ))}
          <Chip label={pick(lang, 'Keep it standalone', 'Alag hi rehne do')} onPress={() => setStandalone(true)} />
        </View>
      </View>
    </Card>
  );
}

/**
 * Drafted recap email to the attendees (user-flow §06). Nothing is sent by Remi: the user edits it, then it
 * opens in their own email app; "Skip" drops it.
 */
export function FollowUpCard({ capture, lang }: { capture: CaptureDetail; lang: LanguageStyle }) {
  const theme = useTheme();
  const decide = useFollowUpDecision(capture.id);
  const f = capture.followUp;
  const [subject, setSubject] = useState(f?.subject ?? '');
  const [body, setBody] = useState(f?.body ?? '');
  if (!f) return null;
  const to = f.to.map((r) => r.email).join(',');

  if (f.status !== 'draft') {
    return (
      <Card muted>
        <View style={styles.row}>
          {f.status === 'sent' ? <CheckCircle2 size={18} color={theme.colors.success} /> : <Mail size={18} color={theme.colors.textMuted} />}
          <Text variant="callout" style={styles.flex}>
            {f.status === 'sent' ? pick(lang, 'Follow-up opened in your email', 'Follow-up email app mein khola') : pick(lang, 'Follow-up skipped', 'Follow-up skip kiya')}
          </Text>
        </View>
      </Card>
    );
  }

  const send = async () => {
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      decide.mutate({ status: 'sent', subject, body });
    } catch {
      toast(pick(lang, 'No email app found on this phone.', 'Is phone par koi email app nahi mila.'));
    }
  };

  return (
    <View style={styles.section}>
      <SectionHeader
        title={pick(lang, 'Follow-up email', 'Follow-up email')}
        subtitle={pick(lang, 'Nothing is sent until you send it from your email.', 'Jab tak tum apne email se nahi bhejoge, kuch nahi jayega.')}
      />
      <Card>
        <View style={styles.body}>
          <Text variant="caption" tone="secondary">
            {pick(lang, 'To', 'Kisko')}: {f.to.map((r) => r.name ?? r.email).join(', ')}
          </Text>
          <TextField label={pick(lang, 'Subject', 'Subject')} value={subject} onChangeText={setSubject} maxLength={300} />
          <TextField label={pick(lang, 'Message', 'Message')} value={body} onChangeText={setBody} multiline maxLength={5000} />
          <View style={styles.wrap}>
            <Button label={pick(lang, 'Send from my email', 'Apne email se bhejo')} icon={Send} size="sm" loading={decide.isPending} onPress={() => void send()} />
            <Button label={pick(lang, 'Skip', 'Skip')} size="sm" variant="ghost" onPress={() => decide.mutate({ status: 'skipped' })} />
          </View>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  flex: { flex: 1 },
  body: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { gap: 12 },
});

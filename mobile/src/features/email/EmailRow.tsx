import { CalendarClock, ShieldAlert, Star } from 'lucide-react-native';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { EmailCategory, EmailItem } from '@/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useTheme } from '@/theme/ThemeProvider';
import { formatRelative } from '@/utils/format';

export const CATEGORY_LABEL: Record<EmailCategory, string> = {
  urgent: 'Important',
  needs_reply: 'Needs reply',
  fyi: 'FYI',
  promotion: 'Promotion',
  phishing: 'Phishing?',
  sensitive: 'Private',
};

export const CATEGORY_TONE: Record<EmailCategory, ChipTone> = {
  urgent: 'danger',
  needs_reply: 'warning',
  fyi: 'neutral',
  promotion: 'neutral',
  phishing: 'danger',
  sensitive: 'info',
};

export function senderName(e: Pick<EmailItem, 'fromName' | 'fromEmail'>): string {
  return e.fromName || e.fromEmail || 'Unknown sender';
}

/** One email: sender, the one-line summary and why it matters. Never the body. */
export const EmailRow = memo(function EmailRow({ email, onPress }: { email: EmailItem; onPress: (e: EmailItem) => void }) {
  const theme = useTheme();
  const handled = email.status === 'done' || email.status === 'replied' || email.status === 'dismissed';
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={`Email from ${senderName(email)}: ${email.summary ?? email.subject ?? ''}`}
      onPress={() => onPress(email)}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: theme.colors.surfacePressed } : null, handled ? styles.handled : null]}
    >
      <Avatar name={senderName(email)} size={36} />
      <View style={styles.flex}>
        <View style={styles.top}>
          {email.isVip ? <Star size={13} color={theme.colors.warning} fill={theme.colors.warning} /> : null}
          <Text variant="label" numberOfLines={1} style={styles.flex}>
            {senderName(email)}
          </Text>
          <Text variant="caption" tone="muted">
            {formatRelative(email.receivedAt)}
          </Text>
        </View>
        <Text variant="callout" numberOfLines={2}>
          {email.category === 'sensitive' ? 'A code, password or statement (not kept)' : (email.summary ?? email.subject ?? '(no subject)')}
        </Text>
        <View style={styles.meta}>
          {email.category !== 'fyi' ? (
            <Chip
              label={CATEGORY_LABEL[email.category]}
              tone={CATEGORY_TONE[email.category]}
              icon={email.category === 'phishing' ? ShieldAlert : undefined}
            />
          ) : null}
          {email.openDetected ? <Chip label={`${email.openDetected} to confirm`} icon={CalendarClock} tone="brand" /> : null}
          {email.why && email.category !== 'phishing' && email.category !== 'sensitive' ? (
            <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.flex}>
              {email.why}
            </Text>
          ) : null}
        </View>
      </View>
    </Touchable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  handled: { opacity: 0.6 },
});

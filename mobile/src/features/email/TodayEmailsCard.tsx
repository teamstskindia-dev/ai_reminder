import { router } from 'expo-router';
import { ChevronDown, ChevronUp, Mail, Newspaper } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { EmailItem, LanguageStyle, TodayEmails } from '@/api/types';
import { Card } from '@/components/ui/Card';
import { ListGroup } from '@/components/ui/ListRow';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { pick } from '@/features/setup/shared';
import { useTheme } from '@/theme/ThemeProvider';

import { EmailRow, senderName } from './EmailRow';

/**
 * Today (user-flow §07): emails that need the user, and the rest bundled as a short digest. Without a
 * connected inbox, a quiet one-line invite to connect it.
 */
export function TodayEmailsCard({ emails, lang }: { emails: TodayEmails | undefined; lang: LanguageStyle }) {
  const theme = useTheme();
  const [showFyi, setShowFyi] = useState(false);
  const open = useCallback((e: EmailItem) => router.push({ pathname: '/email/[id]', params: { id: e.id } }), []);

  if (!emails?.connected) {
    return (
      <Touchable accessibilityRole="button" onPress={() => router.push('/connected-apps')} style={styles.invite}>
        <Mail size={16} color={theme.colors.textMuted} />
        <Text variant="caption" tone="muted">
          {pick(lang, 'Connect your email so I can tell you what needs you', 'Email connect karo, main bataunga kya zaroori hai')}
        </Text>
      </Touchable>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title={pick(lang, 'Emails that need you', 'Zaroori emails')}
        actionLabel={pick(lang, 'All email', 'Sab emails')}
        onAction={() => router.push('/emails')}
      />
      {emails.needYou.length ? (
        <ListGroup>
          {emails.needYou.map((e) => (
            <EmailRow key={e.id} email={e} onPress={open} />
          ))}
        </ListGroup>
      ) : (
        <Card muted>
          <Text variant="callout" tone="secondary">
            {pick(lang, 'Nothing in your inbox needs you right now.', 'Abhi inbox mein kuch zaroori nahi hai.')}
          </Text>
        </Card>
      )}
      {emails.needYouCount > emails.needYou.length ? (
        <Text variant="caption" tone="muted">
          {pick(lang, `+${emails.needYouCount - emails.needYou.length} more`, `+${emails.needYouCount - emails.needYou.length} aur`)}
        </Text>
      ) : null}
      {emails.fyiCount ? (
        <Card muted>
          <Touchable accessibilityRole="button" onPress={() => setShowFyi((v) => !v)} style={styles.digestHead}>
            <Newspaper size={16} color={theme.colors.textSecondary} />
            <Text variant="callout" style={styles.flex}>
              {pick(
                lang,
                `Digest: ${emails.fyiCount} update${emails.fyiCount === 1 ? '' : 's'} and newsletters`,
                `Digest: ${emails.fyiCount} updates aur newsletters`,
              )}
            </Text>
            {showFyi ? <ChevronUp size={16} color={theme.colors.textMuted} /> : <ChevronDown size={16} color={theme.colors.textMuted} />}
          </Touchable>
          {showFyi ? (
            <View style={styles.digest}>
              {emails.fyi.map((e) => (
                <Touchable key={e.id} accessibilityRole="button" onPress={() => open(e)} style={styles.digestRow}>
                  <Text variant="caption" numberOfLines={2}>
                    <Text variant="caption" weight="600">
                      {senderName(e)}:{' '}
                    </Text>
                    {e.summary ?? e.subject ?? ''}
                  </Text>
                </Touchable>
              ))}
              {emails.fyiCount > emails.fyi.length ? (
                <Touchable accessibilityRole="button" onPress={() => router.push('/emails?filter=fyi')} style={styles.digestRow}>
                  <Text variant="caption" tone="brand">
                    {pick(lang, 'See all', 'Sab dekho')}
                  </Text>
                </Touchable>
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  flex: { flex: 1 },
  invite: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  digestHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  digest: { marginTop: 10, gap: 8 },
  digestRow: { paddingVertical: 2 },
});

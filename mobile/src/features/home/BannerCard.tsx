import { Image } from 'expo-image';
import { ArrowRight, X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import type { Banner } from '@/api/types';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useConfig } from '@/providers/config/ConfigProvider';
import { readableOn } from '@/theme/color';
import { useTheme, type AppTheme } from '@/theme/ThemeProvider';
import { HIT_TARGET } from '@/theme/tokens';
import { isOpenableLink, openLink } from '@/utils/links';

function bannerColors(theme: AppTheme, variant: Banner['variant']) {
  const { colors } = theme;
  switch (variant) {
    case 'promo':
      return { bg: colors.primary, fg: colors.primaryForeground, accent: colors.primaryForeground };
    case 'success':
      return { bg: colors.successSoft, fg: colors.text, accent: colors.success };
    case 'warning':
      return { bg: colors.warningSoft, fg: colors.text, accent: colors.warning };
    default:
      return { bg: colors.primarySoft, fg: colors.text, accent: colors.primaryText };
  }
}

export function BannerCard({ banner, onDismiss }: { banner: Banner; onDismiss: (id: string) => void }) {
  const theme = useTheme();
  const { isEnabled } = useConfig();
  const c = bannerColors(theme, banner.variant);
  const muted = banner.variant === 'promo' ? c.fg : theme.colors.textSecondary;
  const ctaUrl = banner.ctaUrl;

  return (
    <View
      accessibilityRole="summary"
      style={[styles.card, { backgroundColor: c.bg, borderRadius: theme.radii.lg }]}
    >
      {banner.imageUrl ? (
        <Image source={{ uri: banner.imageUrl }} style={[styles.image, { borderRadius: theme.radii.md }]} contentFit="cover" />
      ) : null}
      <View style={styles.body}>
        <Text variant="subheading" color={c.fg} style={styles.title}>
          {banner.title}
        </Text>
        {banner.body ? (
          <Text variant="callout" color={muted} style={banner.variant === 'promo' ? styles.promoBody : null}>
            {banner.body}
          </Text>
        ) : null}
        {banner.ctaLabel && ctaUrl && isOpenableLink(ctaUrl) ? (
          <Touchable
            accessibilityRole="link"
            accessibilityLabel={banner.ctaLabel}
            onPress={() => void openLink(ctaUrl, isEnabled)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: banner.variant === 'promo' ? c.fg : theme.colors.surface,
                borderRadius: theme.radii.pill,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text variant="label" color={banner.variant === 'promo' ? readableOn(c.fg) : c.accent}>
              {banner.ctaLabel}
            </Text>
            <ArrowRight size={14} color={banner.variant === 'promo' ? readableOn(c.fg) : c.accent} strokeWidth={2.4} />
          </Touchable>
        ) : null}
      </View>
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`Dismiss "${banner.title}"`}
        onPress={() => onDismiss(banner.id)}
        style={styles.close}
      >
        <X size={18} color={muted} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 16,
    paddingRight: 4,
    gap: 12,
  },
  image: {
    width: 56,
    height: 56,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
    paddingRight: 4,
  },
  promoBody: {
    opacity: 0.88,
  },
  cta: {
    overflow: 'hidden',
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
  },
  close: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

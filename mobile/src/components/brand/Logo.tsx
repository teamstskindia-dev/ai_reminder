import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useBranding } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';

export interface LogoProps {
  /** `full` = wordmark logo (logoUrl / logoDarkUrl), `icon` = square mark (iconUrl). */
  variant?: 'full' | 'icon';
  /** Height of the wordmark, or the size of the square icon. */
  size?: number;
  /** Force the logo intended for dark backgrounds. Defaults to the current colour scheme. */
  onDark?: boolean;
  showName?: boolean;
  style?: StyleProp<ViewStyle>;
}

function LetterMark({ size, name }: { size: number; name: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: theme.colors.primary },
      ]}
    >
      <Text color={theme.colors.primaryForeground} style={{ fontSize: Math.round(size * 0.52), lineHeight: Math.round(size * 0.62), fontWeight: '800' }}>
        {(name.trim()[0] ?? 'R').toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * Brand logo from the admin-managed config. Falls back to a letter mark + app name if the image
 * URL is missing or fails to load.
 */
export function Logo({ variant = 'full', size = 36, onDark, showName, style }: LogoProps) {
  const branding = useBranding();
  const theme = useTheme();
  const dark = onDark ?? theme.isDark;
  const uri = variant === 'icon' ? branding.iconUrl : dark ? branding.logoDarkUrl || branding.logoUrl : branding.logoUrl;
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = !uri || failedUri === uri;

  if (failed) {
    return (
      <View style={[styles.row, style]} accessibilityRole="image" accessibilityLabel={branding.appName}>
        <LetterMark size={size} name={branding.appName} />
        {variant === 'full' || showName ? (
          <Text variant="title" color={dark ? '#FFFFFF' : theme.colors.text} style={{ fontSize: Math.round(size * 0.62) }}>
            {branding.appName}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.row, style]} accessibilityRole="image" accessibilityLabel={branding.appName}>
      <Image
        source={{ uri }}
        style={variant === 'icon' ? { width: size, height: size, borderRadius: Math.round(size * 0.22) } : { height: size, width: size * 3.75 }}
        contentFit="contain"
        contentPosition={variant === 'icon' ? 'center' : 'left'}
        cachePolicy="memory-disk"
        transition={120}
        onError={() => setFailedUri(uri)}
      />
      {variant === 'icon' && showName ? (
        <Text variant="title" color={dark ? '#FFFFFF' : theme.colors.text}>
          {branding.appName}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

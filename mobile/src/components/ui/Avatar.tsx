import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { mix } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export function initialsOf(name: string | null | undefined, fallback = '?'): string {
  const source = (name ?? '').trim();
  if (!source) return fallback;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

export interface AvatarProps {
  name: string | null | undefined;
  uri?: string | null;
  size?: number;
}

export function Avatar({ name, uri, size = 40 }: AvatarProps) {
  const theme = useTheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(uri) && failedUri !== uri;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? `${name} avatar` : 'Avatar'}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: mix(theme.colors.surface, theme.colors.primary, theme.isDark ? 0.35 : 0.16),
        },
      ]}
    >
      {showImage && uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          transition={150}
          onError={() => setFailedUri(uri)}
        />
      ) : (
        <Text
          variant="label"
          tone="brand"
          style={{ fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.46), fontWeight: '700' }}
        >
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

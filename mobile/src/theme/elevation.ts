import { Platform, StyleSheet, type ViewStyle } from 'react-native';

import type { Palette } from './palette';

export type ElevationLevel = 0 | 1 | 2 | 3;

const IOS_SHADOW = [
  null,
  { opacity: 0.06, radius: 8, offset: 2 },
  { opacity: 0.1, radius: 14, offset: 6 },
  { opacity: 0.14, radius: 22, offset: 10 },
] as const;
const ANDROID_ELEVATION = [0, 1, 4, 8] as const;

/**
 * One elevation scale for both platforms: iOS `shadow*` props, Android `elevation`. In dark mode shadows
 * are invisible, so surfaces get a hairline border instead. Level 1 also keeps a hairline border on light.
 */
export function elevation(level: ElevationLevel, colors: Palette, isDark: boolean): ViewStyle {
  if (level === 0) return {};
  const border: ViewStyle = { borderWidth: StyleSheet.hairlineWidth, borderColor: level >= 2 ? colors.borderStrong : colors.border };
  if (isDark) return border;
  const shadow = IOS_SHADOW[level];
  const platform =
    Platform.select<ViewStyle>({
      ios: shadow
        ? { shadowColor: colors.shadow, shadowOpacity: shadow.opacity, shadowRadius: shadow.radius, shadowOffset: { width: 0, height: shadow.offset } }
        : {},
      android: { elevation: ANDROID_ELEVATION[level], shadowColor: colors.shadow },
      default: {},
    }) ?? {};
  return level === 1 ? { ...border, ...platform } : platform;
}

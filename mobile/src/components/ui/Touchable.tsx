import { Platform, Pressable, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';

import { useOptionalTheme } from '@/theme/ThemeProvider';

export interface TouchableProps extends Omit<PressableProps, 'style' | 'android_ripple'> {
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  /** iOS pressed feedback when `style` is static (defaults to a subtle fade). */
  pressedStyle?: StyleProp<ViewStyle>;
  rippleColor?: string;
  rippleBorderless?: boolean;
  rippleRadius?: number;
}

const IS_ANDROID = Platform.OS === 'android';
const DEFAULT_IOS_PRESSED: ViewStyle = { opacity: 0.7 };

/**
 * The app's one pressable: Material ripple on Android, highlight/opacity on iOS.
 * On Android, pressed-state styles from `style` callbacks are suppressed so feedback isn't doubled.
 */
export function Touchable({ style, pressedStyle, rippleColor, rippleBorderless, rippleRadius, disabled, ...rest }: TouchableProps) {
  const theme = useOptionalTheme();
  const color = rippleColor ?? theme?.colors.surfacePressed ?? 'rgba(0,0,0,0.08)';

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      android_ripple={IS_ANDROID && !disabled ? { color, borderless: rippleBorderless, radius: rippleRadius } : undefined}
      style={(state) => {
        if (typeof style === 'function') return style(IS_ANDROID ? { ...state, pressed: false } : state);
        if (IS_ANDROID || !state.pressed) return style;
        return [style, pressedStyle ?? DEFAULT_IOS_PRESSED];
      }}
    />
  );
}

import { Mic, Pause } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

const SIZE = 184;

/** The big mic orb in the middle of the recorder: two soft rings breathe outwards while recording. */
export function RecordingOrb({ recording, level }: { recording: boolean; level: number }) {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  const [voice] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!recording) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [recording, pulse]);

  // The inner disc swells a little with the voice.
  useEffect(() => {
    Animated.timing(voice, { toValue: recording ? level : 0, duration: 120, useNativeDriver: true }).start();
  }, [recording, level, voice]);

  const ring = (delay: number) => {
    const t = Animated.modulo(Animated.add(pulse, delay), 1);
    return {
      opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
      transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1.18] }) }],
    };
  };

  const tint = recording ? theme.colors.primary : theme.colors.textMuted;
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {recording ? (
        <>
          <Animated.View style={[styles.ring, { borderColor: theme.colors.primary }, ring(0)]} />
          <Animated.View style={[styles.ring, { borderColor: theme.colors.primary }, ring(0.5)]} />
        </>
      ) : null}
      <View style={[styles.halo, { backgroundColor: recording ? theme.colors.primarySoft : theme.colors.surfaceMuted }]}>
        <Animated.View
          style={[
            styles.core,
            { backgroundColor: tint },
            recording ? theme.elevation.card : null,
            { transform: [{ scale: voice.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] },
          ]}
        >
          {recording ? <Mic size={40} color={theme.colors.primaryForeground} /> : <Pause size={36} color={theme.colors.primaryForeground} />}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
  },
  halo: {
    width: 136,
    height: 136,
    borderRadius: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

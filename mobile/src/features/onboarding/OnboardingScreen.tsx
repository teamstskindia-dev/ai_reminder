import { Image } from 'expo-image';
import { ArrowRight } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOnboardingSlides } from '@/api/hooks/content';
import type { OnboardingSlideContent, Section } from '@/api/types';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { useOnboarding } from '@/providers/OnboardingProvider';
import { DEFAULT_ONBOARDING } from '@/providers/config/defaultConfig';
import { isHexColor, mix } from '@/theme/color';
import { useTheme } from '@/theme/ThemeProvider';

type Slide = Section<OnboardingSlideContent>;

/** One equal-size dot per slide; only the current slide's dot is filled with the brand colour. */
function Dot({ active, color, inactiveColor }: { active: boolean; color: string; inactiveColor: string }) {
  return <View style={[styles.dot, { backgroundColor: active ? color : inactiveColor }]} />;
}

export function OnboardingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { markSeen } = useOnboarding();
  const query = useOnboardingSlides();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  // Server slides when available; the bundled seed slides if the API is unreachable.
  const slides: Slide[] = query.isError ? DEFAULT_ONBOARDING : (query.data ?? []).filter((s) => s.type === 'onboarding_slide');
  const loading = query.isPending;
  const isLast = index >= slides.length - 1;

  // Nothing configured: skip straight to sign-in.
  useEffect(() => {
    if (!loading && slides.length === 0) markSeen();
  }, [loading, slides.length, markSeen]);

  const pageBg = (slide: Slide | undefined) => {
    const raw = slide?.content.backgroundColor;
    const base = raw && isHexColor(raw) ? raw : theme.colors.primarySoft;
    return theme.isDark ? mix(theme.colors.background, base, 0.16) : base;
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const next = () => {
    if (isLast) {
      markSeen();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    setIndex(index + 1);
  };

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: pageBg(slides[index]) }]}>
      <Animated.FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(s) => s.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={[styles.page, { width, backgroundColor: pageBg(item), paddingTop: insets.top + 72 }]}>
            <View style={[styles.imageCard, { borderRadius: theme.radii.xl * 1.5, backgroundColor: theme.colors.surface }, theme.elevation.raised]}>
              {item.content.imageUrl ? (
                <Image
                  source={{ uri: item.content.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={250}
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Logo variant="icon" size={96} />
              )}
            </View>
            <View style={styles.copy}>
              <Text variant="display" align="center">
                {item.content.title}
              </Text>
              <Text variant="body" tone="secondary" align="center">
                {item.content.description}
              </Text>
            </View>
          </View>
        )}
      />

      <View style={[styles.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Logo size={28} />
        {!isLast ? (
          <Touchable accessibilityRole="button" accessibilityLabel="Skip onboarding" onPress={markSeen} hitSlop={12} style={styles.skip}>
            <Text variant="label" tone="secondary">
              Skip
            </Text>
          </Touchable>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dots} accessibilityLabel={`Slide ${index + 1} of ${slides.length}`}>
          {slides.map((s, i) => (
            <Dot key={s.id} active={i === index} color={theme.colors.primary} inactiveColor={theme.colors.borderStrong} />
          ))}
        </View>
        <Button
          label={isLast ? 'Get started' : 'Next'}
          iconRight={isLast ? undefined : ArrowRight}
          onPress={next}
          size="lg"
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 28,
  },
  imageCard: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 360,
    maxWidth: 360,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    gap: 10,
    maxWidth: 360,
  },
  topBar: {
    position: 'absolute',
    left: 20,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: {
    minHeight: 48,
    minWidth: 48,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 0,
    gap: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

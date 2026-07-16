/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentionally mutable. */
import { useEffect, type ReactNode } from 'react';
import { View, type ScrollViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  withTiming,
  withRepeat,
  cancelAnimation,
  runOnJS,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { Mono } from './Text';

const THRESHOLD = 72;
const MAX_PULL = 110;
const REST = 60; // held offset while refreshing

// Gesture-driven pull-to-refresh: the whole scroll content drags down as you
// pull; a branded indicator reveals at the top; releasing past the threshold
// snaps to a rest offset, fires onRefresh, then springs back when done.
// Works on iOS + Android (no native RefreshControl).
export function RefreshScroll({
  children,
  refreshing,
  onRefresh,
  contentContainerStyle,
  ...props
}: {
  children: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
} & ScrollViewProps) {
  const { colors } = useTheme();
  const scrollY = useSharedValue(0);
  const pull = useSharedValue(0);
  const busy = useSharedValue(false);
  const spin = useSharedValue(0);

  useEffect(() => {
    return () => cancelAnimation(spin);
  }, [spin]);

  // When the parent finishes refreshing, spring content back up.
  useAnimatedReaction(
    () => refreshing,
    (r, prev) => {
      if (prev && !r) {
        busy.value = false;
        pull.value = withTiming(0, { duration: 240 });
      }
    },
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const startSpin = () => {
    spin.value = 0;
    spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
  };

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (busy.value) return;
      if (scrollY.value <= 0 && e.translationY > 0) {
        pull.value = Math.min(MAX_PULL, e.translationY * 0.5);
      }
    })
    .onEnd(() => {
      if (busy.value) return;
      if (pull.value >= THRESHOLD) {
        busy.value = true;
        pull.value = withTiming(REST, { duration: 160 });
        runOnJS(startSpin)();
        runOnJS(onRefresh)();
      } else {
        pull.value = withTiming(0, { duration: 200 });
      }
    });

  const composed = Gesture.Simultaneous(Gesture.Native(), pan);

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pull.value }] }));
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pull.value, [10, THRESHOLD], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(pull.value, [0, REST], [-10, 14], Extrapolation.CLAMP) }],
  }));
  const spinStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: busy.value ? `${spin.value}deg` : `${interpolate(pull.value, [0, THRESHOLD], [0, 180], Extrapolation.CLAMP)}deg` },
    ],
  }));

  return (
    <View className="flex-1">
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 5 }, indicatorStyle]}
      >
        <View
          className="flex-row items-center gap-2 rounded-pill border border-line bg-elevated px-3 py-1.5"
          style={{ shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}
        >
          <Animated.View
            style={[
              { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: colors.line, borderTopColor: colors.accent },
              spinStyle,
            ]}
          />
          <Mono className="text-micro tracking-wide uppercase text-muted">Refreshing</Mono>
        </View>
      </Animated.View>

      <GestureDetector gesture={composed}>
        <Animated.View style={[{ flex: 1 }, contentStyle]}>
          <Animated.ScrollView
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={contentContainerStyle}
            {...props}
          >
            {children}
          </Animated.ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

// Three staggered dots while the request is in flight — the same affordance web
// uses, replacing the bare "Thinking…" label.
//
// Driven on the UI thread by Reanimated rather than setState, because this runs
// for as long as the agent takes (a tool turn can be 30s+) and must not add a
// single JS commit to that wait.

function Dot({ delay }: { delay: number }) {
  const { colors } = useTheme();
  const o = useSharedValue(0.25);

  useEffect(() => {
    o.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 550, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
  }, [o, delay]);

  const style = useAnimatedStyle(() => ({ opacity: o.value }));

  return (
    <Animated.View
      style={[{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.muted }, style]}
    />
  );
}

export function TypingDots() {
  return (
    <View className="flex-row items-center gap-1.5 py-2" accessibilityLabel="Copilot is thinking">
      <Dot delay={0} />
      <Dot delay={180} />
      <Dot delay={360} />
    </View>
  );
}

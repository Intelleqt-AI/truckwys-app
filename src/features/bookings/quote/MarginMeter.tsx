import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { EASE_OUT, motion } from '@/theme/tokens';

/**
 * A thin gauge for the quote's margin: a track filled to the margin, with a tick
 * at the company's target. The scale runs to twice the target (never less than
 * 20%), so the target tick always sits mid-track and a healthy margin reads as
 * a full-ish bar. Decorative: the figure beside it carries the accessible text.
 *
 * Tone follows the same rule as the margin figure: below zero danger, below the
 * target warning, at or above it success.
 */
export function MarginMeter({
  marginPct,
  targetPct,
}: {
  marginPct: number | null;
  targetPct: number;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const domain = Math.max(targetPct * 2, 20);
  const fill =
    marginPct === null
      ? 0
      : Math.min(100, Math.max(marginPct < 0 ? 3 : 0, (marginPct / domain) * 100));
  const tick = Math.min(100, (targetPct / domain) * 100);

  const width = useSharedValue(fill);
  useEffect(() => {
    width.value = reduced
      ? fill
      : withTiming(fill, { duration: motion.slow, easing: Easing.bezier(...EASE_OUT) });
  }, [fill, reduced, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  const tone =
    marginPct === null
      ? colors.neutralDot
      : marginPct < 0
        ? colors.dangerDot
        : marginPct < targetPct
          ? colors.warningDot
          : colors.successDot;

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className="h-1.5 w-full overflow-hidden rounded-pill bg-raised"
    >
      <Animated.View style={[{ height: 6, borderRadius: 6, backgroundColor: tone }, fillStyle]} />
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${tick}%`,
          width: 2,
          marginLeft: -1,
          backgroundColor: colors.fg,
          opacity: 0.55,
        }}
      />
    </View>
  );
}

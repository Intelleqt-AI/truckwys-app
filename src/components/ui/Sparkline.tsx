import { memo, useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import { Mono } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, EASE_OUT, status as statusHues } from '@/theme/tokens';
import type { TrendPoint } from '@/types/domain';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const ease = Easing.bezier(...EASE_OUT);

// A dash length safely larger than any realistic sparkline path — the
// standard stroke-dasharray/dashoffset "draw-on" trick, which needs no native
// path-length measurement (react-native-svg's Path exposes none on the JS
// side). Any value at least as long as the real path draws it identically.
const DRAW_LENGTH = 2000;

// ── Sparkline: revenue-vs-fuel area+line, mirrors the web Overview chart ───
// Modelled on ProfitCurve.tsx's layout/gradient/path pattern. Revenue draws
// on once via an animated stroke-dashoffset; the area fill and the dashed
// fuel line fade in alongside it. Not scrubbable — this is a glance chart,
// not an inspector.
function SparklineImpl({
  points,
  height = 72,
  color,
  fuelColor,
}: {
  points: TrendPoint[];
  height?: number;
  color?: string;
  fuelColor?: string;
}) {
  const { colors } = useTheme();
  const lineColor = color ?? colors.accent;
  // Matches web's fuel-cost line (var(--status-danger)) — a muted/faint line
  // here read too close to the revenue line to tell apart at a glance.
  const dashColor = fuelColor ?? statusHues.danger;
  const reducedMotion = useReducedMotion();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const progress = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (points.length < 2) return;
    progress.value = reducedMotion ? 1 : withTiming(1, { duration: motion.reveal, easing: ease });
    // Fires once when real data lands, not on every layout pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length, reducedMotion]);

  const revAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: DRAW_LENGTH * (1 - progress.value),
  }));
  const fadeAnimatedProps = useAnimatedProps(() => ({
    opacity: progress.value,
  }));

  if (points.length < 2) {
    return (
      <View onLayout={onLayout} style={{ height }} className="items-center justify-center">
        <Mono className="text-micro text-faint">Analysing…</Mono>
      </View>
    );
  }

  const pad = 4;
  const n = points.length;
  const maxY = Math.max(1, ...points.flatMap((p) => [p.revenue, p.expenses])) * 1.1;
  const sx = (i: number) => pad + (i / (n - 1)) * (w - pad * 2);
  const sy = (v: number) => pad + (1 - v / maxY) * (height - pad * 2);

  const revLine = points
    .map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.revenue).toFixed(1)}`)
    .join(' ');
  const revArea = `${revLine} L${sx(n - 1).toFixed(1)},${(height - pad).toFixed(1)} L${sx(0).toFixed(1)},${(height - pad).toFixed(1)} Z`;
  const fuelLine = points
    .map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.expenses).toFixed(1)}`)
    .join(' ');

  return (
    <View onLayout={onLayout} style={{ height }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="hero-rev" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lineColor} stopOpacity={0.15} />
              <Stop offset="1" stopColor={lineColor} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <AnimatedPath d={revArea} fill="url(#hero-rev)" animatedProps={fadeAnimatedProps} />
          <AnimatedPath
            d={fuelLine}
            stroke={dashColor}
            strokeWidth={1.2}
            strokeDasharray="3 2"
            fill="none"
            animatedProps={fadeAnimatedProps}
          />
          <AnimatedPath
            d={revLine}
            stroke={lineColor}
            strokeWidth={1.5}
            fill="none"
            strokeDasharray={[DRAW_LENGTH, DRAW_LENGTH]}
            animatedProps={revAnimatedProps}
          />
        </Svg>
      )}
    </View>
  );
}

export const Sparkline = memo(SparklineImpl);

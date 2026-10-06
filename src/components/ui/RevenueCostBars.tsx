import { memo, useEffect, useId, useState } from 'react';
import { View, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, G, Line, Pattern, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Mono } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { motion, EASE_OUT } from '@/theme/tokens';
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const ease = Easing.bezier(...EASE_OUT);

export interface RevenueCostMonth {
  /** Tick label, e.g. "Mar". */
  label: string;
  /** Spoken and readout label, e.g. "Mar 2026". */
  full: string;
  revenue: number;
  costs: number;
}

// ── RevenueCostBars: monthly revenue against costs, the web Overview's chart ──
// Revenue is the accent (current month solid, earlier months softened); costs
// are the neutral comparison, hatched. The web shows a hover tooltip; a phone
// has no hover, so tapping a month selects it and the readout above the chart
// says what it holds. The latest month is selected until the person taps.
const H = 168;
const PAD_L = 44;
const PAD_T = 6;
const PAD_B = 22;
const PLOT_H = H - PAD_T - PAD_B;
const GRID_STEPS = 3;

/** Smallest "nice" step so GRID_STEPS steps cover max (1, 2, 2.5, 5 × 10^k). */
function niceStep(max: number): number {
  const raw = Math.max(max, 1) / GRID_STEPS;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
}

function Bar({
  x,
  w,
  base,
  h,
  fill,
  opacity,
  progress,
}: {
  x: number;
  w: number;
  base: number;
  h: number;
  fill: string;
  opacity?: number;
  progress: SharedValue<number>;
}) {
  const props = useAnimatedProps(() => ({
    y: base - h * progress.value,
    height: h * progress.value,
  }));
  if (h <= 0) return null;
  return (
    <AnimatedRect
      x={x}
      y={base}
      width={w}
      height={0}
      rx={Math.min(3, w / 2)}
      fill={fill}
      opacity={opacity}
      animatedProps={props}
    />
  );
}

// SVG ids are document-global; a fixed one would collide (and one chart would
// paint with the other's pattern) if two charts were ever mounted together.
const useSvgId = (prefix: string) => `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

/** The hatched "Costs" legend key — the same fill the cost bars use. */
export function CostsSwatch({ size = 10 }: { size?: number }) {
  const { colors } = useTheme();
  const id = useSvgId('rcbk');
  return (
    <Svg width={size} height={size}>
      <Defs>
        <Pattern
          id={id}
          width={5}
          height={5}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <Rect width={5} height={5} fill={colors.chartMuted} fillOpacity={0.22} />
          <Line x1={0} y1={0} x2={0} y2={5} stroke={colors.chartMuted} strokeWidth={2} />
        </Pattern>
      </Defs>
      <Rect width={size} height={size} rx={2} fill={`url(#${id})`} />
    </Svg>
  );
}

function RevenueCostBarsImpl({ months }: { months: RevenueCostMonth[] }) {
  const { colors } = useTheme();
  const hatchId = useSvgId('rcb');
  const reducedMotion = useReducedMotion();
  const [w, setW] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const progress = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (months.length === 0) return;
    progress.value = reducedMotion ? 1 : withTiming(1, { duration: motion.reveal, easing: ease });
    // Fires once when real data lands, not on every layout pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months.length, reducedMotion]);

  const n = months.length;
  if (n === 0) return null;

  const last = n - 1;
  const sel = picked != null && picked <= last ? picked : last;
  const m = months[sel];
  if (!m) return null;
  const left = m.revenue - m.costs;

  const maxV = Math.max(1, ...months.flatMap((x) => [x.revenue, x.costs]));
  const step = niceStep(maxV);
  const top = step * GRID_STEPS;
  const y = (v: number) => PAD_T + PLOT_H - (Math.max(0, v) / top) * PLOT_H;
  const base = y(0);

  const plotW = Math.max(60, w - PAD_L);
  const band = plotW / n;
  // Narrow data gets wider bars, not a narrower chart.
  const bw = Math.max(4, Math.min(16, band * 0.32));
  const gap = 2;

  return (
    <View>
      <View className="mb-1.5">
        <Mono className="text-micro text-faint">{m.full}</Mono>
        <Mono className="mt-0.5 text-caption text-muted" numberOfLines={2}>
          <Mono className="text-caption font-semibold text-fg">
            {formatCurrency(m.revenue, { maximumFractionDigits: 0 })}
          </Mono>
          {' revenue · '}
          <Mono className="text-caption font-semibold text-fg">
            {formatCurrency(m.costs, { maximumFractionDigits: 0 })}
          </Mono>
          {' costs · '}
          <Mono className="text-caption font-semibold" style={{ color: left < 0 ? colors.danger : colors.fg }}>
            {formatCurrency(Math.abs(left), { maximumFractionDigits: 0 })}
          </Mono>
          {left < 0 ? ' short' : ' left over'}
        </Mono>
      </View>

      <View onLayout={onLayout} style={{ height: H }}>
        {w > 0 && (
          <>
            <Svg width={w} height={H}>
              <Defs>
                <Pattern
                  id={hatchId}
                  width={5}
                  height={5}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <Rect width={5} height={5} fill={colors.chartMuted} fillOpacity={0.22} />
                  <Line x1={0} y1={0} x2={0} y2={5} stroke={colors.chartMuted} strokeWidth={2} />
                </Pattern>
              </Defs>

              {Array.from({ length: GRID_STEPS + 1 }, (_, i) => (
                <Line
                  key={i}
                  x1={PAD_L}
                  x2={w}
                  y1={y(step * i)}
                  y2={y(step * i)}
                  stroke={i === 0 ? colors.chartAxis : colors.chartGrid}
                  strokeWidth={1}
                />
              ))}

              <Rect
                x={PAD_L + band * sel + 1}
                y={PAD_T}
                width={Math.max(0, band - 2)}
                height={PLOT_H}
                rx={6}
                fill={colors.chartBar}
              />

              {months.map((mo, i) => {
                const cx = PAD_L + band * i + band / 2;
                return (
                  <G key={mo.full}>
                    <Bar
                      x={cx - bw - gap / 2}
                      w={bw}
                      base={base}
                      h={base - y(mo.revenue)}
                      fill={colors.accent}
                      opacity={i === last ? 1 : 0.55}
                      progress={progress}
                    />
                    <Bar
                      x={cx + gap / 2}
                      w={bw}
                      base={base}
                      h={base - y(mo.costs)}
                      fill={`url(#${hatchId})`}
                      progress={progress}
                    />
                  </G>
                );
              })}
            </Svg>

            {/* y labels: Mono views, so the figures match the rest of the app */}
            {Array.from({ length: GRID_STEPS + 1 }, (_, i) => (
              <Mono
                key={i}
                className="absolute text-right text-micro text-faint"
                style={{ left: 0, width: PAD_L - 8, top: y(step * i) - 7 }}
                numberOfLines={1}
              >
                {i === 0 ? 'R 0' : formatCurrencyCompact(step * i)}
              </Mono>
            ))}

            {/* x labels: about every third month, the latest always */}
            {months.map((mo, i) =>
              (last - i) % 3 === 0 || n <= 6 ? (
                <Mono
                  key={mo.full}
                  className={`absolute text-center text-micro ${i === sel ? 'text-fg' : 'text-faint'}`}
                  style={{ left: PAD_L + band * i - 10, width: band + 20, top: H - PAD_B + 6 }}
                  numberOfLines={1}
                >
                  {mo.label}
                </Mono>
              ) : null,
            )}

            {/* one tap target per month column */}
            {months.map((mo, i) => (
              <TouchableOpacity
                key={mo.full}
                onPress={() => setPicked(i)}
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityState={{ selected: i === sel }}
                accessibilityLabel={`${mo.full}: ${formatCurrency(mo.revenue, { maximumFractionDigits: 0 })} revenue, ${formatCurrency(mo.costs, { maximumFractionDigits: 0 })} costs`}
                style={{ position: 'absolute', left: PAD_L + band * i, width: band, top: 0, height: H }}
              />
            ))}
          </>
        )}
      </View>
    </View>
  );
}

export const RevenueCostBars = memo(RevenueCostBarsImpl);

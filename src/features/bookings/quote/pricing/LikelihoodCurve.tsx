import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Txt } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import type { Choice, CurvePoint } from './analysis';

const H = 112;
const L = 34;
const R = 8;
const T = 8;
const B = 8;
const k = (v: number) => `R ${Math.round(v / 1000)}k`;

/**
 * Where the three prices sit on the chance-to-win curve (only inside the range
 * the model has seen). Dots mark the choices (the recommended one filled); a
 * vertical accent line marks the bar price when it isn't one of the three.
 * The words ("Safe 72%") sit under the chart rather than on it, so no label
 * can overlap another on a narrow phone.
 */
export function LikelihoodCurve({
  curve,
  range,
  choices,
  price,
}: {
  curve: CurvePoint[];
  range: [number, number];
  choices: Choice[];
  price: number | null;
}) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const pts = curve.filter((p) => p.price >= range[0] && p.price <= range[1]);
  if (pts.length < 2) return null;

  const span = Math.max(range[1] - range[0], 1);
  const x = (v: number) => L + ((v - range[0]) / span) * Math.max(w - L - R, 1);
  const y = (pct: number) => H - B - (pct / 100) * (H - B - T);
  const pctAt = (pr: number) => {
    let i = pts.findIndex((p) => p.price >= pr);
    if (i <= 0) i = 1;
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const t = b.price === a.price ? 0 : (pr - a.price) / (b.price - a.price);
    return a.pct + (b.pct - a.pct) * Math.max(0, Math.min(1, t));
  };
  const inRange = (pr: number) => pr >= range[0] && pr <= range[1];
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.price).toFixed(1)},${y(p.pct).toFixed(1)}`).join('');
  const dots = [...choices].filter((c) => inRange(c.price)).sort((a, b) => a.price - b.price);
  const youX = price != null && inRange(price) ? x(price) : null;
  const summary = dots.map((c) => `${c.label} ${Math.round(pctAt(c.price))}%`).join(' · ');

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Chance to win by price. ${summary}.`}
      onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}
    >
      {w > 0 && (
        <Svg width={w} height={H}>
          {[0, 50, 100].map((v) => (
            <Line key={v} x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke={colors.chartGrid} strokeWidth={1} />
          ))}
          <Path d={line} fill="none" stroke={colors.accent} strokeWidth={1.75} strokeLinejoin="round" />
          {youX != null && (
            <Line x1={youX} x2={youX} y1={T} y2={y(0)} stroke={colors.accent} strokeWidth={1.5} />
          )}
          {dots.map((c) => (
            <Circle
              key={c.key}
              cx={x(c.price)}
              cy={y(pctAt(c.price))}
              r={c.recommended ? 4.5 : 3.5}
              fill={c.recommended ? colors.fg : colors.surface}
              stroke={colors.fg}
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      )}
      {/* Axis words, in line with the 0 / 50 / 100 % gridlines. */}
      {w > 0 && (
        <>
          {[100, 50, 0].map((v) => (
            <Txt
              key={v}
              className="text-micro text-faint"
              style={{ position: 'absolute', left: 0, top: y(v) - 7, width: L - 6, textAlign: 'right' }}
            >
              {v}%
            </Txt>
          ))}
        </>
      )}
      <View className="flex-row justify-between" style={{ paddingLeft: L, paddingRight: R }}>
        <Txt className="text-micro text-faint">{k(range[0])}</Txt>
        <Txt className="text-micro text-faint">{k(range[1])}</Txt>
      </View>
      {!!summary && (
        <Txt className="mt-1 text-caption text-muted">
          {summary}
          {price != null && !dots.some((c) => Math.abs(c.price - price) < 0.005) && inRange(price)
            ? ` · You ${formatCurrency(price, { maximumFractionDigits: 0 })}`
            : ''}
        </Txt>
      )}
    </View>
  );
}

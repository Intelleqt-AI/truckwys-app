import { memo, useId, useState } from 'react';
import { TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, G, Line, Pattern, Rect } from 'react-native-svg';
import { Icon, Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCurrencyCompact } from '@/lib/formatters';
import { niceStep, rand } from './scale';
import type { WaterfallStep } from './types';

// ── Waterfall: a bridge from one figure to the next ─────────────────────────
// `total` steps stand on zero; `delta` steps float from the running level, so
// "Revenue, less costs, leaves net margin" and "each month adds to the last" read
// as one shape. Accent is money in and profit, hatched neutral is money out
// (`tone: 'cost'`), red only for a loss. The web shows values on hover; a phone has
// none, so tapping a step selects it and the readout above the chart says what it
// holds. The last step (the total) is selected until the person taps.
const PAD_L = 44;
const PAD_T = 8;
const PAD_B = 22;
const GRID = 3;
const LABEL_MIN_BAND = 34;

function WaterfallImpl({
  steps,
  height = 220,
  values = 'none',
  note,
  caption,
  valueHeader = 'Change',
}: {
  steps: WaterfallStep[];
  height?: number;
  /** `all` prints each step's figure above its bar when there is room; the readout always has it. */
  values?: 'all' | 'none';
  /** A line under the chart (what was left out). */
  note?: string;
  /** Heading of the "Show as table" view. */
  caption?: string;
  /** Column heading for each step's own figure in that table. */
  valueHeader?: string;
}) {
  const { colors } = useTheme();
  const hatchId = `wf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [w, setW] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const n = steps.length;
  if (n === 0) return null;

  // Where each step starts and ends, and the running level after it.
  let run = 0;
  const bars = steps.map((s) => {
    const from = s.kind === 'total' ? 0 : run;
    const to = s.kind === 'total' ? s.value : run + s.value;
    run = to;
    return { from, to };
  });

  const lo = Math.min(0, ...bars.flatMap((b) => [b.from, b.to]));
  const hi = Math.max(0, ...bars.flatMap((b) => [b.from, b.to]));
  const step = hi - lo > 0 ? niceStep(hi - lo, GRID) : 1;
  const top = Math.ceil(hi / step - 1e-9) * step;
  const bottom = Math.floor(lo / step + 1e-9) * step;
  const span = top - bottom || step;
  const ticks: number[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) ticks.push(v);

  const plotH = height - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + ((top - v) / span) * plotH;
  const plotW = Math.max(60, w - PAD_L - 4);
  const band = plotW / n;
  const bw = Math.max(6, Math.min(40, band * 0.62));
  const labelEvery = band >= 30 ? 1 : 2;

  const sel = picked != null && picked < n ? picked : n - 1;
  const s = steps[sel]!;
  const sb = bars[sel]!;
  const sign = s.kind === 'delta' && s.value > 0 ? '+' : '';
  const figure = s.value === 0 && s.emptyText ? s.emptyText : `${sign}${rand(s.value)}`;

  const fill = (st: WaterfallStep, to: number) => {
    if (st.tone === 'cost') return `url(#${hatchId})`;
    if (st.kind === 'total') return to < 0 ? colors.danger : colors.accent;
    return st.value < 0 ? colors.danger : colors.accent;
  };

  return (
    <View>
      <View className="mb-1.5">
        <Mono className="text-micro text-faint">{s.full ?? s.label}</Mono>
        <Mono className="mt-0.5 text-caption font-semibold text-fg" numberOfLines={2}>
          {figure}
          {s.kind === 'delta' ? (
            <Mono className="text-caption font-normal text-muted">{` · running total ${rand(sb.to)}`}</Mono>
          ) : null}
        </Mono>
        {s.detail ? <Txt className="mt-0.5 text-caption text-muted">{s.detail}</Txt> : null}
      </View>

      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height }}>
        {w > 0 && (
          <>
            <Svg width={w} height={height}>
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

              {ticks.map((v) => (
                <Line
                  key={v}
                  x1={PAD_L}
                  x2={w}
                  y1={y(v)}
                  y2={y(v)}
                  stroke={v === 0 ? colors.chartAxis : colors.chartGrid}
                  strokeWidth={1}
                />
              ))}

              <Rect
                x={PAD_L + band * sel + 1}
                y={PAD_T}
                width={Math.max(0, band - 2)}
                height={plotH}
                rx={6}
                fill={colors.chartBar}
              />

              {steps.map((st, i) => {
                const b = bars[i]!;
                const next = bars[i + 1];
                const x = PAD_L + band * i + (band - bw) / 2;
                const yTop = y(Math.max(b.from, b.to));
                const h = Math.max(1.5, Math.abs(y(b.from) - y(b.to)));
                return (
                  <G key={`${st.label}-${i}`}>
                    <Rect
                      x={x}
                      y={yTop}
                      width={bw}
                      height={h}
                      rx={Math.min(3, bw / 2)}
                      fill={fill(st, b.to)}
                      opacity={st.kind === 'delta' && st.tone !== 'cost' ? 0.6 : 1}
                    />
                    {next ? (
                      <Line
                        x1={x + bw}
                        x2={PAD_L + band * (i + 1) + (band - bw) / 2}
                        y1={y(b.to)}
                        y2={y(b.to)}
                        stroke={colors.chartAxis}
                        strokeWidth={1}
                      />
                    ) : null}
                  </G>
                );
              })}
            </Svg>

            {ticks.map((v) => (
              <Mono
                key={v}
                className="absolute text-right text-micro text-faint"
                style={{ left: 0, width: PAD_L - 8, top: y(v) - 7 }}
                numberOfLines={1}
              >
                {v === 0 ? 'R 0' : formatCurrencyCompact(v)}
              </Mono>
            ))}

            {values === 'all' && band >= LABEL_MIN_BAND
              ? steps.map((st, i) => (
                  <Mono
                    key={`v-${st.label}-${i}`}
                    className="absolute text-center text-micro text-muted"
                    style={{
                      left: PAD_L + band * i - 6,
                      width: band + 12,
                      top: y(Math.max(bars[i]!.from, bars[i]!.to)) - 14,
                    }}
                    numberOfLines={1}
                  >
                    {formatCurrencyCompact(st.value)}
                  </Mono>
                ))
              : null}

            {/* x labels, counted back from the last so the total is always named */}
            {steps.map((st, i) =>
              (n - 1 - i) % labelEvery === 0 ? (
                <Mono
                  key={`x-${st.label}-${i}`}
                  className={`absolute text-center text-micro ${i === sel ? 'text-fg' : 'text-faint'}`}
                  style={{ left: PAD_L + band * i - 12, width: band + 24, top: height - PAD_B + 6 }}
                  numberOfLines={1}
                >
                  {st.label}
                </Mono>
              ) : null,
            )}

            {/* one tap target per step */}
            {steps.map((st, i) => (
              <TouchableOpacity
                key={`t-${st.label}-${i}`}
                onPress={() => setPicked(i)}
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityState={{ selected: i === sel }}
                accessibilityLabel={`${st.full ?? st.label}: ${st.value === 0 && st.emptyText ? st.emptyText : rand(st.value)}${
                  st.kind === 'delta' ? `, running total ${rand(bars[i]!.to)}` : ''
                }`}
                style={{ position: 'absolute', left: PAD_L + band * i, width: band, top: 0, height }}
              />
            ))}
          </>
        )}
      </View>

      {/* The web's "Show as table": every value as text, one tap away. */}
      <View className="mt-2 flex-row items-start justify-between gap-3">
        {note ? <Txt className="flex-1 text-caption text-faint">{note}</Txt> : <View className="flex-1" />}
        <TouchableOpacity
          onPress={() => setTableOpen((o) => !o)}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityState={{ expanded: tableOpen }}
          className="min-h-[28px] flex-row items-center gap-1"
        >
          <Mono className="text-caption font-medium text-link">{tableOpen ? 'Hide table' : 'Show as table'}</Mono>
          <Icon name={tableOpen ? 'chevronUp' : 'chevronDown'} size={12} color={colors.link} />
        </TouchableOpacity>
      </View>

      {tableOpen && (
        <View className="mt-2">
          {caption ? <Txt className="mb-1 text-caption text-muted">{caption}</Txt> : null}
          <View className="flex-row items-center gap-3 pb-1.5">
            <Txt className="flex-1 text-caption font-medium text-muted">Step</Txt>
            <Txt className="w-[88px] text-right text-caption font-medium text-muted">{valueHeader}</Txt>
            <Txt className="w-[88px] text-right text-caption font-medium text-muted">Running total</Txt>
          </View>
          {steps.map((st, i) => (
            <View
              key={`row-${st.label}-${i}`}
              className="flex-row items-center gap-3 border-t border-line-row py-2"
            >
              <Txt className="flex-1 text-sub font-medium text-fg" numberOfLines={1}>
                {st.full ?? st.label}
              </Txt>
              <Mono className="w-[88px] text-right text-sub text-fg" numberOfLines={1}>
                {st.kind === 'delta' && st.value > 0 ? '+' : ''}
                {rand(st.value)}
              </Mono>
              <Mono className="w-[88px] text-right text-sub text-fg" numberOfLines={1}>
                {rand(bars[i]!.to)}
              </Mono>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export const Waterfall = memo(WaterfallImpl);

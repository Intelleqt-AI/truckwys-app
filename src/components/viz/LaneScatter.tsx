import { useState } from 'react';
import { TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCurrency } from '@/lib/formatters';
import { plural } from '@/lib/ledger';
import { niceStep, rand } from './scale';
import type { LanePoint } from './types';

// ── LaneScatter: which routes pay best per kilometre ────────────────────────
// y is revenue per km, x is km per trip (shorter trips usually earn more per
// kilometre, so lanes of similar length are the fair comparison). Solid dots are
// lanes with enough trips to judge, hollow ones have too few. The dashed line is the
// fleet's average. A phone has no hover or room for names, so dots carry a number
// that keys to the list underneath; tapping either selects the lane.
const PAD_L = 44;
const PAD_R = 14;
const PAD_T = 12;
const PAD_B = 24;
const LIST_PREVIEW = 8;
const perKmText = (v: number) => `${formatCurrency(v, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}/km`;

export function LaneScatter({
  points,
  overallPerKm,
  minTrips,
  height = 280,
}: {
  points: LanePoint[];
  /** The fleet's revenue per km on the same basis; null when unknown. */
  overallPerKm: number | null;
  minTrips: number;
  height?: number;
}) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  // Judged lanes first, best first; the number a dot wears is its place here.
  const ordered = [...points].sort((a, b) => Number(a.thin) - Number(b.thin) || b.perKm - a.perKm);
  const judged = ordered.filter((p) => !p.thin);
  // The scale fits the judged lanes; a thin outlier far above is not allowed to flatten them.
  const fit = Math.max(...(judged.length ? judged : ordered).map((p) => p.perKm), overallPerKm ?? 0, 1);
  const yStep = niceStep(fit * 1.12, 3);
  const yTop = Math.ceil((fit * 1.12) / yStep - 1e-9) * yStep;
  const drawn = ordered.filter((p) => p.perKm <= yTop);
  const off = ordered.length - drawn.length;
  const xMax = Math.max(...drawn.map((p) => p.kmPerTrip), 1);
  const xStep = niceStep(xMax * 1.08, 3);
  const xTop = Math.ceil((xMax * 1.08) / xStep - 1e-9) * xStep;

  const plotW = Math.max(60, w - PAD_L - PAD_R);
  const plotH = height - PAD_T - PAD_B;
  const x = (v: number) => PAD_L + (v / xTop) * plotW;
  const y = (v: number) => PAD_T + plotH - (v / yTop) * plotH;
  const yTicks = Array.from({ length: Math.round(yTop / yStep) + 1 }, (_, i) => i * yStep);
  const xTicks = Array.from({ length: Math.round(xTop / xStep) + 1 }, (_, i) => i * xStep);

  const sel = ordered.find((p) => p.id === picked) ?? null;
  const selNo = sel ? ordered.indexOf(sel) + 1 : 0;
  const listed = all ? ordered : ordered.slice(0, LIST_PREVIEW);

  return (
    <View>
      <View className="mb-1.5 min-h-[40px]">
        {sel ? (
          <>
            <Mono className="text-micro text-faint" numberOfLines={1}>{`${selNo}. ${sel.label}`}</Mono>
            <Mono className="mt-0.5 text-caption text-muted" numberOfLines={2}>
              <Mono className="text-caption font-semibold text-fg">{perKmText(sel.perKm)}</Mono>
              {` · ${Math.round(sel.kmPerTrip)} km a trip · ${plural(sel.trips, 'trip')} · ${rand(sel.revenue)}`}
            </Mono>
          </>
        ) : (
          <Txt className="text-caption text-faint">Revenue per km, against km per trip. Tap a dot or a lane below.</Txt>
        )}
      </View>

      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height }}>
        {w > 0 && (
          <>
            <Svg width={w} height={height}>
              {yTicks.map((v) => (
                <Line
                  key={v}
                  x1={PAD_L}
                  x2={w - PAD_R}
                  y1={y(v)}
                  y2={y(v)}
                  stroke={v === 0 ? colors.chartAxis : colors.chartGrid}
                  strokeWidth={1}
                />
              ))}
              {overallPerKm != null && overallPerKm <= yTop ? (
                <Line
                  x1={PAD_L}
                  x2={w - PAD_R}
                  y1={y(overallPerKm)}
                  y2={y(overallPerKm)}
                  stroke={colors.accent}
                  strokeOpacity={0.8}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              ) : null}
              {drawn.map((p) =>
                p.thin ? (
                  <Circle
                    key={p.id}
                    cx={x(p.kmPerTrip)}
                    cy={y(p.perKm)}
                    r={5}
                    fill={colors.surface}
                    stroke={p.id === picked ? colors.fg : colors.muted}
                    strokeWidth={p.id === picked ? 2 : 1.5}
                  />
                ) : (
                  <Circle
                    key={p.id}
                    cx={x(p.kmPerTrip)}
                    cy={y(p.perKm)}
                    r={p.id === picked ? 8 : 6}
                    fill={colors.accent}
                    fillOpacity={picked && p.id !== picked ? 0.55 : 0.9}
                  />
                ),
              )}
            </Svg>

            {yTicks.map((v) => (
              <Mono
                key={`y${v}`}
                className="absolute text-right text-micro text-faint"
                style={{ left: 0, width: PAD_L - 8, top: y(v) - 7 }}
                numberOfLines={1}
              >
                {v === 0 ? 'R 0' : formatCurrency(v, { maximumFractionDigits: 0 })}
              </Mono>
            ))}
            {xTicks.map((v, i) => (
              <Mono
                key={`x${v}`}
                className="absolute text-center text-micro text-faint"
                style={{ left: x(v) - 24, width: 48, top: height - PAD_B + 6 }}
                numberOfLines={1}
              >
                {i === xTicks.length - 1 ? `${Math.round(v)} km` : `${Math.round(v)}`}
              </Mono>
            ))}
            {overallPerKm != null && overallPerKm <= yTop ? (
              <Mono
                className="absolute text-right text-micro text-accent"
                style={{ right: PAD_R, top: y(overallPerKm) - 15 }}
                numberOfLines={1}
              >
                {`Fleet ${perKmText(overallPerKm)}`}
              </Mono>
            ) : null}

            {drawn.map((p) =>
              p.thin ? null : (
                <Mono
                  key={`n${p.id}`}
                  className="absolute text-micro text-muted"
                  style={{ left: x(p.kmPerTrip) + 8, top: y(p.perKm) - 16 }}
                >
                  {ordered.indexOf(p) + 1}
                </Mono>
              ),
            )}

            {drawn.map((p) => (
              <TouchableOpacity
                key={`t${p.id}`}
                onPress={() => setPicked(p.id === picked ? null : p.id)}
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel={`${p.label}: ${perKmText(p.perKm)}, ${plural(p.trips, 'trip')}`}
                style={{ position: 'absolute', left: x(p.kmPerTrip) - 16, top: y(p.perKm) - 16, width: 32, height: 32 }}
              />
            ))}
          </>
        )}
      </View>

      <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
        <View className="flex-row items-center gap-1.5">
          <View className="h-[9px] w-[9px] rounded-full" style={{ backgroundColor: colors.accent, opacity: 0.9 }} />
          <Txt className="text-micro text-faint">{`${minTrips} or more trips`}</Txt>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-[9px] w-[9px] rounded-full border-[1.5px]" style={{ borderColor: colors.muted }} />
          <Txt className="text-micro text-faint">Fewer, too few to judge</Txt>
        </View>
      </View>
      {off > 0 ? (
        <Txt className="mt-1 text-caption text-faint">
          {`${plural(off, 'lane')} with few trips ${off === 1 ? 'is' : 'are'} above ${rand(yTop)}/km, off the chart; see the list.`}
        </Txt>
      ) : null}

      <View className="mt-3 overflow-hidden rounded-control border border-line-row">
        {listed.map((p, i) => {
          const no = ordered.indexOf(p) + 1;
          const on = p.id === picked;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => setPicked(on ? null : p.id)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              className={`min-h-[48px] flex-row items-center gap-3 px-3 py-2 ${
                i === listed.length - 1 && ordered.length <= LIST_PREVIEW ? '' : 'border-b border-line-row'
              } ${on ? 'bg-surface-hover' : ''}`}
            >
              <Mono className="w-5 text-caption text-faint">{p.thin ? '–' : no}</Mono>
              <View className="flex-1">
                <Txt className="text-sub text-fg" numberOfLines={1}>
                  {p.label}
                </Txt>
                <Txt className="mt-0.5 text-caption text-faint" numberOfLines={1}>
                  {`${plural(p.trips, 'trip')} · ${Math.round(p.kmPerTrip)} km a trip${p.thin ? ' · too few to judge' : ''}`}
                </Txt>
              </View>
              <Mono className="text-sub text-fg">{perKmText(p.perKm)}</Mono>
            </TouchableOpacity>
          );
        })}
        {ordered.length > LIST_PREVIEW ? (
          <TouchableOpacity
            onPress={() => setAll((a) => !a)}
            activeOpacity={0.6}
            accessibilityRole="button"
            className="min-h-[44px] items-center justify-center"
          >
            <Mono className="text-caption font-medium text-link">
              {all ? 'Show fewer' : `Show all ${ordered.length}`}
            </Mono>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

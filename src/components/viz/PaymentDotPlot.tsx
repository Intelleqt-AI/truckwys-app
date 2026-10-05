import { useState } from 'react';
import { TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { Mono, Txt } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { plural } from '@/lib/ledger';
import { rand } from './scale';
import type { PayRow } from './types';

// ── PaymentDotPlot: how each customer pays ──────────────────────────────────
// One row per customer, every row on the same axis of days against the due date:
// 0 is the due date, left is early, right is late. Each dot is a paid invoice,
// sized by its amount and coloured by whether it was on time. The short bar is
// the customer's usual (median) day. The axis stops at 90 days; anything later
// stacks in the "90+" strip at the right so one extreme invoice cannot squash
// everyone else. Customers with fewer than 3 paid invoices are drawn hollow.
// Tap a row to see its invoices.
const TRACK_H = 30;
const PAD_X = 8;
const EARLY = 30; // days shown before the due date
const LATE = 90; // days shown after it; later ones go in the overflow strip
const OVER_W = 28;
const LANES = [0, -7, 7]; // vertical offsets, so neighbouring dots do not sit on each other
const R_MIN = 3;
const R_MAX = 7;
const TICKS = [-30, 0, 30, 60];

const dayWords = (n: number) => (n === 0 ? 'on the due date' : n > 0 ? `${plural(n, 'day')} late` : `${plural(-n, 'day')} early`);

export function PaymentDotPlot({
  rows,
  maxRows = 10,
  onOpenInvoice,
}: {
  rows: PayRow[];
  maxRows?: number;
  onOpenInvoice?: (id: string) => void;
}) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const shown = all ? rows : rows.slice(0, maxRows);
  const maxAmount = Math.max(1, ...shown.flatMap((r) => r.marks.map((m) => m.amount)));
  const mainW = Math.max(1, w - PAD_X * 2 - OVER_W);
  const x = (d: number) => PAD_X + ((Math.min(LATE, Math.max(-EARLY, d)) + EARLY) / (EARLY + LATE)) * mainW;
  const xOver = PAD_X + mainW + OVER_W / 2 + 2;
  const markX = (d: number) => (d > LATE ? xOver : x(d));
  const radius = (amount: number) => R_MIN + (R_MAX - R_MIN) * Math.sqrt(Math.max(0, amount) / maxAmount);
  const mid = TRACK_H / 2;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <View style={{ height: 16 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {TICKS.map((t) => (
            <Mono
              key={t}
              className="absolute text-micro text-faint"
              style={{ left: x(t) - 20, width: 40, textAlign: 'center' }}
            >
              {t === 0 ? 'Due' : t < 0 ? `${-t} early` : `+${t}`}
            </Mono>
          ))}
          <Mono
            className="absolute text-micro text-faint"
            style={{ left: PAD_X + mainW, width: OVER_W + 4, textAlign: 'center' }}
          >
            90+
          </Mono>
        </View>
      ) : null}

      {w > 0 &&
        shown.map((r, idx) => {
          const isOpen = open === r.id;
          const usually = r.thin
            ? plural(r.marks.length, 'invoice')
            : r.median > 0
              ? `usually ${plural(r.median, 'day')} late`
              : 'usually on time';
          const summary = `${r.label}: ${plural(r.marks.length, 'paid invoice')}, ${
            r.thin ? 'too few to call a habit' : usually
          }`;
          const ordered = [...r.marks].sort((a, b) => a.late - b.late);
          const overflow = r.marks.filter((m) => m.late > LATE).length;
          return (
            <TouchableOpacity
              key={r.id}
              onPress={() => setOpen(isOpen ? null : r.id)}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={summary}
              className={`py-2 ${idx === shown.length - 1 && rows.length <= maxRows ? '' : 'border-b border-line-row'}`}
            >
              <View className="mb-0.5 flex-row items-baseline justify-between gap-3 px-2">
                <Txt className="flex-1 text-callout font-medium text-fg" numberOfLines={1}>
                  {r.label}
                </Txt>
                <Mono
                  className="text-caption"
                  style={{ color: !r.thin && r.median > 0 ? colors.warning : colors.muted }}
                >
                  {usually}
                </Mono>
              </View>

              <Svg width={w} height={TRACK_H}>
                {TICKS.map((t) => (
                  <Line
                    key={t}
                    x1={x(t)}
                    x2={x(t)}
                    y1={0}
                    y2={TRACK_H}
                    stroke={t === 0 ? colors.chartAxis : colors.chartGrid}
                    strokeWidth={1}
                  />
                ))}
                <Line x1={PAD_X + mainW} x2={PAD_X + mainW} y1={0} y2={TRACK_H} stroke={colors.chartGrid} strokeWidth={1} />
                {ordered.map((m, i) => {
                  const late = m.late > 0;
                  const color = late ? colors.warning : colors.accent;
                  const common = { cx: markX(m.late), cy: mid + (LANES[i % LANES.length] ?? 0), r: radius(m.amount) };
                  return r.thin ? (
                    <Circle key={m.id} {...common} fill="none" stroke={color} strokeWidth={1.5} />
                  ) : (
                    <Circle key={m.id} {...common} fill={color} fillOpacity={0.55} />
                  );
                })}
                {r.thin ? null : (
                  <Line
                    x1={x(r.median)}
                    x2={x(r.median)}
                    y1={mid - 11}
                    y2={mid + 11}
                    stroke={colors.fg}
                    strokeOpacity={0.85}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                )}
              </Svg>

              {isOpen ? (
                <View className="mt-1.5 px-2">
                  {overflow > 0 ? (
                    <Txt className="pb-1 text-caption text-faint">
                      {`${plural(overflow, 'invoice')} paid more than ${LATE} days late, in the 90+ strip.`}
                    </Txt>
                  ) : null}
                  {[...r.marks]
                    .sort((a, b) => b.late - a.late)
                    .map((m) => (
                      <TouchableOpacity
                        key={m.id}
                        disabled={!onOpenInvoice}
                        onPress={() => onOpenInvoice?.(m.id)}
                        activeOpacity={0.6}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${m.ref}`}
                        className="min-h-[36px] flex-row items-center justify-between gap-3 py-1"
                      >
                        <Txt className="flex-1 text-caption text-muted" numberOfLines={1}>
                          {`${m.ref} · paid ${dayWords(m.late)}`}
                        </Txt>
                        <Mono className="text-caption text-fg">{rand(m.amount)}</Mono>
                      </TouchableOpacity>
                    ))}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}

      {rows.length > maxRows ? (
        <TouchableOpacity
          onPress={() => setAll((a) => !a)}
          activeOpacity={0.6}
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center"
        >
          <Mono className="text-caption font-medium text-link">
            {all ? `Show top ${maxRows}` : `Show all ${rows.length} customers`}
          </Mono>
        </TouchableOpacity>
      ) : null}

      <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1 px-2">
        <View className="flex-row items-center gap-1.5">
          <View className="h-[8px] w-[8px] rounded-full" style={{ backgroundColor: colors.accent, opacity: 0.7 }} />
          <Txt className="text-micro text-faint">On time</Txt>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-[8px] w-[8px] rounded-full" style={{ backgroundColor: colors.warning, opacity: 0.7 }} />
          <Txt className="text-micro text-faint">Paid late</Txt>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-[10px] w-[2px] rounded-full" style={{ backgroundColor: colors.fg }} />
          <Txt className="text-micro text-faint">Usual day</Txt>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-[8px] w-[8px] rounded-full border" style={{ borderColor: colors.muted }} />
          <Txt className="text-micro text-faint">Under 3 invoices</Txt>
        </View>
        <Txt className="text-micro text-faint">Bigger dot, bigger invoice</Txt>
      </View>
    </View>
  );
}

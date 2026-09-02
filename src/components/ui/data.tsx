import { Fragment, useEffect, type ReactNode } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Txt, Mono, Label } from './Text';
import { Card } from './primitives';
import { Icon, type IconName } from './icons';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues, motion } from '@/theme/tokens';

// ── StatCard / KPI tile: mono caps label + big mono value + delta ──────────
/**
 * The root `Card` is `flex-1` (`flex: 1 1 0%`), so this MUST sit directly
 * inside a `flex-row` parent — that's where `flexBasis: 0` means "equal
 * widths, height auto", which is what every stat grid wants.
 *
 * A fixed-width `<View style={{ width: '48%' }}>` column wrapper breaks this:
 * it's column-direction with `height: auto`, so the `flexBasis: 0` lands on
 * the vertical axis instead. CSS would clamp that back up via
 * `min-height: auto`, but Yoga has no such clamp, so the tile collapses to
 * its padding and the label/value render outside the box. Give the wrapper
 * `className="flex-row"` alongside its fixed width to keep flex-1 meaning
 * "fill this width" rather than "collapse this height".
 */
export function StatCard({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  sub,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
  sub?: string;
}) {
  const deltaColor =
    deltaTone === 'up' ? statusHues.success : deltaTone === 'down' ? statusHues.danger : undefined;
  return (
    <Card className="flex-1 p-4">
      <Label className="text-faint">{label}</Label>
      <Mono className="mt-2 text-fg tracking-display" style={{ fontSize: 24, fontWeight: '600' }}>
        {value}
      </Mono>
      <View className="mt-1 flex-row items-center gap-2">
        {delta && (
          <Mono className="text-micro" style={deltaColor ? { color: deltaColor } : undefined}>
            {delta}
          </Mono>
        )}
        {sub && <Mono className="text-micro text-faint">{sub}</Mono>}
      </View>
    </Card>
  );
}

// ── ListRow: pressable row (leading icon/avatar · title/sub · trailing) ────
export function ListRow({
  title,
  subtitle,
  subtitleIcon,
  leading,
  trailing,
  onPress,
  last,
}: {
  title: string;
  subtitle?: string;
  subtitleIcon?: IconName;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className={`min-h-[56px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-hover ${
        last ? '' : 'border-b border-line-row'
      }`}
    >
      {leading}
      <View className="flex-1">
        <Txt className="text-body text-fg" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle && (
          <View className="mt-0.5 flex-row items-center gap-1.5">
            {subtitleIcon && <Icon name={subtitleIcon} size={14} color={colors.faint} />}
            <Txt className="flex-1 text-caption text-muted" numberOfLines={1}>
              {subtitle}
            </Txt>
          </View>
        )}
      </View>
      {trailing ?? (onPress && <Icon name="chevronRight" size={16} color={colors.faint} />)}
    </Pressable>
  );
}

// ── Group: labelled card container (rows stacked, dividers inside) ─────────
export function Group({
  label,
  action,
  onAction,
  children,
  className = '',
}: {
  label?: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
  className?: string;
}) {
  const { colors } = useTheme();
  return (
    <View className={`mb-5 ${className}`}>
      {label && (
        <View className="mb-2.5 flex-row items-center justify-between">
          <Label>{label}</Label>
          {action && (
            <Pressable
              hitSlop={8}
              onPress={onAction}
              accessibilityRole="button"
              className="flex-row items-center gap-0.5"
            >
              <Mono className="text-micro tracking-label uppercase text-accent">{action}</Mono>
              <Icon name="chevronRight" size={12} color={colors.accent} />
            </Pressable>
          )}
        </View>
      )}
      <Card className="overflow-hidden">{children}</Card>
    </View>
  );
}

// ── DetailRow: read-only key/value ─────────────────────────────────────────
/**
 * The value is the row's reason for existing — an amount, a date, a count — so
 * the LABEL is what yields when the row runs out of width. This used to be the
 * other way round (`shrink-0` label, `flex-1` value carrying the tail ellipsis),
 * which meant an unbounded label ate the number: the quote breakdown's
 * `Base rate (Superlink 34t · R 25,00/km)` left ~31pt of a ~297pt row, so its
 * amount rendered as `R 1…` at default text size.
 *
 * Two things keep the inversion honest:
 *
 * - The label block is `shrink`, NOT `flex-1`. `flex-1` sets `flex-basis: 0%`,
 *   which zeroes a child's shrink weight — it would be unshrinkable again, just
 *   in the other direction. The basis has to stay `auto`.
 * - The value keeps a `max-w-[62%]` cap, because plenty of callers are the
 *   mirror case: a short label and a long value (CustomerDetailScreen's Email,
 *   Address, Billing address). Uncapped, `shrink-0` would push those past the
 *   row and Group's `overflow-hidden` Card would slice them with no ellipsis.
 *   ~184pt at that cap is about double the widest realistic ZAR amount, so a
 *   number never reaches it and prose still truncates the way it always did.
 *
 * `hint` is the escape hatch for a label that carries its own arithmetic: put
 * the words in `label` and the maths on the second line, rather than
 * concatenating them into one string the row can't fit.
 */
export function DetailRow({
  label,
  hint,
  value,
  mono = true,
  valueColor,
  boldValue,
  last,
}: {
  label: string;
  /** Second line under the label — a rate basis, a reference, a breakdown. */
  hint?: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
  /** Bumps the value from font-medium to font-semibold, e.g. for a price. */
  boldValue?: boolean;
  last?: boolean;
}) {
  const ValueCmp = mono ? Mono : Txt;
  return (
    <View
      className={`flex-row items-center justify-between gap-4 px-3.5 py-3 ${
        last ? '' : 'border-b border-line-row'
      }`}
    >
      <View className="shrink">
        <Txt className="text-callout text-muted" numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Txt>
        {hint && (
          <Txt className="mt-0.5 text-micro text-faint" numberOfLines={1} ellipsizeMode="tail">
            {hint}
          </Txt>
        )}
      </View>
      <ValueCmp
        numberOfLines={1}
        ellipsizeMode="tail"
        className={`max-w-[62%] shrink-0 text-right text-sub text-fg ${boldValue ? 'font-semibold' : 'font-medium'}`}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </ValueCmp>
    </View>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────
export function EmptyState({
  icon = 'box',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="items-center px-8 py-16">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-sm border border-line bg-surface">
        <Icon name={icon} size={24} color={colors.faint} />
      </View>
      <Txt className="text-heading font-semibold text-fg">{title}</Txt>
      {body && <Txt className="mt-1.5 text-center text-callout text-muted">{body}</Txt>}
      {action && <View className="mt-5">{action}</View>}
    </View>
  );
}

// ── Timeline: vertical status steps (done / current / upcoming) ────────────
export type TimelineStep = {
  label: string;
  time?: string;
  /** Prose second line instead of a mono timestamp — a driver name, an invoice number. */
  meta?: string;
  done?: boolean;
  /** The in-progress step: a ring instead of a fill, plus a pulsing halo. */
  current?: boolean;
  color?: string;
};

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View>
      {steps.map((s, i) => (
        <TimelineRow key={`${s.label}-${i}`} step={s} last={i === steps.length - 1} />
      ))}
    </View>
  );
}

function TimelineRow({ step: s, last }: { step: TimelineStep; last: boolean }) {
  const { colors } = useTheme();
  const color = s.color ?? statusHues.success;
  const ringColor = s.done || s.current ? color : colors.faint;

  // The one allowed loop (see LiveDot) — scales a halo ring behind the marker
  // while this step is the current one, then stops as soon as it isn't.
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!s.current) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })),
      -1,
      false,
    );
  }, [pulse, s.current]);
  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.7 }],
    opacity: (1 - pulse.value) * 0.6,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: withTiming(ringColor, { duration: motion.smooth }),
  }));

  return (
    <View className="flex-row gap-3.5" style={{ minHeight: last ? 28 : 44 }}>
      <View className="items-center">
        <View className="items-center justify-center" style={{ width: 22, height: 22 }}>
          {s.current && (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  width: 22,
                  height: 22,
                  borderRadius: 22,
                  backgroundColor: colors.pulse,
                },
                halo,
              ]}
            />
          )}
          <Animated.View
            className="items-center justify-center"
            style={[
              {
                width: 22,
                height: 22,
                borderRadius: 22,
                borderWidth: 2,
                backgroundColor: s.done ? color : 'transparent',
              },
              ringStyle,
            ]}
          >
            {s.done && <Icon name="check" size={12} color={colors.bgDeep} strokeWidth={3} />}
          </Animated.View>
        </View>
        {!last &&
          (s.done ? (
            <View className="flex-1" style={{ width: 2, marginTop: 2, backgroundColor: color }} />
          ) : (
            <View
              className="flex-1"
              style={{
                width: 0,
                marginTop: 2,
                borderLeftWidth: 2,
                borderStyle: 'dashed',
                borderColor: colors.line,
              }}
            />
          ))}
      </View>
      <View className="flex-1" style={{ paddingBottom: last ? 0 : 10 }}>
        <View className="flex-row items-center justify-between gap-2">
          <Txt
            className={`text-callout ${
              s.current ? 'font-semibold text-fg' : s.done ? 'font-medium text-fg' : 'text-muted'
            }`}
          >
            {s.label}
          </Txt>
          {s.current && (
            <Mono className="text-nano uppercase tracking-label" style={{ color }}>
              Current
            </Mono>
          )}
        </View>
        {s.time && <Mono className="mt-0.5 text-micro text-faint">{s.time}</Mono>}
        {s.meta && <Txt className="mt-0.5 text-micro text-muted">{s.meta}</Txt>}
      </View>
    </View>
  );
}

// ── RoutePreview: schematic origin → destination strip (never a real map) ──
// Rail geometry, derived from the type scale rather than guessed: the label line
// box (text-micro's 14px lineHeight, kept even though fontSize is overridden to
// 9) and the address line beneath it (text-callout's 20px + the 2px mt-0.5).
const RAIL_LABEL_H = 14;
const RAIL_ADDRESS_H = 22;
const MARKER_COL = 16;
// Every block after the first (each stop, and Drop-off) opens with mt-5 (20px)
// before its own label box. So the dashed run between any two consecutive
// marker boxes is always exactly "the rest of the previous block's address
// line, then the next block's top margin" — a fixed height, not something to
// flex-grow into. Using flex here previously required the connector's own
// parent to have a resolved height, which broke as soon as a stop's dot+line
// pair was wrapped in its own View (its height went auto instead of stretched,
// so the connector collapsed to its 12px minHeight and every stop bunched up
// near the top of the rail while its address text sat far below it).
const CONNECTOR_H = RAIL_ADDRESS_H + 20;

export function RoutePreview({
  origin,
  dest,
  stops,
  distance,
  duration,
  loading,
}: {
  origin: string;
  dest: string;
  /** Intermediate stops, in visit order, between origin and dest. */
  stops?: string[];
  distance?: string;
  duration?: string;
  /** A recalculation is in flight — shown as a small spinner over whatever
      distance/duration is still on screen, so stale numbers don't read as final. */
  loading?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Card className="overflow-hidden p-4">
      {loading && (
        <View className="absolute right-3 top-3">
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      )}
      <View className="flex-row gap-3">
        {/* Marker rail. Each marker sits in a box exactly the height of the
            label line box it belongs to, so it centres on that label whatever
            the text scale does — the dot on "Pickup", the pin on "Drop-off",
            a numbered dot per stop. Every gap between markers is CONNECTOR_H,
            a fixed height rather than flex-grow (see its definition), and the
            trailing spacer accounts for the address line under Drop-off. This
            used to be a hardcoded 4px-pad / 10 / 34 / 16 pixel stack with no
            relationship to the text, which left the dot 2px low and the pin
            7px out. */}
        <View className="items-center" style={{ width: MARKER_COL }}>
          <View style={{ height: RAIL_LABEL_H }} className="justify-center">
            <View
              style={{ width: 10, height: 10, borderRadius: 10, backgroundColor: colors.accent }}
            />
          </View>
          {(stops ?? []).map((_, i) => (
            <Fragment key={i}>
              <View
                style={{
                  width: 0,
                  height: CONNECTOR_H,
                  borderLeftWidth: 2,
                  borderStyle: 'dashed',
                  borderColor: colors.lineActive,
                }}
              />
              <View style={{ height: RAIL_LABEL_H }} className="justify-center">
                <View
                  className="items-center justify-center"
                  style={{ width: 14, height: 14, borderRadius: 14, backgroundColor: statusHues.info }}
                >
                  <Mono style={{ fontSize: 8, fontWeight: '700', color: '#fff' }}>{i + 1}</Mono>
                </View>
              </View>
            </Fragment>
          ))}
          <View
            style={{
              width: 0,
              height: CONNECTOR_H,
              borderLeftWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.lineActive,
            }}
          />
          <View style={{ height: RAIL_LABEL_H }} className="justify-center">
            <Icon name="pin" size={16} color={statusHues.success} />
          </View>
          <View style={{ height: RAIL_ADDRESS_H }} />
        </View>
        <View className="flex-1">
          <View>
            <Label className="text-faint" style={{ fontSize: 9, lineHeight: RAIL_LABEL_H }}>
              Pickup
            </Label>
            <Txt className="mt-0.5 text-callout font-medium text-fg" numberOfLines={1}>
              {origin}
            </Txt>
          </View>
          {(stops ?? []).map((s, i) => (
            <View key={i} className="mt-5">
              <Label className="text-faint" style={{ fontSize: 9, lineHeight: RAIL_LABEL_H }}>
                Stop {i + 1}
              </Label>
              <Txt className="mt-0.5 text-callout font-medium text-fg" numberOfLines={1}>
                {s}
              </Txt>
            </View>
          ))}
          <View className="mt-5">
            <Label className="text-faint" style={{ fontSize: 9, lineHeight: RAIL_LABEL_H }}>
              Drop-off
            </Label>
            <Txt className="mt-0.5 text-callout font-medium text-fg" numberOfLines={1}>
              {dest}
            </Txt>
          </View>
        </View>
      </View>
      {(distance || duration) && (
        <View className="mt-4 flex-row gap-5 border-t border-line pt-3.5">
          {distance && <Meta icon="route" label={distance} />}
          {duration && <Meta icon="clock" label={duration} />}
        </View>
      )}
    </Card>
  );
}

function Meta({ icon, label }: { icon: IconName; label: string }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name={icon} size={15} color={colors.faint} />
      <Mono className="text-caption text-muted">{label}</Mono>
    </View>
  );
}

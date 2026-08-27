import { Fragment, type ReactNode } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Txt, Mono, Label } from './Text';
import { Card } from './primitives';
import { Icon, type IconName } from './icons';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';

// ── StatCard / KPI tile: mono caps label + big mono value + delta ──────────
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
  leading,
  trailing,
  onPress,
  last,
}: {
  title: string;
  subtitle?: string;
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
          <Txt className="mt-0.5 text-caption text-muted" numberOfLines={1}>
            {subtitle}
          </Txt>
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
  return (
    <View className={`mb-5 ${className}`}>
      {label && (
        <View className="mb-2.5 flex-row items-center justify-between">
          <Label>{label}</Label>
          {action && (
            <Pressable hitSlop={8} onPress={onAction} accessibilityRole="button">
              <Mono className="text-micro tracking-label uppercase text-accent">{action}</Mono>
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

// ── Timeline: vertical status steps ────────────────────────────────────────
export function Timeline({
  steps,
}: {
  steps: { label: string; time?: string; done?: boolean; color?: string }[];
}) {
  const { colors } = useTheme();
  return (
    <View>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const color = s.done ? (s.color ?? statusHues.success) : colors.faint;
        return (
          <View key={`${s.label}-${i}`} className="flex-row gap-3.5" style={{ minHeight: last ? 32 : 56 }}>
            <View className="items-center">
              <View
                className="items-center justify-center"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 22,
                  borderWidth: 2,
                  borderColor: color,
                  backgroundColor: s.done ? color : 'transparent',
                }}
              >
                {s.done && <Icon name="check" size={12} color={colors.bgDeep} strokeWidth={3} />}
              </View>
              {!last && (
                <View
                  className="flex-1"
                  style={{ width: 2, marginTop: 2, backgroundColor: s.done ? color : colors.line }}
                />
              )}
            </View>
            <View className="flex-1" style={{ paddingBottom: last ? 0 : 12 }}>
              <Txt className={`text-callout font-medium ${s.done ? 'text-fg' : 'text-muted'}`}>
                {s.label}
              </Txt>
              {s.time && <Mono className="mt-0.5 text-micro text-faint">{s.time}</Mono>}
            </View>
          </View>
        );
      })}
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

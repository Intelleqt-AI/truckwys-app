import { type ReactNode } from 'react';
import { View, Pressable } from 'react-native';
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
export function DetailRow({
  label,
  value,
  mono = true,
  valueColor,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
  last?: boolean;
}) {
  const ValueCmp = mono ? Mono : Txt;
  return (
    <View
      className={`flex-row items-center justify-between gap-4 px-3.5 py-3 ${
        last ? '' : 'border-b border-line-row'
      }`}
    >
      <Txt className="shrink-0 text-callout text-muted">{label}</Txt>
      <ValueCmp
        numberOfLines={1}
        ellipsizeMode="tail"
        className="flex-1 text-right text-sub font-medium text-fg"
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
export function RoutePreview({
  origin,
  dest,
  distance,
  duration,
}: {
  origin: string;
  dest: string;
  distance?: string;
  duration?: string;
}) {
  const { colors } = useTheme();
  return (
    <Card className="overflow-hidden p-4">
      <View className="flex-row gap-3">
        <View className="items-center pt-1">
          <View
            style={{ width: 10, height: 10, borderRadius: 10, backgroundColor: colors.accent }}
          />
          <View
            style={{
              width: 0,
              height: 34,
              borderLeftWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.lineActive,
            }}
          />
          <Icon name="pin" size={16} color={statusHues.success} />
        </View>
        <View className="flex-1">
          <View>
            <Label className="text-faint" style={{ fontSize: 9 }}>
              Pickup
            </Label>
            <Txt className="mt-0.5 text-callout font-medium text-fg" numberOfLines={1}>
              {origin}
            </Txt>
          </View>
          <View className="mt-5">
            <Label className="text-faint" style={{ fontSize: 9 }}>
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

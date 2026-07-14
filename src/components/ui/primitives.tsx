import { useEffect } from 'react';
import {
  View,
  Pressable,
  ActivityIndicator,
  type ViewProps,
  type PressableProps,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { Mono, Label } from './Text';
import { Icon, type IconName } from './icons';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';

// ── Card: surface fill, hairline border, 2px radius, no shadow (dark) ──────
export function Card({
  className = '',
  ...props
}: ViewProps & { className?: string }) {
  return (
    <View
      className={`rounded-xs border border-line bg-surface ${className}`}
      {...props}
    />
  );
}

// ── Button: primary / secondary / ghost / danger, uppercase mono label ─────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  fullWidth,
  className = '',
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const base =
    'flex-row items-center justify-center gap-2 rounded-xs px-4 min-h-[48px]';
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-accent',
    secondary: 'bg-surface border border-line-active',
    ghost: 'bg-transparent',
    danger: 'bg-danger-bg border border-danger',
  };
  const textColor: Record<ButtonVariant, string> = {
    primary: 'text-on-accent',
    secondary: 'text-fg',
    ghost: 'text-accent',
    danger: 'text-danger',
  };
  const iconColor =
    variant === 'primary'
      ? colors.onAccent
      : variant === 'danger'
        ? statusHues.danger
        : variant === 'secondary'
          ? colors.fg
          : colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className={`${base} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${
        disabled ? 'opacity-40' : ''
      } active:opacity-90 ${className}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <>
          {icon && <Icon name={icon} size={17} color={iconColor} strokeWidth={2.2} />}
          <Mono className={`text-micro tracking-wide uppercase ${textColor[variant]}`}>
            {label}
          </Mono>
        </>
      )}
    </Pressable>
  );
}

// ── IconButton: 44px tap target, ghost by default ──────────────────────────
export function IconButton({
  name,
  onPress,
  color,
  size = 22,
  accessibilityLabel,
  className = '',
}: {
  name: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  accessibilityLabel: string;
  className?: string;
} & Pick<PressableProps, 'onPress'>) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center rounded-xs active:opacity-70 ${className}`}
    >
      <Icon name={name} size={size} color={color ?? colors.muted} />
    </Pressable>
  );
}

// ── Badge: small mono chip ─────────────────────────────────────────────────
export function Badge({
  label,
  className = '',
  textClassName = '',
}: {
  label: string;
  className?: string;
  textClassName?: string;
}) {
  return (
    <View className={`self-start rounded-xs px-1.5 py-0.5 ${className}`}>
      <Mono className={`text-nano tracking-label uppercase ${textClassName}`}>{label}</Mono>
    </View>
  );
}

// ── Avatar: circle initials or accent-dim fill ─────────────────────────────
export function Avatar({ name, size = 36 }: { name?: string; size?: number }) {
  const initials = (name ?? '')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View
      className="items-center justify-center rounded-pill bg-accent-dim"
      style={{ width: size, height: size }}
    >
      <Mono className="text-accent" style={{ fontSize: size * 0.36 }}>
        {initials || '—'}
      </Mono>
    </View>
  );
}

// ── LiveDot: infinite 2s pulse (the one allowed loop) ──────────────────────
export function LiveDot({ label }: { label?: string }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.6);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(withTiming(1.8, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(withTiming(0, { duration: 1000 }), withTiming(0.6, { duration: 1000 })),
      -1,
      false,
    );
  }, [opacity, scale]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2 w-2 items-center justify-center">
        <Animated.View
          style={[{ position: 'absolute', width: 8, height: 8, borderRadius: 8, backgroundColor: colors.accent }, ring]}
        />
        <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: colors.accent }} />
      </View>
      {label && <Label className="text-accent">{label}</Label>}
    </View>
  );
}

// ── Status vocabulary → tone ───────────────────────────────────────────────
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_BY_STATUS: Record<string, Tone> = {
  // loads
  pending: 'warning',
  assigned: 'info',
  in_transit: 'info',
  intransit: 'info',
  delivered: 'success',
  invoiced: 'success',
  completed: 'success',
  cancelled: 'danger',
  // quotes
  draft: 'neutral',
  sent: 'warning',
  viewed: 'info',
  accepted: 'success',
  approved: 'success',
  rejected: 'danger',
  expired: 'danger',
  lost: 'danger',
  won: 'success',
  // vehicles
  available: 'success',
  in_use: 'info',
  maintenance: 'warning',
  inactive: 'neutral',
  // invoices
  paid: 'success',
  overdue: 'danger',
  unpaid: 'warning',
  partial: 'warning',
};

export const toneForStatus = (status?: string): Tone =>
  TONE_BY_STATUS[(status ?? '').toLowerCase().replace(/[\s-]/g, '_')] ?? 'neutral';

const TONE_CLASSES: Record<Tone, { bg: string; text: string }> = {
  success: { bg: 'bg-success-bg', text: 'text-success' },
  warning: { bg: 'bg-warning-bg', text: 'text-warning' },
  danger: { bg: 'bg-danger-bg', text: 'text-danger' },
  info: { bg: 'bg-info-bg', text: 'text-info' },
  neutral: { bg: 'bg-neutral-bg', text: 'text-muted' },
};

// ── StatusPill ─────────────────────────────────────────────────────────────
export function StatusPill({ status, label }: { status?: string; label?: string }) {
  const tone = toneForStatus(status);
  const c = TONE_CLASSES[tone];
  const text = (label ?? status ?? '').replace(/_/g, ' ');
  return <Badge label={text} className={c.bg} textClassName={c.text} />;
}

// ── PipelineBadge: distinct hue per quote stage ────────────────────────────
const STAGE_HUE: Record<string, string> = {
  draft: '#888888',
  sent: '#F59E0B',
  accepted: '#22C55E',
  in_transit: '#4D9EFF',
  transit: '#4D9EFF',
  completed: '#14B8A6',
};
export function PipelineBadge({ stage }: { stage: string }) {
  const key = stage.toLowerCase().replace(/[\s-]/g, '_');
  const hue = STAGE_HUE[key] ?? '#888888';
  return (
    <View className="flex-row items-center gap-1.5 self-start">
      <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: hue }} />
      <Mono className="text-micro tracking-label uppercase" style={{ color: hue }}>
        {stage.replace(/_/g, ' ')}
      </Mono>
    </View>
  );
}

// ── ConfidenceTag: high/medium/low from a 0..1 score ───────────────────────
export function ConfidenceTag({ value }: { value: number }) {
  const level = value >= 0.8 ? 'high' : value >= 0.6 ? 'medium' : 'low';
  const hue =
    level === 'high' ? statusHues.success : level === 'medium' ? statusHues.warning : statusHues.danger;
  return (
    <View className="flex-row items-center gap-1">
      <Icon name="gauge" size={12} color={hue} strokeWidth={2} />
      <Mono className="text-micro" style={{ color: hue }}>
        {Math.round(value * 100)}%
      </Mono>
    </View>
  );
}

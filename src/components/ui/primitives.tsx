import { useEffect } from 'react';
import {
  View,
  Pressable,
  ActivityIndicator,
  type ViewProps,
  type PressableProps,
} from 'react-native';
import { Image } from 'expo-image';
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
import { formatConfidence } from '@/lib/formatters';

// ── Card: surface fill, hairline border, 2px radius, no shadow (dark) ──────
export function Card({ className = '', ...props }: ViewProps & { className?: string }) {
  return <View className={`rounded-xs border border-line bg-surface ${className}`} {...props} />;
}

// ── Button: primary / secondary / ghost / danger, uppercase mono label ─────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'sm';
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  fullWidth,
  className = '',
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /**
   * `sm` is for inline affordances sitting beside a field or a section heading,
   * where the 48px primary height would dominate the row. Still a real button
   * with a border and a background — a bare tappable label reads as static text,
   * which is exactly how the map and fuel actions were being missed.
   */
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
}) {
  const { colors } = useTheme();
  const base =
    size === 'sm'
      ? 'flex-row items-center justify-center gap-1.5 rounded-xs px-2.5 min-h-[32px]'
      : 'flex-row items-center justify-center gap-2 rounded-xs px-4 min-h-[48px]';
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
          {icon && (
            <Icon name={icon} size={size === 'sm' ? 14 : 17} color={iconColor} strokeWidth={2.2} />
          )}
          <Mono
            numberOfLines={1}
            className={`${size === 'sm' ? 'text-nano' : 'text-micro'} uppercase tracking-wide ${textColor[variant]}`}
          >
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

// ── Badge: status token — square 2px chip, 1px tone border, tinted bg, dot ──
// Matches the design system Badge (components/core/Badge.jsx).
export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export function Badge({
  label,
  tone = 'neutral',
  shape = 'square',
  dot = false,
  outline = false,
}: {
  label: string;
  tone?: BadgeTone;
  shape?: 'square' | 'pill';
  dot?: boolean;
  outline?: boolean;
}) {
  const { colors } = useTheme();
  const TONES: Record<BadgeTone, { fg: string; bg: string }> = {
    success: { fg: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
    warning: { fg: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
    danger: { fg: '#FF4949', bg: 'rgba(255,73,73,0.10)' },
    info: { fg: '#4D9EFF', bg: 'rgba(77,158,255,0.10)' },
    neutral: { fg: colors.muted, bg: 'rgba(136,136,136,0.12)' },
    accent: { fg: colors.accent, bg: colors.glow },
  };
  const t = TONES[tone];
  const square = shape === 'square';
  return (
    <View
      className="flex-row items-center"
      style={{
        gap: 6,
        paddingHorizontal: square ? 8 : 9,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: outline || square ? t.fg : 'transparent',
        backgroundColor: outline ? 'transparent' : t.bg,
        borderRadius: square ? 2 : 100,
      }}
    >
      {dot && <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: t.fg }} />}
      <Mono
        style={{
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          color: t.fg,
        }}
      >
        {label}
      </Mono>
    </View>
  );
}

// ── Avatar: circle initials or accent-dim fill ─────────────────────────────
export function Avatar({ name, size = 36, uri }: { name?: string; size?: number; uri?: string }) {
  const initials = (name ?? '')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }
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
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2 w-2 items-center justify-center">
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 8,
              height: 8,
              borderRadius: 8,
              backgroundColor: colors.accent,
            },
            ring,
          ]}
        />
        <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: colors.accent }} />
      </View>
      {label && <Label className="text-accent">{label}</Label>}
    </View>
  );
}

// ── Status vocabulary → tone + label ────────────────────────────────────────
// Verbatim from the design system StatusPill (components/status/StatusPill.jsx),
// extended with the extra codes the API returns.
export type Tone = BadgeTone;

const STATUS_MAP: Record<string, { tone: BadgeTone; label: string }> = {
  // Vehicle
  AVAILABLE: { tone: 'success', label: 'Available' },
  ACTIVE: { tone: 'success', label: 'Active' },
  IN_USE: { tone: 'info', label: 'In Use' },
  ON_DUTY: { tone: 'info', label: 'On Duty' },
  MAINTENANCE: { tone: 'warning', label: 'Maintenance' },
  INACTIVE: { tone: 'neutral', label: 'Inactive' },
  OUT_OF_SERVICE: { tone: 'neutral', label: 'Out of Service' },
  // Load / job
  PENDING: { tone: 'warning', label: 'Pending' },
  ASSIGNED: { tone: 'info', label: 'Assigned' },
  LOADING: { tone: 'info', label: 'Loading' },
  SCHEDULED: { tone: 'info', label: 'Scheduled' },
  IN_TRANSIT: { tone: 'info', label: 'In Transit' },
  IT: { tone: 'info', label: 'In Transit' },
  DELIVERED: { tone: 'success', label: 'Delivered' },
  INVOICED: { tone: 'success', label: 'Invoiced' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  CANCELLED: { tone: 'danger', label: 'Cancelled' },
  // Quote
  DRAFT: { tone: 'neutral', label: 'Draft' },
  SENT: { tone: 'warning', label: 'Sent' },
  VIEWED: { tone: 'info', label: 'Viewed' },
  QUOTED: { tone: 'info', label: 'Viewed' },
  ACCEPTED: { tone: 'success', label: 'Accepted' },
  APPROVED: { tone: 'success', label: 'Approved' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  DECLINED: { tone: 'danger', label: 'Declined' },
  EXPIRED: { tone: 'danger', label: 'Expired' },
  WON: { tone: 'success', label: 'Won' },
  LOST: { tone: 'danger', label: 'Lost' },
  // Invoice
  PAID: { tone: 'success', label: 'Paid' },
  OVERDUE: { tone: 'danger', label: 'Overdue' },
  UNPAID: { tone: 'warning', label: 'Unpaid' },
  PARTIAL: { tone: 'warning', label: 'Partial' },
};

export const toneForStatus = (status?: string): Tone =>
  STATUS_MAP[
    String(status ?? '')
      .toUpperCase()
      .replace(/[\s-]/g, '_')
  ]?.tone ?? 'neutral';

// ── StatusPill: square chip with leading dot (design default) ───────────────
export function StatusPill({
  status,
  label,
  shape = 'square',
  dot = true,
}: {
  status?: string;
  label?: string;
  shape?: 'square' | 'pill';
  dot?: boolean;
}) {
  const key = String(status ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '_');
  const cfg = STATUS_MAP[key] ?? {
    tone: 'neutral' as BadgeTone,
    label: (status ?? '—').replace(/_/g, ' '),
  };
  return <Badge label={label ?? cfg.label} tone={cfg.tone} shape={shape} dot={dot} />;
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
      <Mono className="text-micro uppercase tracking-label" style={{ color: hue }}>
        {stage.replace(/_/g, ' ')}
      </Mono>
    </View>
  );
}

// ── ConfidenceTag: high/medium/low from a 0..1 score ───────────────────────
export function ConfidenceTag({ value }: { value: number }) {
  const level = value >= 0.8 ? 'high' : value >= 0.6 ? 'medium' : 'low';
  const hue =
    level === 'high'
      ? statusHues.success
      : level === 'medium'
        ? statusHues.warning
        : statusHues.danger;
  return (
    <View className="flex-row items-center gap-1">
      <Icon name="gauge" size={12} color={hue} strokeWidth={2} />
      <Mono className="text-micro" style={{ color: hue }}>
        {formatConfidence(value)}
      </Mono>
    </View>
  );
}

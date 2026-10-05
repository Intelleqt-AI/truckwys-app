import { useState, type ReactNode } from 'react';
import {
  View,
  Text as RNText,
  TouchableOpacity,
  ActivityIndicator,
  type ViewProps,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Mono, Label } from './Text';
import { Icon, type IconName } from './icons';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

// ── Card: surface fill, hairline border, 12px radius, no shadow ────────────
// `overflow-hidden` clips anything painted flush to the edges (pressed-row
// highlights, a coloured footer) to the now-rounded corner instead of
// poking a square corner out past it.
export function Card({ className = '', ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={`overflow-hidden rounded-card border border-line bg-surface ${className}`}
      {...props}
    />
  );
}

// ── Button: primary (ink) / secondary (outline) / ghost / danger ───────────
// v3: the primary action is ink — near-black on light, near-white on dark — never
// the blue accent. Pressed state swaps colour tokens (no opacity dip, except on
// the danger fill, which has no darker token); disabled is a flat raised fill.
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
   * where the 44px primary height would dominate the row. Still a real button
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
  const [pressed, setPressed] = useState(false);
  const inactive = !!disabled || !!loading;
  const base =
    size === 'sm'
      ? 'flex-row items-center justify-center gap-1.5 rounded-control px-3 min-h-[32px]'
      : 'flex-row items-center justify-center gap-2 rounded-control px-4 min-h-[44px]';

  let bg: string = 'transparent';
  let border: string = 'transparent';
  let fg: string = colors.fg;
  if (disabled) {
    bg = colors.raised;
    fg = colors.disabled;
  } else if (variant === 'primary') {
    bg = pressed ? colors.btnPrimaryPressed : colors.btnPrimaryBg;
    fg = colors.btnPrimaryFg;
  } else if (variant === 'danger') {
    bg = colors.btnDangerBg;
    fg = colors.btnDangerFg;
  } else if (variant === 'secondary') {
    bg = pressed ? colors.tintPressed : 'transparent';
    border = colors.lineActive;
  } else {
    bg = pressed ? colors.tintPressed : 'transparent';
    fg = pressed ? colors.fg : colors.muted;
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      // The 32pt `sm` button keeps its drawn size but gets a 44pt hit area (web R7).
      hitSlop={size === 'sm' ? { top: 6, bottom: 6, left: 4, right: 4 } : undefined}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      activeOpacity={variant === 'danger' && !disabled ? 0.85 : 1}
      className={`${base} ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ backgroundColor: bg, borderColor: border, borderWidth: 1 }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} color={fg} strokeWidth={2} />}
          <RNText
            numberOfLines={1}
            className={`${size === 'sm' ? 'text-caption' : 'text-callout'} font-medium`}
            style={{ color: fg }}
          >
            {label}
          </RNText>
        </>
      )}
    </TouchableOpacity>
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
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      activeOpacity={0.7}
      onPress={onPress}
      className={`h-11 w-11 items-center justify-center rounded-pill ${className}`}
    >
      <Icon name={name} size={size} color={color ?? colors.muted} />
    </TouchableOpacity>
  );
}

// ── Badge: the web's status chip — neutral outline pill + coloured dot ─────
// v3 rule: the *state* is carried by the 6px dot; the words stay quiet
// (text-secondary). A dotless Badge has no dot to carry the state, so its label
// takes the tone's text colour instead. `variant="chip"` is the web's scope chip
// ("Last 20 quotes"): a raised, borderless pill.
export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

export function Badge({
  label,
  tone = 'neutral',
  dot = false,
  variant = 'status',
}: {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  variant?: 'status' | 'chip';
}) {
  const { colors } = useTheme();
  const TONES: Record<BadgeTone, { text: string; dot: string }> = {
    success: { text: colors.success, dot: colors.successDot },
    warning: { text: colors.warning, dot: colors.warningDot },
    danger: { text: colors.danger, dot: colors.dangerDot },
    info: { text: colors.info, dot: colors.infoDot },
    neutral: { text: colors.neutral, dot: colors.neutralDot },
    accent: { text: colors.accent, dot: colors.accent },
  };
  const t = TONES[tone];
  const chip = variant === 'chip';
  return (
    <View
      className="flex-row items-center self-start"
      style={{
        gap: 6,
        // minHeight, not height: the label scales with the system font size, and
        // a fixed 22 would clip it at the larger accessibility sizes.
        minHeight: 22,
        paddingLeft: chip ? 8 : dot ? 7 : 8,
        paddingRight: 8,
        borderWidth: chip ? 0 : 1,
        borderColor: colors.lineActive,
        backgroundColor: chip ? colors.raised : 'transparent',
        borderRadius: radius.pill,
      }}
    >
      {dot && <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: t.dot }} />}
      <RNText
        numberOfLines={1}
        className="text-caption font-medium"
        style={{
          color: dot ? colors.muted : tone === 'neutral' ? colors.muted : t.text,
          fontVariant: ['tabular-nums'],
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

// ── Avatar: circle initials, optionally overlaid with a remote image ───────
// Initials render as the base layer so a slow-loading or broken `uri` never
// leaves an empty circle — the image just fades in on top once it resolves.
export function Avatar({
  name,
  size = 36,
  uri,
  bordered = false,
}: {
  name?: string;
  size?: number;
  uri?: string;
  bordered?: boolean;
}) {
  // Tracks the URI that failed (not a plain boolean) so the flag invalidates
  // itself when `uri` changes — recycled list rows retry instead of inheriting
  // a previous row's failure.
  const [failedUri, setFailedUri] = useState<string>();
  const initials = (name ?? '')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const showImage = !!uri && failedUri !== uri;
  return (
    <View
      className={`items-center justify-center overflow-hidden rounded-pill bg-raised ${
        bordered ? 'border-2 border-accent' : ''
      }`}
      style={{ width: size, height: size }}
    >
      <Mono className="font-medium text-muted" style={{ fontSize: size * 0.36 }}>
        {initials || '—'}
      </Mono>
      {showImage && (
        <Image
          source={{ uri }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          transition={120}
          recyclingKey={uri}
          onError={() => setFailedUri(uri)}
        />
      )}
    </View>
  );
}

// ── LiveDot: a static 6px dot — v3 bans pulsing/glowing dots ───────────────
export function LiveDot({ label }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: colors.infoDot }} />
      {label && <Label className="text-muted">{label}</Label>}
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
  IN_USE: { tone: 'info', label: 'In use' },
  ON_DUTY: { tone: 'info', label: 'On duty' },
  ON_JOB: { tone: 'info', label: 'On a job' },
  BUSY: { tone: 'info', label: 'On a job' },
  MAINTENANCE: { tone: 'warning', label: 'Maintenance' },
  SERVICE_DUE: { tone: 'warning', label: 'Service due' },
  INACTIVE: { tone: 'neutral', label: 'Inactive' },
  OFF_DUTY: { tone: 'neutral', label: 'Off duty' },
  OUT_OF_SERVICE: { tone: 'danger', label: 'Out of service' },
  ON_LEAVE: { tone: 'warning', label: 'On leave' },
  INVITED: { tone: 'neutral', label: 'Invited' },
  SUSPENDED: { tone: 'danger', label: 'Suspended' },
  LOCKED: { tone: 'danger', label: 'Locked' },
  BLOCKED: { tone: 'danger', label: 'Blocked' },
  // Integrations
  CONNECTED: { tone: 'success', label: 'Connected' },
  SYNCED: { tone: 'success', label: 'Synced' },
  DISCONNECTED: { tone: 'neutral', label: 'Not connected' },
  ERROR: { tone: 'danger', label: 'Error' },
  FAILED: { tone: 'danger', label: 'Failed' },
  // Load / job. Tones follow the web's design v3 vocabulary, so the same word
  // reads the same on every platform: neutral = not started or finished without
  // a verdict (Draft, Pending, Assigned, Booked, Expired, Cancelled), info = in
  // motion (Sent, Viewed, Loading, In transit), success = done well (Paid,
  // Accepted, Delivered, Active), warning = needs a look (Partially paid,
  // Maintenance), danger = a problem (Overdue, Declined, Lost, Failed).
  PENDING: { tone: 'neutral', label: 'Pending' },
  ASSIGNED: { tone: 'neutral', label: 'Assigned' },
  CONFIRMED: { tone: 'neutral', label: 'Confirmed' },
  SCHEDULED: { tone: 'neutral', label: 'Scheduled' },
  LOADING: { tone: 'info', label: 'Loading' },
  PICKED_UP: { tone: 'info', label: 'Picked up' },
  IN_TRANSIT: { tone: 'info', label: 'In transit' },
  IT: { tone: 'info', label: 'In transit' },
  ON_ROUTE: { tone: 'info', label: 'In transit' },
  EN_ROUTE: { tone: 'info', label: 'In transit' },
  DELAYED: { tone: 'warning', label: 'Delayed' },
  DELIVERED: { tone: 'success', label: 'Delivered' },
  INVOICED: { tone: 'success', label: 'Invoiced' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
  CANCELED: { tone: 'neutral', label: 'Cancelled' },
  COMPLETE: { tone: 'success', label: 'Completed' },
  IN_MAINTENANCE: { tone: 'warning', label: 'Maintenance' },
  // Quote
  DRAFT: { tone: 'neutral', label: 'Draft' },
  SENT: { tone: 'info', label: 'Sent' },
  VIEWED: { tone: 'info', label: 'Viewed' },
  OPENED: { tone: 'info', label: 'Viewed' },
  QUOTED: { tone: 'info', label: 'Viewed' },
  ACCEPTED: { tone: 'success', label: 'Accepted' },
  APPROVED: { tone: 'success', label: 'Approved' },
  CONVERTED: { tone: 'success', label: 'Converted' },
  REJECTED: { tone: 'danger', label: 'Rejected' },
  DECLINED: { tone: 'danger', label: 'Declined' },
  EXPIRED: { tone: 'neutral', label: 'Expired' },
  EXPIRING: { tone: 'warning', label: 'Expiring' },
  // Converted into a load. Never a stored status: the quote API reports it as
  // booked_load, so the screens pass it in explicitly.
  BOOKED: { tone: 'neutral', label: 'Booked' },
  WON: { tone: 'success', label: 'Won' },
  LOST: { tone: 'danger', label: 'Lost' },
  // Invoice
  PAID: { tone: 'success', label: 'Paid' },
  OVERDUE: { tone: 'danger', label: 'Overdue' },
  UNPAID: { tone: 'warning', label: 'Unpaid' },
  PARTIAL: { tone: 'warning', label: 'Partial' },
  VOID: { tone: 'neutral', label: 'Void' },
  // Fully credited by a credit note, and a credit note that is in force.
  CREDITED: { tone: 'neutral', label: 'Credited' },
  ISSUED: { tone: 'info', label: 'Issued' },
  REFUNDED: { tone: 'neutral', label: 'Refunded' },
  // The status the backend actually stores for a part-paid invoice.
  PARTIALLY_PAID: { tone: 'warning', label: 'Partially paid' },
  PART_PAID: { tone: 'warning', label: 'Partially paid' },
};

export const toneForStatus = (status?: string): Tone =>
  STATUS_MAP[
    String(status ?? '')
      .toUpperCase()
      .replace(/[\s-]/g, '_')
  ]?.tone ?? 'neutral';

// ── StatusPill: outline chip with a leading state dot (web StatusChip) ──────
// Unknown codes fall back to neutral, with the code shown in sentence case.
const sentenceCase = (s: string) => {
  const t = s.replace(/_/g, ' ').trim().toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—';
};

export function StatusPill({
  status,
  label,
  dot = true,
}: {
  status?: string;
  label?: string;
  dot?: boolean;
}) {
  const key = String(status ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '_');
  const cfg = STATUS_MAP[key] ?? {
    tone: 'neutral' as BadgeTone,
    label: sentenceCase(status ?? ''),
  };
  return <Badge label={label ?? cfg.label} tone={cfg.tone} dot={dot} />;
}

// ── PressScale: spring scale-down on press, the house tap feel ────────────
// Same press-in/release spring TabBar.tsx already uses for tab items, so a
// tappable module (Home's hero, bento tiles, list rows) feels consistent
// with the rest of the app instead of each screen inventing its own cue.
// Built on TouchableOpacity, with its own opacity feedback turned off
// (activeOpacity=1) so the scale is the only cue — no double feedback.
//
// `className` sizes/borders the OUTER Animated.View only — that's the element
// actually participating in a caller's flex layout (e.g. `flex-1` plus
// `border-l` for a divided column in a flex-row). It used to be duplicated
// onto the inner TouchableOpacity too, which rendered a caller's border
// TWICE — once on each box's edge, ~1px apart (the outer box's own border
// width) — a doubled/misaligned divider rather than one clean hairline.
//
// `center`, not `className`, controls the inner TouchableOpacity: it applies
// `items-center justify-center` for a cell whose children (e.g. a stacked
// label+value) should sit centred rather than stretch edge-to-edge. Leaving
// the outer box's own alignItems at its flexbox default (`stretch`) is what
// makes the *touch target* still fill the whole column even when `center` is
// set — only the inner content is centred, not the box that contains it.
export function PressScale({
  onPress,
  onLongPress,
  disabled,
  className = '',
  center = false,
  children,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  className?: string;
  center?: boolean;
  children: ReactNode;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style} className={className}>
      <TouchableOpacity
        activeOpacity={1}
        disabled={disabled}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 18, stiffness: 320, mass: 0.5 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 15, stiffness: 200, mass: 0.6 });
        }}
        className={center ? 'items-center justify-center' : undefined}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

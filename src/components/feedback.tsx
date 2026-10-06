import { useEffect } from 'react';
import { View, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { Screen, EmptyState, Button, Txt, LogoMark } from '@/components/ui';
import { radius as radiusTokens } from '@/theme/tokens';

// ── Shimmer block ──────────────────────────────────────────────────────────
export function Skeleton({
  width = '100%',
  height = 16,
  radius = radiusTokens.sm,
  className = '',
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const o = useSharedValue(reduceMotion ? 0.8 : 0.55);
  useEffect(() => {
    // Reduce Motion: a still, mid-opacity block instead of the pulse.
    if (reduceMotion) {
      o.value = 0.8;
      return;
    }
    o.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [o, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    // bg-line-active, not bg-raised: raised is nearly the page background in both
    // themes, so at the low point of the pulse the block all but vanished.
    <Animated.View
      className={`bg-line-active ${className}`}
      style={[{ width: width as number, height, borderRadius: radius }, style]}
    />
  );
}

// ── Error state with retry ──────────────────────────────────────────────────
export function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <Screen scroll={false}>
      <View className="flex-1 justify-center">
        <EmptyState
          icon="alert"
          title="Something went wrong"
          body={message ?? 'Please check your connection and try again.'}
          action={<Button label="Retry" variant="secondary" icon="refresh" onPress={onRetry} />}
        />
      </View>
    </Screen>
  );
}

// ── Detail screen loading + not-found ───────────────────────────────────────
// A detail screen opened cold (push notification, deep link) has no preview to
// render from, so it used to paint empty values ("DRAFT / R0") until the fetch
// landed. Web shows a block skeleton and, for a 404, a not-found state; these are
// the mobile equivalents. Content only — the caller keeps its own SheetScreen.
// Each block is a bordered card with shimmer bars inside, like the real cards, so
// the page has a visible outline even when a bar is at the dim end of its pulse.
function SkeletonCard({ bars, className = '' }: { bars: number[]; className?: string }) {
  return (
    <View className={`gap-3 rounded-card border border-line bg-surface p-4 ${className}`}>
      {bars.map((w, i) => (
        <Skeleton key={i} width={`${w}%`} height={i === 0 ? 14 : 11} />
      ))}
    </View>
  );
}

export function DetailSkeleton() {
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar">
      <View className="mb-5 flex-row gap-3">
        <View className="flex-1 gap-3 rounded-card border border-line bg-surface p-4">
          <Skeleton width="50%" height={11} />
          <Skeleton width="75%" height={20} />
        </View>
        <View className="flex-1 gap-3 rounded-card border border-line bg-surface p-4">
          <Skeleton width="50%" height={11} />
          <Skeleton width="75%" height={20} />
        </View>
      </View>
      <SkeletonCard bars={[40, 90, 75, 85, 60]} className="mb-5" />
      <SkeletonCard bars={[35, 80, 65, 70]} className="mb-5" />
      <SkeletonCard bars={[45, 85, 55]} />
    </View>
  );
}

/** Web's "It may have been deleted or moved." for a record that no longer exists. */
export function NotFoundState({ what, onBack }: { what: string; onBack: () => void }) {
  return (
    <EmptyState
      icon="search"
      title={`${what} not found`}
      body="It may have been deleted or moved."
      action={<Button label="Go back" variant="secondary" onPress={onBack} />}
    />
  );
}

// ── Inline list loading (rows) ──────────────────────────────────────────────
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View className="gap-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          className="flex-row items-center gap-3 rounded-card border border-line bg-surface p-4"
        >
          <Skeleton width={38} height={38} radius={radiusTokens.pill} />
          <View className="flex-1 gap-2">
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={11} />
          </View>
          <Skeleton width={54} height={18} />
        </View>
      ))}
    </View>
  );
}

// ── Home section skeletons ──────────────────────────────────────────────────
// HomeScreen used to gate its entire body behind one skeleton until all six
// of its underlying requests returned. It now renders each section as soon as
// its own data lands, so these are exported individually — one per section —
// rather than as a single fixed block.
export function CommandBarSkeleton() {
  return <Skeleton height={72} radius={radiusTokens.card} className="mb-5" />;
}

export function HeroSkeleton() {
  return <Skeleton height={190} radius={radiusTokens.card} className="mb-5" />;
}

export function BentoSkeleton() {
  return (
    <View className="mb-5 flex-row gap-3">
      <Skeleton width="48%" height={78} radius={radiusTokens.card} />
      <Skeleton width="48%" height={78} radius={radiusTokens.card} />
    </View>
  );
}

export function UtilisationSkeleton() {
  return <Skeleton height={160} radius={radiusTokens.card} className="mb-5" />;
}

// Mirrors the shape above, block-for-block, for anywhere that still wants the
// whole thing as one unit.
export function HomeSkeleton() {
  return (
    <Screen>
      <View className="pb-3.5 pt-2">
        <Skeleton width={90} height={11} className="mb-2" />
        <Skeleton width={160} height={26} />
      </View>
      <CommandBarSkeleton />
      <HeroSkeleton />
      <BentoSkeleton />
      <UtilisationSkeleton />
      <ListSkeleton rows={3} />
    </Screen>
  );
}

// ── Inline section error ────────────────────────────────────────────────────
// A single dead endpoint used to blank the whole Home dashboard via one
// shared isLoading/isError gate. This is the section-scoped equivalent —
// small enough to sit inside a still-otherwise-working screen.
export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View className="mb-5 items-center gap-2 rounded-card border border-line bg-surface p-4">
      <Txt className="text-center text-caption text-faint">{message}</Txt>
      <Button label="Retry" variant="secondary" icon="refresh" onPress={onRetry} />
    </View>
  );
}

// ── Working overlay ────────────────────────────────────────────────────────
/**
 * Blocking overlay for a multi-second action the user has to wait out — the AI
 * quote build, mainly.
 *
 * A transparent Modal rather than an absolutely-positioned View: the form it
 * covers lives inside SheetScreen's ScrollView, so an in-tree overlay would
 * scroll with the content and wouldn't cover the native header. A Modal also
 * blocks touches underneath for free, which is what we want while fields are
 * about to change out from under the user.
 */
export function WorkingOverlay({ visible, title }: { visible: boolean; title: string }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-backdrop px-10">
        <View className="w-full max-w-[300px] items-center rounded-panel border border-line bg-surface px-6 py-8">
          <BreathingLogo />
          <Txt className="mt-5 text-center text-callout font-medium text-fg">{title}</Txt>
          <Txt className="mt-1.5 text-center text-caption text-faint">This takes a few seconds</Txt>
        </View>
      </View>
    </Modal>
  );
}

/** Slow opacity+scale breathing loop plus a slow continuous spin. Reads as "thinking" without implying progress. */
function BreathingLogo() {
  const t = useSharedValue(0);
  const spin = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    // Reduce Motion: hold the mark still at full strength.
    if (reduceMotion) {
      t.value = 1;
      spin.value = 0;
      return;
    }
    t.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    spin.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.linear }), -1, false);
  }, [t, spin, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.45 + t.value * 0.55,
    transform: [{ scale: 0.88 + t.value * 0.24 }, { rotate: `${spin.value * 360}deg` }],
  }));
  return (
    <Animated.View style={style}>
      <LogoMark size={34} />
    </Animated.View>
  );
}

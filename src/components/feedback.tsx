import { useEffect } from 'react';
import { View, Modal } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Screen, EmptyState, Button, Txt, LogoMark } from '@/components/ui';

// ── Shimmer block ──────────────────────────────────────────────────────────
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 2,
  className = '',
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  className?: string;
}) {
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.9, { duration: 800 }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      className={`bg-surface-hover ${className}`}
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
          action={<Button label="Retry" variant="secondary" icon="route" onPress={onRetry} />}
        />
      </View>
    </Screen>
  );
}

// ── Inline list loading (rows) ──────────────────────────────────────────────
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View className="gap-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3 rounded-xs border border-line bg-surface p-4">
          <Skeleton width={38} height={38} radius={100} />
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

// ── Home skeleton ───────────────────────────────────────────────────────────
export function HomeSkeleton() {
  return (
    <Screen>
      <View className="pb-3.5 pt-2">
        <Skeleton width={90} height={11} className="mb-2" />
        <Skeleton width={160} height={26} />
      </View>
      <Skeleton height={64} className="mb-5" />
      <Skeleton height={92} className="mb-3" />
      <View className="mb-5 flex-row gap-3">
        <Skeleton width="48%" height={92} />
        <Skeleton width="48%" height={92} />
      </View>
      <Skeleton height={180} className="mb-5" />
      <ListSkeleton rows={3} />
    </Screen>
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
      <View className="flex-1 items-center justify-center bg-black/70 px-10">
        <View className="w-full max-w-[300px] items-center rounded-sm border border-line bg-surface px-6 py-8">
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
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.linear }), -1, false);
  }, [t, spin]);
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

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import { Screen, EmptyState, Button } from '@/components/ui';

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

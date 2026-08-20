import { View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon, Mono, Txt } from '@/components/ui';
import { status as statusHues } from '@/theme/tokens';

// What the route says, said on the map.
//
// The distance and duration were only ever in the sheet's estimate block, which
// means dragging the sheet down to look at the route took away the two numbers
// you drag it down to compare against. These float over the map instead: a pill
// naming the ends at the top, and a bubble with the numbers just above the sheet.
//
// Absolutely positioned and inset-driven, the same way CrosshairOverlay is, so
// they stay clear of the chrome above and the sheet below.

export function RouteCallouts({
  pickupLabel,
  deliveryLabel,
  distanceKm,
  durationLabel,
  busy,
  blocked,
  topInset,
  bottomInset,
  liveBottomInset,
}: {
  pickupLabel?: string;
  deliveryLabel?: string;
  /** Charged distance, which is what the quote is actually priced on. */
  distanceKm?: number;
  durationLabel?: string;
  busy?: boolean;
  /** Cross-border refusal from /route/calculate/, shown in place of the numbers. */
  blocked?: string | null;
  topInset: number;
  bottomInset: number;
  /** Live sheet height, so the bubble rides the drag instead of stepping after it. */
  liveBottomInset?: SharedValue<number>;
}) {
  const hasEnds = !!pickupLabel && !!deliveryLabel;

  // Follows the sheet frame by frame when the live value is there, and falls back
  // to the settled inset when it isn't (the static map in Expo Go, or pick mode).
  const bubbleStyle = useAnimatedStyle(() => ({
    bottom: (liveBottomInset?.value ?? bottomInset) + 14,
  }));

  if (!hasEnds) return null;

  return (
    <>
      {/* Top pill: the leg, in words. Left-padded clear of the back button. */}
      <View
        className="absolute left-16 right-4 flex-row items-center gap-2 rounded-pill border border-white/10 bg-bg-deep/85 px-3 py-1.5"
        style={{ top: topInset + 8 }}
        pointerEvents="none"
      >
        <View className="h-2 w-2 rounded-pill" style={{ backgroundColor: statusHues.success }} />
        <Txt className="flex-1 text-nano text-fg" numberOfLines={1}>
          {pickupLabel}
        </Txt>
        <Icon name="arrowRight" size={12} color="#8A8F98" />
        <View className="h-2 w-2" style={{ backgroundColor: statusHues.danger }} />
        <Txt className="flex-1 text-right text-nano text-fg" numberOfLines={1}>
          {deliveryLabel}
        </Txt>
      </View>

      {/* Bubble: the numbers, sitting just above the sheet. */}
      <Animated.View
        className="absolute left-4 right-4 rounded-sm border border-white/10 bg-bg-deep/90 px-3 py-2"
        style={bubbleStyle}
        pointerEvents="none"
      >
        {blocked ? (
          <View className="flex-row items-center gap-2">
            <Icon name="alert" size={14} color="#F59E0B" />
            <Txt className="flex-1 text-nano text-fg" numberOfLines={2}>
              {blocked}
            </Txt>
          </View>
        ) : busy || distanceKm == null ? (
          <Mono className="text-center text-nano text-faint">Calculating route…</Mono>
        ) : (
          <View className="flex-row items-center justify-center gap-3">
            <Mono className="text-sub text-fg">{Math.round(distanceKm)} km</Mono>
            {!!durationLabel && (
              <>
                <View className="h-3 w-px bg-line" />
                <Mono className="text-sub text-fg">{durationLabel}</Mono>
              </>
            )}
          </View>
        )}
      </Animated.View>
    </>
  );
}

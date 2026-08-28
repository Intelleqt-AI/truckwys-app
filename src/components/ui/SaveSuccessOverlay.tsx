import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { Icon } from './icons';
import { Txt } from './Text';
import { status as statusHues } from '@/theme/tokens';

export interface SaveSuccessOverlayProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onDone: () => void;
  /** Auto-dismiss delay in ms. A create/edit save is routine, unlike a quote
      send — this always auto-dismisses, there's no "wait for the user" mode. */
  autoDismissMs?: number;
}

/**
 * Brief visible confirmation for a save, trimmed from
 * `src/features/bookings/quote/QuoteSentOverlay.tsx`. `toast.success` is
 * silent by app-wide policy (`src/lib/toast.tsx` — haptic only), which is
 * right for routine list updates but leaves a create/edit form with no
 * visible sign the write landed before the sheet closes. This adds that,
 * for Fleet's add/edit vehicle and add/edit driver flows only.
 *
 * Must be rendered as a SIBLING of `SheetScreen`, not a child — the sheet's
 * ScrollView would otherwise clip an `absolute inset-0` overlay:
 *   <View className="flex-1">
 *     <SheetScreen ...>{fields}</SheetScreen>
 *     <SaveSuccessOverlay visible={saved} title="Vehicle added" onDone={...} />
 *   </View>
 */
export function SaveSuccessOverlay({
  visible,
  title,
  subtitle,
  onDone,
  autoDismissMs = 1100,
}: SaveSuccessOverlayProps) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDone, autoDismissMs);
    return () => clearTimeout(t);
  }, [visible, autoDismissMs, onDone]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      pointerEvents="none"
      className="absolute inset-0 items-center justify-center bg-black/70 px-8"
    >
      <Animated.View
        entering={ZoomIn.duration(220)}
        className="w-full max-w-[280px] items-center rounded-sm border border-line bg-surface px-6 py-7"
      >
        <View className="h-12 w-12 items-center justify-center rounded-pill bg-success-bg">
          <Icon name="checkCircle" size={28} color={statusHues.success} />
        </View>
        <Txt className="mt-4 text-center text-heading font-semibold text-fg">{title}</Txt>
        {!!subtitle && <Txt className="mt-1.5 text-center text-caption text-faint">{subtitle}</Txt>}
      </Animated.View>
    </Animated.View>
  );
}

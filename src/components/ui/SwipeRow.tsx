import { useEffect, useRef, type ReactNode } from 'react';
import { View, Pressable, Platform } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Icon } from './icons';
import { Mono } from './Text';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';

const PANE_W = 84;

// ── SwipeRow: swipe-left-to-reveal-Delete wrapper ───────────────────────────
/**
 * Wraps one list row in a `ReanimatedSwipeable` (the gesture-handler subpath
 * export — it isn't in the package's main barrel, hence the direct path
 * import). Reveal-then-tap, not a full-swipe auto-trigger: a short left swipe
 * slides in a red Delete pane, and the pane itself has to be tapped to fire
 * `onDelete`. A gesture-only delete is too easy to trigger by accident in a
 * settings list.
 *
 * Tapping the row while the pane is open closes it instead of falling
 * through to the row's own `onPress` — that's RNGH's own behaviour
 * (an internal tap gesture that closes on rowState !== 0, plus
 * `pointerEvents: 'box-only'` on the children while open), not something
 * this wrapper has to reimplement.
 *
 * `accessibilityActions` lives on the outer `View`, not on the Swipeable
 * itself — `SwipeableProps` is typed off `PanGestureHandlerProps`, which
 * carries no accessibility fields, so a screen reader that can't perform the
 * swipe gesture still gets a "Delete" custom action to activate instead.
 */
export function SwipeRow({
  children,
  onDelete,
  deleteLabel = 'Delete',
  enabled = true,
}: {
  children: ReactNode;
  /** Runs after the row has closed itself — safe to show a confirm Alert
      here; cancelling it just leaves the row closed with nothing deleted. */
  onDelete: () => void;
  deleteLabel?: string;
  /** false disables the gesture entirely (e.g. while a list is in
      multi-select mode) without unmounting the row. */
  enabled?: boolean;
}) {
  const { colors } = useTheme();
  const ref = useRef<SwipeableMethods | null>(null);

  // `enabled` only gates the pan gesture, not the row's open/closed state —
  // so flipping it off (entering select mode, say) while a row is open would
  // otherwise leave it open with its children stuck under RNGH's own
  // `box-only` pointerEvents (dead to touch) until the pane is dragged shut
  // again, which the disabled pan no longer allows.
  useEffect(() => {
    if (!enabled) ref.current?.close();
  }, [enabled]);

  return (
    <View
      accessibilityActions={[{ name: 'delete', label: deleteLabel }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onDelete()}
    >
      <ReanimatedSwipeable
        ref={ref}
        enabled={enabled}
        friction={2}
        rightThreshold={46}
        overshootRight={false}
        dragOffsetFromRightEdge={18}
        enableTrackpadTwoFingerGesture
        containerStyle={{ backgroundColor: statusHues.danger }}
        // The row's own content is transparent at rest — without this the red
        // pane behind it would show straight through.
        childrenContainerStyle={{ backgroundColor: colors.surface }}
        onSwipeableWillOpen={() => {
          if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }}
        renderRightActions={(progress, drag, methods) => (
          <DeletePane
            progress={progress}
            drag={drag}
            label={deleteLabel}
            onPress={() => {
              methods.close();
              onDelete();
            }}
          />
        )}
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
}

function DeletePane({
  progress,
  drag,
  label,
  onPress,
}: {
  progress: SharedValue<number>;
  drag: SharedValue<number>;
  label: string;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + PANE_W }],
    // overshootRight is false, so progress stays within [0, 1] — fades the
    // pane in over the first half of the reveal rather than having it pop
    // in fully-opaque the instant the swipe starts.
    opacity: Math.min(progress.value * 2, 1),
  }));
  return (
    <Animated.View style={[{ width: PANE_W }, style]}>
      <Pressable
        onPress={onPress}
        className="flex-1 items-center justify-center gap-1"
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Icon name="trash" size={18} color="#fff" />
        <Mono className="text-nano uppercase tracking-wide" style={{ color: '#fff' }}>
          {label}
        </Mono>
      </Pressable>
    </Animated.View>
  );
}

import { memo } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useBottomSheetInternal, KEYBOARD_STATUS } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Button, Icon, Mono } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/formatters';

export interface FooterStrip {
  tone: 'danger' | 'warning';
  message: string;
  /** Omitted for messages the user can't act on (a suspended subscription). */
  onPress?: () => void;
}

/**
 * The footer's content — QuoteFooterBar (the reanimated keyboard-padding
 * wrapper) is untouched; only what it wraps changes (Phase 3). Replaces the
 * old bare two-button row: a status strip carries the live total and,
 * by precedence, whichever of subscription/route/field issues is blocking
 * the user, and Send is always tappable — it jumps to the problem instead of
 * silently refusing.
 */
function QuoteFooterActionsImpl({
  total,
  statsTrusted,
  marginPct,
  ready,
  calculating,
  strip,
  busy,
  saveDisabled,
  sendDisabled,
  onSaveDraft,
  onSend,
}: {
  total: number;
  statsTrusted: boolean;
  marginPct: number;
  ready: boolean;
  /** routeBusy || aiBusy — a small spinner next to the total. */
  calculating: boolean;
  strip: FooterStrip | null;
  busy: 'draft' | 'send' | null;
  saveDisabled: boolean;
  sendDisabled: boolean;
  onSaveDraft: () => void;
  onSend: () => void;
}) {
  // Collapses the status row while the keyboard is up — same reasoning as
  // QuoteFooterBar's own padding animation around this component: the footer
  // already crowds the keyboard, a second row of text doesn't fit above it.
  const { animatedKeyboardState } = useBottomSheetInternal();
  const stripStyle = useAnimatedStyle(() => {
    const shown = animatedKeyboardState.value.status === KEYBOARD_STATUS.SHOWN;
    return {
      height: withTiming(shown ? 0 : 22, { duration: animatedKeyboardState.value.duration }),
      opacity: withTiming(shown ? 0 : 1, { duration: animatedKeyboardState.value.duration }),
      marginBottom: withTiming(shown ? 0 : 8, { duration: animatedKeyboardState.value.duration }),
    };
  });

  const stripColor = strip?.tone === 'danger' ? '#FF4949' : '#F59E0B';

  return (
    <View>
      <Animated.View
        className="flex-row items-center justify-between gap-2 overflow-hidden"
        style={stripStyle}
      >
        <View className="flex-1 flex-row items-center gap-2">
          {ready ? (
            <>
              <Mono className="text-callout font-semibold text-accent" numberOfLines={1}>
                {formatCurrency(total)}
              </Mono>
              {statsTrusted && total > 0 && (
                <Mono className="text-micro text-muted">
                  · {formatPercent(marginPct, 0)} margin
                </Mono>
              )}
              {calculating && <ActivityIndicator size="small" />}
            </>
          ) : (
            <Mono className="text-micro text-faint">Add a route to price this</Mono>
          )}
        </View>
        {strip && (
          <Pressable
            onPress={strip.onPress}
            disabled={!strip.onPress}
            accessibilityRole={strip.onPress ? 'button' : undefined}
            accessibilityLabel={strip.message}
            className="flex-shrink flex-row items-center gap-1"
          >
            <Mono
              className={`text-micro ${strip.tone === 'danger' ? 'text-danger' : 'text-warning'}`}
              numberOfLines={1}
            >
              {strip.message}
            </Mono>
            {strip.onPress && <Icon name="chevronRight" size={13} color={stripColor} />}
          </Pressable>
        )}
      </Animated.View>

      <View className="flex-row gap-2.5">
        <View className="flex-1">
          <Button
            label="Save draft"
            variant="secondary"
            loading={busy === 'draft'}
            disabled={saveDisabled}
            onPress={onSaveDraft}
            fullWidth
          />
        </View>
        <View className="flex-1">
          <Button
            label="Send to client"
            icon="send"
            loading={busy === 'send'}
            disabled={sendDisabled}
            onPress={onSend}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
}

export const QuoteFooterActions = memo(QuoteFooterActionsImpl);

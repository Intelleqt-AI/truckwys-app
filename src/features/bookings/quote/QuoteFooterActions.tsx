import { memo } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useBottomSheetInternal, KEYBOARD_STATUS } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Button, Icon, Mono } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';

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
  priceHint,
  onPriceHintPress,
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
  /** What's still missing before a price can be worked out, e.g. "Pick a client
      to price this" — shown in place of the total while !ready. */
  priceHint: string;
  /** Jumps to the section that fixes priceHint. */
  onPriceHintPress?: () => void;
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
      // 26, not 22: the total is text-callout, whose lineHeight is already 20,
      // and this row is overflow-hidden — 2px of slack meant the OS text-size
      // setting sliced the digits horizontally through the middle. Paired with
      // maxFontSizeMultiplier below, which bounds how far that can go.
      height: withTiming(shown ? 0 : 26, { duration: animatedKeyboardState.value.duration }),
      opacity: withTiming(shown ? 0 : 1, { duration: animatedKeyboardState.value.duration }),
      marginBottom: withTiming(shown ? 0 : 8, { duration: animatedKeyboardState.value.duration }),
    };
  });

  const stripColor = strip?.tone === 'danger' ? '#FF4949' : '#F59E0B';
  // The two above are theme-independent status hues; faint isn't, so the price
  // hint's chevron has to read it off the theme to match its own text colour.
  const { colors } = useTheme();

  return (
    <View>
      <Animated.View
        className="flex-row items-center justify-between gap-2 overflow-hidden"
        style={stripStyle}
      >
        {/* shrink-0 once there's a total to show, not flex-1. flex-1 gave this
            side `flex-basis: 0%` while the strip opposite kept an intrinsic
            basis, so the strip claimed its full width first and the live total —
            the number the whole screen is about — was what got squeezed. Now the
            message truncates instead.
            While !ready this half holds prose, not a number, so it goes back to
            flex-1 and yields: a shrink-0 parent is content-sized, which would
            collapse the flex-1 hint inside it to zero width.
            While a strip is up, this half renders nothing at all (see below) —
            content-sized still applies, so it collapses to ~0 and the row's
            justify-between hands the strip the room it just gave up. */}
        <View className={`flex-row items-center gap-2 ${!strip && !ready ? 'flex-1' : 'shrink-0'}`}>
          {strip ? null : ready ? (
            <>
              <Mono
                className="text-callout font-semibold text-accent"
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                {formatCurrency(total)}
              </Mono>
              {/* strip is already excluded by the branch above; the check here
                  used to be `!strip` on its own but that's now redundant. */}
              {statsTrusted && total > 0 && (
                <Mono className="shrink-0 text-micro text-muted" maxFontSizeMultiplier={1.2}>
                  · {formatPercent(marginPct, 0)} margin
                </Mono>
              )}
              {calculating && <ActivityIndicator size="small" />}
            </>
          ) : (
            // Tappable for the same reason the strip on the right is: the
            // hint itself is generic, but tapping still jumps to the first
            // outstanding gap. Chevron only when there's somewhere to go.
            <Pressable
              onPress={onPriceHintPress}
              disabled={!onPriceHintPress}
              accessibilityRole={onPriceHintPress ? 'button' : undefined}
              accessibilityLabel={priceHint}
              className="flex-1 flex-row items-center gap-1"
            >
              <Mono
                className="flex-shrink text-micro text-faint"
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                {priceHint}
              </Mono>
              {onPriceHintPress && <Icon name="chevronRight" size={13} color={colors.faint} />}
            </Pressable>
          )}
        </View>
        {strip && (
          <Pressable
            onPress={strip.onPress}
            disabled={!strip.onPress}
            accessibilityRole={strip.onPress ? 'button' : undefined}
            accessibilityLabel={strip.message}
            className="min-w-0 flex-shrink flex-row items-center justify-end gap-1"
          >
            {/* One notch smaller than every other footer label (text-nano, not
                text-micro) — this strip carries the longest messages in the
                footer (e.g. the overload warning), and a single 26px line
                still has to fit them next to the chevron. */}
            <Mono
              className={`shrink text-nano ${strip.tone === 'danger' ? 'text-danger' : 'text-warning'}`}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
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

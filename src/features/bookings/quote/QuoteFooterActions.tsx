import { memo, type MutableRefObject } from 'react';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useBottomSheetInternal, KEYBOARD_STATUS } from '@gorhom/bottom-sheet';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Button, Icon, Mono } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { pct } from './CostBreakdownCard';
import { useRollingTotal } from './useRollingTotal';

/**
 * What the price bar offers beside the total, from the pricing analysis: one
 * tap puts a suggested price in the bar ("Use Balanced R 25 100"). Only ever
 * offered from an analysis of exactly the quote's current values.
 */
export type FooterOffer = { kind: 'apply'; label: string; onPress: () => void };

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
  shownTotal,
  marginPct,
  targetMarginPct,
  offer,
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
  /** Owned by the screen, so the rolling total survives this footer remounting
      (gorhom treats the screen's renderFooter as a component type). */
  shownTotal: MutableRefObject<number>;
  /** The quote's margin, for the dot beside "excl. VAT"; null per tonne or unknown. */
  marginPct: number | null;
  targetMarginPct: number;
  /** Pricing analysis offer; null while there is nothing to offer. */
  offer: FooterOffer | null;
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
  // Called here, not inside the showTotal branch, so the roll keeps running
  // while a strip briefly replaces the figure.
  const rolled = useRollingTotal(total, shownTotal);

  // The total used to be suppressed by *any* strip, which hid the price at the
  // one moment the user is watching for it — right after a Send attempt, while
  // they fill in the last few fields. It now survives the warning strip (the
  // "N things left" countdown) and still yields to the danger strips, where a
  // number would contradict the Price section: a suspended subscription, a
  // route company policy refuses, and an overloaded load all replace the cost
  // card with a notice, so quoting a figure next to them would be misleading.
  // total > 0 keeps "R 0" off the row during the sub-second window where
  // `ready` is true but the route call hasn't returned; without a strip that
  // transient state is unchanged (it shows R 0 next to the spinner, as it
  // ships today).
  const showTotal = ready && (!strip || (strip.tone === 'warning' && total > 0));
  // Nothing to say (e.g. a fresh form, before any Save/Send attempt): collapse
  // the row so there's no blank line above the buttons.
  const hasRow = showTotal || !!strip || !!priceHint;

  const stripStyle = useAnimatedStyle(() => {
    const hidden = animatedKeyboardState.value.status === KEYBOARD_STATUS.SHOWN || !hasRow;
    return {
      // 26, not 22: the total is text-callout, whose lineHeight is already 20,
      // and this row is overflow-hidden — 2px of slack meant the OS text-size
      // setting sliced the digits horizontally through the middle. Paired with
      // maxFontSizeMultiplier below, which bounds how far that can go.
      // 60: the price hero is two lines, text-display (30) over text-caption
      // (16) = 46, which is 55 at maxFontSizeMultiplier 1.2. The strip's links
      // are tap targets (≥ 44 pt) and fit inside this too.
      height: withTiming(hidden ? 0 : 60, { duration: animatedKeyboardState.value.duration }),
      opacity: withTiming(hidden ? 0 : 1, { duration: animatedKeyboardState.value.duration }),
      marginBottom: withTiming(hidden ? 0 : 4, { duration: animatedKeyboardState.value.duration }),
    };
  }, [hasRow]);

  // Status hues and faint are theme-aware, so the chevrons read them off the
  // theme to match their own text colours.
  const { colors } = useTheme();
  const stripColor = strip?.tone === 'danger' ? colors.dangerDot : colors.warningDot;
  const marginDot =
    marginPct === null
      ? null
      : marginPct < 0
        ? colors.dangerDot
        : marginPct < targetMarginPct
          ? colors.warningDot
          : colors.successDot;

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
            A warning strip (showTotal true) keeps the total here and shares the
            row with it — see below. A danger strip, or a warning strip before
            the price has landed, renders nothing here at all — content-sized
            still applies, so it collapses to ~0 and the row's justify-between
            hands the strip the room it just gave up. */}
        <View className={`flex-row items-center gap-2 ${!strip && !ready ? 'flex-1' : 'shrink-0'}`}>
          {showTotal ? (
            <View accessible accessibilityLabel={`${formatCurrency(total, { maximumFractionDigits: 0 })}, excluding VAT${marginPct !== null ? `, margin ${pct(marginPct)}` : ''}`}>
              {/* The hero: the price the whole screen is building. Reads the
                  final figure to a screen reader, not the in-between ones. */}
              <Mono
                className="text-display font-semibold text-fg"
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                {formatCurrency(Math.round(rolled), { maximumFractionDigits: 0 })}
              </Mono>
              <View className="flex-row items-center gap-1.5">
                {/* The one price: what the client is sent, excluding VAT. */}
                <Mono className="shrink-0 text-caption text-muted" maxFontSizeMultiplier={1.2}>
                  excl. VAT
                </Mono>
                {marginDot && marginPct !== null && (
                  <>
                    <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: marginDot }} />
                    <Mono className="shrink-0 text-caption text-muted" maxFontSizeMultiplier={1.2}>
                      {pct(marginPct)} margin
                    </Mono>
                  </>
                )}
                {calculating && <ActivityIndicator size="small" color={colors.faint} />}
              </View>
            </View>
          ) : strip ? null : (
            // Tappable for the same reason the strip on the right is: the
            // hint itself is generic, but tapping still jumps to the first
            // outstanding gap. Chevron only when there's somewhere to go.
            <TouchableOpacity
              onPress={onPriceHintPress}
              disabled={!onPriceHintPress}
              activeOpacity={0.6}
              accessibilityRole={onPriceHintPress ? 'button' : undefined}
              accessibilityLabel={priceHint}
              className="min-h-[44px] flex-1 flex-row items-center gap-1"
            >
              <Mono
                className="flex-shrink text-caption text-faint"
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                {priceHint}
              </Mono>
              {onPriceHintPress && <Icon name="chevronRight" size={13} color={colors.faint} />}
            </TouchableOpacity>
          )}
        </View>
        {!strip && showTotal && offer && <OfferAction offer={offer} />}
        {strip && (
          <TouchableOpacity
            onPress={strip.onPress}
            disabled={!strip.onPress}
            activeOpacity={0.6}
            accessibilityRole={strip.onPress ? 'button' : undefined}
            accessibilityLabel={strip.message}
            className="min-h-[44px] min-w-0 flex-shrink flex-row items-center justify-end gap-1"
          >
            {/* This strip carries the longest messages in the footer (e.g. the
                overload warning); they truncate to a single 26px line next to
                the chevron. */}
            <Mono
              className={`shrink text-caption ${strip.tone === 'danger' ? 'text-danger' : 'text-warning'}`}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {strip.message}
            </Mono>
            {strip.onPress && <Icon name="chevronRight" size={13} color={stripColor} />}
          </TouchableOpacity>
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
        {/* Send is the primary (ink) action; Save draft beside it is the outline. */}
        <View className="flex-[1.6]">
          <Button
            label="Send"
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

/** The pricing analysis' one-line action beside the total. */
function OfferAction({ offer }: { offer: FooterOffer }) {
  const { colors } = useTheme();
  const text = offer.label;
  return (
    <TouchableOpacity
      onPress={offer.onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={text}
      hitSlop={{ left: 8, right: 4 }}
      className="min-h-[44px] min-w-0 shrink flex-row items-center justify-end gap-1"
    >
      <Mono className="shrink text-caption text-link" numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {text}
      </Mono>
      <Icon name="chevronRight" size={13} color={colors.link} />
    </TouchableOpacity>
  );
}

export const QuoteFooterActions = memo(QuoteFooterActionsImpl);

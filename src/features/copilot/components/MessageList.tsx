import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Mono, Icon } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { UserBubble } from './UserBubble';
import { AssistantMessage } from './AssistantMessage';
import type { LiveStatus } from './LiveTurn';
import type { NavigateFn } from '../markdown/Markdown';
import type { Msg, Proposal } from '../types';

// The transcript.
//
// Autoscroll is native, via maintainVisibleContentPosition — NOT a scrollToEnd
// on a timer. FlashList only follows the bottom while the user is already near
// it and stops the moment they scroll up, which is the "don't fight the user"
// behaviour, and it costs no JS while the reveal is ticking.

// A zero-height placeholder row, used ONLY to make FlashList's data non-empty
// for a new conversation's first turn. startRenderingFromBottom (below) is
// gated on data.length > 0, not on header/footer measured height, so with a
// real empty conversation the live turn (rendered via `footer`, not as a row
// — see LiveTurn.tsx) would otherwise render pinned to the top and then snap
// to the bottom the instant the first real messages land. This anchor never
// carries any reveal state and is never recycled into a real message row.
const PENDING_ANCHOR_KEY = '__pending-anchor__';
type ListItem = Msg | { key: typeof PENDING_ANCHOR_KEY };
const isAnchor = (item: ListItem): item is { key: typeof PENDING_ANCHOR_KEY } =>
  item.key === PENDING_ANCHOR_KEY;

export function MessageList({
  messages,
  footer,
  header,
  pendingStatus,
  onNavigate,
  proposalBusy,
  onConfirmProposal,
  onDismissProposal,
}: {
  messages: Msg[];
  footer?: React.ReactElement | null;
  header?: React.ReactElement | null;
  // Drives the two effects below — a separate signal from `footer` because
  // `footer`'s own identity changes on every render and can't be used to
  // detect "a new turn just started" vs. "still the same turn re-rendering".
  pendingStatus?: LiveStatus;
  onNavigate?: NavigateFn;
  proposalBusy?: boolean;
  onConfirmProposal: (p: Proposal) => void;
  onDismissProposal: (p: Proposal) => void;
}) {
  const { colors } = useTheme();
  const listRef = useRef<FlashListRef<ListItem>>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  const data: ListItem[] =
    messages.length === 0 && pendingStatus != null ? [{ key: PENDING_ANCHOR_KEY }] : messages;

  // The only place `awayFromBottom` is ever cleared — deterministically, at
  // the moment WE scroll to bottom, rather than waiting on a scroll event to
  // notice it. A programmatic scrollToEnd fires onScroll-like events too, so
  // inferring "at the bottom" from those instead would let our own calls
  // below mistake their own animation lag (content still growing mid-flight)
  // for the user having scrolled away — which is exactly what used to leave
  // the transcript stuck mid-response on longer replies.
  const scrollToBottom = useCallback((animated: boolean) => {
    listRef.current?.scrollToEnd({ animated });
    setAwayFromBottom(false);
  }, []);

  // The user's own message should always scroll fully into view, regardless
  // of maintainVisibleContentPosition's near-bottom threshold below — that
  // threshold exists to avoid fighting the user when THEY scrolled up to
  // read history, not to hide what they just sent.
  useEffect(() => {
    if (pendingStatus === 'sending') {
      scrollToBottom(true);
    }
  }, [pendingStatus, scrollToBottom]);

  // The sole scroll driver during the reveal. FlashList's own native follow
  // is deliberately disabled below for exactly this window (autoscrollToBottomThreshold:
  // undefined while revealing) — it can silently stop following partway
  // through a fast reveal (confirmed in useBoundDetection.js: it only
  // recomputes "near bottom" on a native onScroll event, and an instant,
  // non-animated scrollToEnd doesn't always reliably produce one), and
  // running this alongside it is what caused the jump fixed in an earlier
  // round. With that native mechanism off, this is the only thing moving
  // the list, so there's nothing left to collide with.
  useEffect(() => {
    if (pendingStatus !== 'revealing') return;
    const id = setInterval(() => {
      if (!awayFromBottom) scrollToBottom(true);
    }, 400);
    return () => clearInterval(id);
  }, [pendingStatus, awayFromBottom, scrollToBottom]);

  // One authoritative final scroll when a turn actually settles.
  // maintainVisibleContentPosition's native follow below is best-effort
  // while content is still growing — a long/fast reply can outpace it, so
  // without this the view is left wherever it last managed to track instead
  // of the true bottom. Deferred a frame: this fires the instant `data`
  // swaps the footer's revealed content for the two real settled messages,
  // which may not be measured by the native side yet.
  const prevStatus = useRef<LiveStatus | undefined>(undefined);
  useEffect(() => {
    if (prevStatus.current != null && pendingStatus == null && !awayFromBottom) {
      requestAnimationFrame(() => scrollToBottom(true));
    }
    prevStatus.current = pendingStatus;
  }, [pendingStatus, awayFromBottom, scrollToBottom]);

  // Only set true at a genuine scroll-settle point that follows an actual
  // user drag (a release with no momentum, or the end of a fling) — never
  // from the continuous onScroll stream, which can't tell a real user swipe
  // apart from our own programmatic scrollToEnd calls above still catching
  // up to fast-growing content.
  const checkAwayFromBottom = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setAwayFromBottom(distance > 220);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) =>
      isAnchor(item) ? null : item.role === 'user' ? (
        <UserBubble text={item.content} />
      ) : (
        <AssistantMessage
          msg={item}
          onNavigate={onNavigate}
          proposalBusy={proposalBusy}
          onConfirmProposal={onConfirmProposal}
          onDismissProposal={onDismissProposal}
        />
      ),
    [onNavigate, proposalBusy, onConfirmProposal, onDismissProposal],
  );

  return (
    <View className="flex-1">
      <FlashList
        ref={listRef}
        data={data}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        onScrollEndDrag={checkAwayFromBottom}
        onMomentumScrollEnd={checkAwayFromBottom}
        maintainVisibleContentPosition={{
          // Disabled during the reveal itself — see the comment on the
          // interval effect above for why: this native mechanism can
          // silently stop following mid-reveal, and running it alongside an
          // explicit driver is what caused the jump fixed in an earlier
          // round. Omitting it (rather than 0) is what disables it —
          // confirmed in useBoundDetection.js: it defaults to -1
          // internally, and checkBounds() then no-ops every time since this
          // app passes no onEndReached/onStartReached.
          autoscrollToBottomThreshold: pendingStatus === 'revealing' ? undefined : 0.4,
          // Animating this while the reveal commits ~30×/sec queues and jitters.
          animateAutoScrollToBottom: false,
          startRenderingFromBottom: true,
        }}
      />

      {awayFromBottom && (
        <Pressable
          onPress={() => scrollToBottom(true)}
          accessibilityRole="button"
          accessibilityLabel="Jump to latest"
          className="absolute self-center rounded-pill border border-line bg-surface px-3 py-1.5 active:opacity-70"
          style={{ bottom: 12 }}
        >
          <View className="flex-row items-center gap-1.5">
            <Mono className="text-micro tracking-wide uppercase text-muted">Latest</Mono>
            <Icon name="chevronDown" size={13} color={colors.muted} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

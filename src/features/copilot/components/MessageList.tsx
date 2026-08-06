import { useCallback, useRef, useState } from 'react';
import { View, Pressable, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Mono, Icon } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { UserBubble } from './UserBubble';
import { AssistantMessage } from './AssistantMessage';
import type { NavigateFn } from '../markdown/Markdown';
import type { Msg, Proposal } from '../types';

// The transcript.
//
// Autoscroll is native, via maintainVisibleContentPosition — NOT a scrollToEnd
// on a timer. FlashList only follows the bottom while the user is already near
// it and stops the moment they scroll up, which is the "don't fight the user"
// behaviour, and it costs no JS while the reveal is ticking.

export function MessageList({
  messages,
  footer,
  header,
  onNavigate,
  proposalBusy,
  onConfirmProposal,
  onDismissProposal,
}: {
  messages: Msg[];
  footer?: React.ReactElement | null;
  header?: React.ReactElement | null;
  onNavigate?: NavigateFn;
  proposalBusy?: boolean;
  onConfirmProposal: (p: Proposal) => void;
  onDismissProposal: (p: Proposal) => void;
}) {
  const { colors } = useTheme();
  const listRef = useRef<FlashListRef<Msg>>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setAwayFromBottom(distance > 220);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Msg }) =>
      item.role === 'user' ? (
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
        data={messages}
        keyExtractor={(m) => m.key}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={64}
        maintainVisibleContentPosition={{
          // ~10% of the viewport: scrolled up further than that and following stops.
          autoscrollToBottomThreshold: 0.1,
          // Animating this while the reveal commits ~30×/sec queues and jitters.
          animateAutoScrollToBottom: false,
          startRenderingFromBottom: true,
        }}
      />

      {awayFromBottom && (
        <Pressable
          onPress={() => listRef.current?.scrollToEnd({ animated: true })}
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

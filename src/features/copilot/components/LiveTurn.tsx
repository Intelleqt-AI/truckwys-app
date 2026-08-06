import { View, Pressable } from 'react-native';
import { Txt, Mono, Icon } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { UserBubble } from './UserBubble';
import { TypingDots } from './TypingDots';
import { RevealingMessage } from './RevealingMessage';
import type { NavigateFn } from '../markdown/Markdown';

// The turn in flight, rendered as the list's footer rather than as a row.
//
// FlashList recycles row component instances, so a row that owned a ticking
// reveal cursor would carry that state into a different message. Keeping the live
// turn in the footer also means the list `data` changes exactly twice per turn
// and never once during the animation.

export type LiveStatus = 'sending' | 'revealing' | 'error';

export interface PendingTurn {
  userText: string;
  status: LiveStatus;
  reply?: string;
  error?: string;
}

export function LiveTurn({
  turn,
  onNavigate,
  onRevealDone,
  onRetry,
}: {
  turn: PendingTurn;
  onNavigate?: NavigateFn;
  onRevealDone: () => void;
  onRetry: (text: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <View>
      <UserBubble text={turn.userText} />

      {turn.status === 'sending' && <TypingDots />}

      {turn.status === 'revealing' && turn.reply != null && (
        <RevealingMessage content={turn.reply} onNavigate={onNavigate} onDone={onRevealDone} />
      )}

      {turn.status === 'error' && (
        <View className="mt-1 rounded-xs border border-line bg-surface px-3.5 py-3">
          <View className="flex-row items-start gap-2">
            <Icon name="alert" size={14} color={colors.muted} />
            <Txt className="flex-1 text-callout text-muted">
              {turn.error ?? 'Something went wrong reaching the copilot.'}
            </Txt>
          </View>
          {/* Web has no retry here and leaves the message stranded with no reply
              and nothing to tap. */}
          <Pressable
            onPress={() => onRetry(turn.userText)}
            accessibilityRole="button"
            className="mt-2.5 self-start rounded-xs border border-accent px-2.5 py-1.5 active:opacity-60"
          >
            <Mono className="text-micro tracking-wide uppercase text-accent">Retry</Mono>
          </Pressable>
        </View>
      )}
    </View>
  );
}

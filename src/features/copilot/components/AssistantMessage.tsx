import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { Txt, Mono, Icon } from '@/components/ui';
import { status as statusHues } from '@/theme/tokens';
import { parseBlocks } from '../markdown/parseBlocks';
import { Markdown, type NavigateFn } from '../markdown/Markdown';
import { ActionChips } from './ActionChips';
import { ProposalCard } from './ProposalCard';
import type { Msg, Proposal } from '../types';

// A settled assistant turn.
//
// Full width with no bubble, unlike the user's message. Two reasons: a table's
// horizontal scroll container needs a bounded width from its parent, and a
// content-sized `max-w-[86%]` bubble would instead be stretched by the table's
// intrinsic width. It also reads the way the apps this was modelled on do.

export const AssistantMessage = memo(function AssistantMessage({
  msg,
  onNavigate,
  proposalBusy,
  onConfirmProposal,
  onDismissProposal,
}: {
  msg: Msg;
  onNavigate?: NavigateFn;
  proposalBusy?: boolean;
  onConfirmProposal?: (p: Proposal) => void;
  onDismissProposal?: (p: Proposal) => void;
}) {
  const blocks = useMemo(() => parseBlocks(msg.content), [msg.content]);

  return (
    <View className="py-1">
      {blocks.length > 0 ? (
        <Markdown blocks={blocks} onNavigate={onNavigate} />
      ) : (
        <Txt className="text-body text-muted">Done.</Txt>
      )}

      {msg.degraded && (
        <View className="mt-1.5 flex-row items-start gap-1.5">
          <Icon name="alert" size={12} color={statusHues.warning} />
          <Mono className="flex-1 text-micro" style={{ color: statusHues.warning }}>
            Rules engine — AI is unavailable, so this answer is basic. Try again shortly.
          </Mono>
        </View>
      )}

      {msg.proposal && onConfirmProposal && onDismissProposal && (
        <ProposalCard
          proposal={msg.proposal}
          busy={proposalBusy}
          onConfirm={() => onConfirmProposal(msg.proposal!)}
          onDismiss={() => onDismissProposal(msg.proposal!)}
        />
      )}

      <ActionChips actions={msg.actions} />
    </View>
  );
});

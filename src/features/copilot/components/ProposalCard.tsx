import { View } from 'react-native';
import { Txt, Mono, Label, Icon, Badge, Button } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { Proposal } from '../types';
import { OPERATION_TONE, STATUS_CHIP, toneText } from './proposalTone';

// A confirm-first write the agent has drafted.
//
// The client never supplies an endpoint or a payload — the proposal id is the
// whole contract, and the server re-checks the caller's role before executing.
// Confirm/Dismiss show only while the status is `pending`; every other state is
// an inert chip, because a proposal can be acted on exactly once and may have
// been acted on from another device.

export function ProposalCard({
  proposal,
  busy,
  onConfirm,
  onDismiss,
}: {
  proposal: Proposal;
  busy?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const pending = proposal.status === 'pending';
  const operationTone = OPERATION_TONE[proposal.operation] ?? 'info';
  const operationLabel =
    proposal.operation.charAt(0).toUpperCase() + proposal.operation.slice(1).toLowerCase();

  return (
    <View
      className="mt-3 rounded-card border bg-surface"
      style={{ borderColor: pending ? colors.lineStrong : colors.line }}
    >
      <View className="flex-row items-center gap-2 px-3.5 pt-3">
        <Badge label={operationLabel} tone={operationTone} dot />
        <Txt className="flex-1 text-callout font-semibold text-fg">{proposal.label}</Txt>
      </View>

      {!!proposal.warning && (
        <View className="mx-3.5 mt-3 flex-row gap-2 rounded-chip bg-surface-hover p-2.5">
          <Icon name="alert" size={14} color={colors.warningDot} />
          <Txt className="flex-1 text-caption" style={{ color: colors.warning }}>
            {proposal.warning}
          </Txt>
        </View>
      )}

      {(proposal.priceWarnings ?? []).map((w) => (
        <View key={w.code + w.title} className="mx-3.5 mt-3 flex-row gap-2 rounded-chip bg-surface-hover p-2.5">
          <Icon name="alert" size={14} color={w.severity === 'block' ? colors.dangerDot : colors.warningDot} />
          <Txt className="flex-1 text-caption" style={{ color: w.severity === 'block' ? colors.danger : colors.warning }}>
            {w.detail ? `${w.title.replace(/\.$/, '')}. ${w.detail}` : w.title}
          </Txt>
        </View>
      ))}

      {!!proposal.analysisSummary && (
        <View className="mx-3.5 mt-3 rounded-chip border border-line p-2.5">
          <Label className="mb-1 text-faint">Analysis</Label>
          <Txt className="text-caption text-muted">{proposal.analysisSummary}</Txt>
        </View>
      )}

      {proposal.fields.length > 0 && (
        <View className="mt-3">
          {proposal.fields.map((f, i) => (
            <View
              key={`${f.label}:${i}`}
              className="flex-row items-start justify-between gap-3 border-t border-line-row px-3.5 py-2"
            >
              <Txt className="flex-1 text-caption text-muted">{f.label}</Txt>
              <View className="flex-1 items-end">
                {f.oldValue != null && f.oldValue !== f.value && (
                  <Mono
                    className="text-caption text-faint"
                    style={{ textDecorationLine: 'line-through' }}
                  >
                    {f.oldValue}
                  </Mono>
                )}
                <Mono className="text-caption text-fg" style={{ textAlign: 'right' }}>
                  {f.value || '—'}
                </Mono>
              </View>
            </View>
          ))}
        </View>
      )}

      <View className="border-t border-line px-3.5 py-2.5">
        {pending ? (
          <View className="flex-row gap-2.5">
            <Button
              label={
                proposal.sends
                  ? proposal.requiresAcknowledgement
                    ? 'Send anyway'
                    : 'Send'
                  : proposal.requiresAcknowledgement
                    ? `${proposal.confirmText} anyway`
                    : proposal.confirmText
              }
              icon="check"
              loading={busy}
              onPress={onConfirm}
              className="flex-1"
            />
            <Button
              label="Dismiss"
              variant="secondary"
              disabled={busy}
              onPress={onDismiss}
              className="flex-1"
            />
          </View>
        ) : (
          <Settled proposal={proposal} />
        )}
      </View>
    </View>
  );
}

/** The inert state chip. `failed` also shows the server's reason. */
function Settled({ proposal }: { proposal: Proposal }) {
  const { colors } = useTheme();
  const chip = STATUS_CHIP[proposal.status] ?? { text: proposal.status, tone: 'neutral' as const };
  // SEND is "Sent", everything else is "Saved" — matching the web wording.
  const text =
    proposal.status === 'executed' && proposal.operation === 'SEND' ? '✓ Sent' : chip.text;
  return (
    <View>
      <Mono className="text-caption font-medium" style={{ color: toneText(chip.tone, colors) }}>
        {text}
      </Mono>
      {!!proposal.result?.error && (
        <Txt className="mt-1 text-caption" style={{ color: colors.danger }}>
          {proposal.result.error}
        </Txt>
      )}
      {!!proposal.result?.number && (
        <Mono className="mt-1 text-caption text-muted">{proposal.result.number}</Mono>
      )}
    </View>
  );
}


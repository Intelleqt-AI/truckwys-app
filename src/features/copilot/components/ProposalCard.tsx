import { View, Pressable, ActivityIndicator } from 'react-native';
import { Txt, Mono, Label, Icon } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';
import type { Proposal } from '../types';
import { OPERATION_TONE, STATUS_CHIP, toneHue } from './proposalTone';

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
  const toneColor = toneHue(OPERATION_TONE[proposal.operation] ?? 'info');

  return (
    <View
      className="mt-3 rounded-xs border bg-surface"
      style={{ borderColor: pending ? colors.accent : colors.line }}
    >
      <View className="flex-row items-center gap-2 px-3.5 pt-3">
        <View
          className="rounded-xs px-1.5 py-0.5"
          style={{ backgroundColor: toneColor + '22', borderWidth: 1, borderColor: toneColor }}
        >
          <Mono className="text-micro tracking-wide uppercase" style={{ color: toneColor }}>
            {proposal.operation}
          </Mono>
        </View>
        <Txt className="flex-1 text-callout font-semibold text-fg">{proposal.label}</Txt>
      </View>

      {!!proposal.warning && (
        <View className="mx-3.5 mt-3 flex-row gap-2 rounded-xs bg-surface-hover p-2.5">
          <Icon name="alert" size={14} color={statusHues.warning} />
          <Txt className="flex-1 text-caption" style={{ color: statusHues.warning }}>
            {proposal.warning}
          </Txt>
        </View>
      )}

      {!!proposal.analysisSummary && (
        <View className="mx-3.5 mt-3 rounded-xs border border-line p-2.5">
          <Label className="mb-1 text-faint">AI analysis</Label>
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
          <View className="flex-row gap-2.5" style={{ opacity: busy ? 0.6 : 1 }}>
            <Pressable
              disabled={busy}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!busy }}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xs bg-accent py-2.5 active:opacity-70"
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <Icon name="check" size={15} color={colors.onAccent} />
              )}
              <Mono className="text-micro tracking-wide uppercase text-on-accent">
                {proposal.confirmText}
              </Mono>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!busy }}
              className="flex-1 items-center justify-center rounded-xs border border-line py-2.5 active:opacity-70"
            >
              <Mono className="text-micro tracking-wide uppercase text-muted">Dismiss</Mono>
            </Pressable>
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
  const chip = STATUS_CHIP[proposal.status] ?? { text: proposal.status, tone: 'neutral' as const };
  // SEND is "Sent", everything else is "Saved" — matching the web wording.
  const text =
    proposal.status === 'executed' && proposal.operation === 'SEND' ? '✓ Sent' : chip.text;
  return (
    <View>
      <Mono className="text-micro tracking-wide uppercase" style={{ color: toneHue(chip.tone) }}>
        {text}
      </Mono>
      {!!proposal.result?.error && (
        <Txt className="mt-1 text-caption" style={{ color: statusHues.danger }}>
          {proposal.result.error}
        </Txt>
      )}
      {!!proposal.result?.number && (
        <Mono className="mt-1 text-caption text-muted">{proposal.result.number}</Mono>
      )}
    </View>
  );
}


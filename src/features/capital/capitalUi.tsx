import { View } from 'react-native';
import { Badge, DetailRow, Group, Mono, Txt, type Tone } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCurrency, formatDate, formatDateTime, formatPercent } from '@/lib/formatters';
import type { AdvanceStatus, Decision, Offer, Reason } from '@/lib/capital/types';

// Small shared pieces for the Fast Pay screens: chips, reasons and the offer
// breakdown. They only format server values; nothing here derives a fee or an
// advance. Port of the web's components/capital/capitalUi.tsx.

const MISSING = '—';

export const money = (v: number | null | undefined) =>
  v == null || Number.isNaN(Number(v)) ? MISSING : formatCurrency(v);
export const day = (d: string | null | undefined) => (d ? formatDate(d) : MISSING);
export const dayTime = (d: string | null | undefined) => (d ? formatDateTime(d) : MISSING);
export const pct = (v: number | null | undefined, decimals = 1) =>
  v == null ? MISSING : formatPercent(v, decimals);

export const PROVIDER = 'an independent finance provider';
export const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const DECISION: Record<Decision, { tone: Tone; label: string }> = {
  FUND: { tone: 'success', label: 'Fund' },
  PART_FUND: { tone: 'info', label: 'Part now, rest queued' },
  QUEUE: { tone: 'neutral', label: 'Queued' },
  REFER: { tone: 'warning', label: 'Needs review' },
  DECLINE: { tone: 'danger', label: 'Not eligible' },
};

export function DecisionChip({ decision }: { decision: Decision }) {
  const m = DECISION[decision] ?? { tone: 'neutral' as Tone, label: decision };
  return <Badge label={m.label} tone={m.tone} dot />;
}

const ADVANCE_TONE: Record<AdvanceStatus, Tone> = {
  ELIGIBLE: 'neutral',
  QUEUED: 'neutral',
  REQUESTED: 'info',
  SCORING: 'info',
  APPROVED: 'info',
  DISBURSED: 'success',
  SETTLED: 'success',
  DENIED: 'danger',
  CANCELLED: 'neutral',
  BOUGHT_BACK: 'warning',
  WRITTEN_OFF: 'danger',
};

/** The server's status label, toned by status. */
export function AdvanceChip({ status, label }: { status: AdvanceStatus; label: string }) {
  return <Badge label={label || status} tone={ADVANCE_TONE[status] ?? 'neutral'} dot />;
}

/** Requests that are still moving; the rest are history. */
export const LIVE_STATUSES: AdvanceStatus[] = ['QUEUED', 'REQUESTED', 'SCORING', 'APPROVED', 'DISBURSED'];

/**
 * Why a decision came out as it did, in the transporter wording the server
 * allows: "+" helps, "−" holds back, "!" needs attention.
 */
export function ReasonList({ reasons, compact }: { reasons: Reason[] | undefined; compact?: boolean }) {
  const { colors } = useTheme();
  if (!reasons?.length) return null;
  const tint = (d: Reason['direction']) => (d === '+' ? colors.success : d === '!' ? colors.danger : colors.warning);
  return (
    <View className={compact ? 'gap-1' : 'gap-2'}>
      {reasons.map((r, i) => (
        <View key={`${r.code}-${i}`} className="flex-row items-start gap-2">
          <Mono
            className="w-4 text-center text-sub font-semibold"
            style={{ color: tint(r.direction) }}
            accessibilityLabel={r.direction === '+' ? 'Helps' : r.direction === '-' ? 'Holds back' : 'Needs attention'}
          >
            {r.direction === '-' ? '−' : r.direction}
          </Mono>
          <Txt className={`flex-1 ${compact ? 'text-caption' : 'text-sub'} text-fg`}>{r.text}</Txt>
        </View>
      ))}
    </View>
  );
}

/**
 * What the transporter gets from one offer, in order: now, the cost, later.
 * VAT is shown on the platform-fee part only, as the server computes it.
 */
export function OfferBreakdown({ offer }: { offer: Offer }) {
  const hasFee = offer.fee_amount > 0 || offer.fee_vat_amount > 0;
  return (
    <Group label="What you get">
      <DetailRow label="Invoice balance" value={money(offer.invoice_balance)} />
      <DetailRow
        label="Advance now"
        hint={`${pct(offer.advance_rate_pct)} of the balance${offer.queued_amount > 0 ? ', within your available line' : ''}`}
        value={money(offer.fundable_amount)}
      />
      {hasFee && (
        <DetailRow
          label="Fee"
          hint={`${pct(offer.fee_pct, 2)} of the advance, excl. VAT`}
          value={`−${money(offer.fee_amount)}`}
        />
      )}
      {offer.fee_vat_amount > 0 && (
        <DetailRow label="VAT on the platform fee" value={`−${money(offer.fee_vat_amount)}`} />
      )}
      <View className="flex-row items-center justify-between gap-4 bg-surface-hover px-3.5 py-3.5">
        <Txt className="text-callout font-semibold text-fg">You receive now</Txt>
        <Mono className="text-heading font-semibold text-fg">{money(offer.net_payout)}</Mono>
      </View>
      {offer.queued_amount > 0 && (
        <DetailRow label="Queued for later" hint="Advanced when the line has room" value={money(offer.queued_amount)} />
      )}
      <DetailRow
        label="Holdback"
        hint="Paid to you when your customer pays, less any deductions"
        value={money(offer.holdback_amount)}
      />
      <DetailRow label="Expected customer payment" value={day(offer.expected_payment_date)} last />
    </Group>
  );
}

/** "Fast Pay is provided by {provider}, who approves each advance. TruckWys is not a lender." */
export function ProviderNote({ provider }: { provider: string }) {
  return (
    <Txt className="text-caption text-faint">
      Fast Pay is provided by {provider}, who approves each advance. TruckWys is not a lender.
    </Txt>
  );
}

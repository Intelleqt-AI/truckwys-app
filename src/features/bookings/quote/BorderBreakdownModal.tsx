import { memo } from 'react';
import { View } from 'react-native';
import { Label, Mono, Txt } from '@/components/ui';
import { num, pick, str } from '@/lib/api/list';
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';
import { BreakdownModal, type BreakdownEdit, type BreakdownRow } from './BreakdownModal';
import type { CostBreakdown } from './costs';

/** "Published" / "Estimate" / "Unverified" / "Agent estimate". */
export function borderLabel(
  i: Record<string, unknown>,
  agentFeeTyped = false,
): { text: string; tone: 'ok' | 'estimate' } {
  if (/agent/i.test(str(i.code))) return agentFeeTyped ? { text: 'Your fee', tone: 'ok' } : { text: 'Agent estimate', tone: 'estimate' };
  const label = str(i.label).toLowerCase();
  if (label === 'unverified') return { text: 'Unverified', tone: 'estimate' };
  if (i.verified === true || label === 'published') return { text: 'Published', tone: 'ok' };
  return { text: 'Estimate', tone: 'estimate' };
}

/** "Zimborders · as of 1 Apr 2026 · US$ 221 at R 16,64 (rate as of 8 Oct 2026)". */
export function borderDetail(i: Record<string, unknown>): string {
  const parts: string[] = [];
  const source = str(i.source);
  if (source) parts.push(source);
  const asOf = str(i.as_of);
  if (asOf) parts.push(`as of ${formatDate(asOf)}`);
  const fx = (i.fx && typeof i.fx === 'object' ? i.fx : null) as Record<string, unknown> | null;
  const cur = str(i.currency).toUpperCase();
  if (cur && cur !== 'ZAR' && i.amount_foreign != null) {
    // The rate at the precision the server gives (R 16,6391; R 0,25608).
    const rate = fx
      ? str(fx.zar_per_unit_text)
        ? `R ${str(fx.zar_per_unit_text)}`
        : fx.zar_per_unit != null
          ? `R ${String(fx.zar_per_unit).replace('.', ',')}`
          : ''
      : '';
    const when = fx && fx.is_fallback === true && str(fx.as_of) ? ` (rate as of ${formatDate(str(fx.as_of))})` : '';
    parts.push(`${cur} ${formatNumber(num(i.amount_foreign))}${rate ? ` at ${rate}` : ''}${when}`);
  }
  const detail = str(i.detail);
  if (detail) parts.push(detail);
  return parts.join(' · ');
}

function ComponentList({
  title,
  items,
  agentFeeTyped,
  agentFeeValue,
}: {
  title?: string;
  items: Record<string, unknown>[];
  agentFeeTyped?: boolean;
  /** The typed fee: shown on the agent row (the route isn't re-run for it). */
  agentFeeValue?: number | null;
}) {
  return (
    <View className={title ? 'mt-3' : ''}>
      {title ? <Label className="mb-1 text-faint">{title}</Label> : null}
      {items.map((i, n) => {
        const tag = borderLabel(i, agentFeeTyped);
        const detail = borderDetail(i);
        return (
          <View key={`${str(i.code)}-${n}`} className="min-h-[44px] flex-row items-center justify-between gap-3 border-b border-line-row py-1.5">
            <View className="shrink">
              <Txt className="text-sub text-fg" numberOfLines={2}>
                {str(pick(i, ['description']), 'Charge')}
              </Txt>
              <Txt className="text-caption">
                <Txt className={`text-caption ${tag.tone === 'ok' ? 'text-success' : 'text-warning'}`}>{tag.text}</Txt>
                {detail ? <Txt className="text-caption text-faint">{` · ${detail}`}</Txt> : null}
              </Txt>
            </View>
            <Mono className="shrink-0 text-sub text-fg">
              {formatCurrency(
                agentFeeTyped && agentFeeValue != null && /agent/i.test(str(i.code)) ? agentFeeValue : num(pick(i, ['amount'])),
              )}
            </Mono>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Border fees, one line per component (crossings, permit, transit fees, tolls,
 * the clearing agent), each saying whether it is a published tariff or an
 * estimate, its source, as-of date and currency rate. Falls back to the three
 * bucket totals for an older route response. The agent's fee can be typed.
 */
function BorderBreakdownModalImpl({
  visible,
  onClose,
  costs,
  edit,
  agentEdit,
  agentFeeTyped,
  agentFeeValue,
}: {
  visible: boolean;
  onClose: () => void;
  costs: CostBreakdown;
  /** Border costs for all legs, typed on this quote. */
  edit?: BreakdownEdit | null;
  /** The clearing agent's fee for this quote (when the route has one). */
  agentEdit?: BreakdownEdit | null;
  /** The person typed their agent's fee: the agent row is "Your fee". */
  agentFeeTyped?: boolean;
  agentFeeValue?: number | null;
}) {
  const items = costs.crossBorderBreakdown.filter((i) => num(pick(i, ['amount'])) > 0);
  const rows: BreakdownRow[] = items.length
    ? []
    : [
        { label: 'Border fees', v: costs.borderFees },
        { label: 'Weighbridges', v: costs.weighbridgeFees },
        { label: 'Non-SA tolls', v: costs.nonSaTolls },
      ]
        .filter((r) => r.v > 0)
        .map((r) => ({ label: r.label, value: formatCurrency(r.v) }));
  const back = costs.returnBorderBreakdown.filter((i) => num(pick(i, ['amount'])) > 0);
  if (!items.length && !rows.length) rows.push({ label: 'Charges', value: costs.borderMissing ? 'Not worked out' : 'None', tone: costs.borderMissing ? 'danger' : undefined });
  if (costs.legs === 2 && !back.length && (items.length || rows.length)) rows.push({ label: 'Legs', value: '× 2' });
  return (
    <BreakdownModal
      visible={visible}
      onClose={onClose}
      title="Border fees"
      rows={rows}
      total={{
        label: 'Border fees',
        value: costs.borderMissing ? '—' : formatCurrency(costs.crossBorderCost),
        tone: costs.borderMissing ? 'danger' : undefined,
      }}
      edit={agentEdit ?? edit}
    >
      {items.length > 0 && (
        <ComponentList title={back.length ? 'Out' : undefined} items={items} agentFeeTyped={agentFeeTyped} agentFeeValue={agentFeeValue} />
      )}
      {back.length > 0 && (
        <ComponentList title={costs.legs === 2 ? 'Back' : 'Back, empty'} items={back} agentFeeTyped={agentFeeTyped} agentFeeValue={agentFeeValue} />
      )}
    </BreakdownModal>
  );
}

export const BorderBreakdownModal = memo(BorderBreakdownModalImpl);

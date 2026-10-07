import { memo } from 'react';
import { num, pick, str } from '@/lib/api/list';
import { formatCurrency } from '@/lib/formatters';
import { BreakdownModal, type BreakdownEdit, type BreakdownRow } from './BreakdownModal';
import type { CostBreakdown } from './costs';

/**
 * Cross-border charges, one way: the backend's named items (each crossing, the
 * amortised permit, weighbridges, non-SA tolls), else its three bucket totals
 * for a route response cached before the itemised list shipped.
 */
function BorderBreakdownModalImpl({
  visible,
  onClose,
  costs,
  edit,
}: {
  visible: boolean;
  onClose: () => void;
  costs: CostBreakdown;
  /** Border costs for all legs, typed on this quote. */
  edit?: BreakdownEdit | null;
}) {
  const items = costs.crossBorderBreakdown.filter((i) => num(pick(i, ['amount'])) > 0);
  const rows: BreakdownRow[] = items.length
    ? items.map((i) => ({ label: str(pick(i, ['description']), 'Charge'), value: formatCurrency(num(pick(i, ['amount']))) }))
    : [
        { label: 'Border fees', v: costs.borderFees },
        { label: 'Weighbridges', v: costs.weighbridgeFees },
        { label: 'Non-SA tolls', v: costs.nonSaTolls },
      ]
        .filter((r) => r.v > 0)
        .map((r) => ({ label: r.label, value: formatCurrency(r.v) }));
  if (costs.legs === 2 && rows.length) rows.push({ label: 'Legs', value: '× 2' });
  return (
    <BreakdownModal
      visible={visible}
      onClose={onClose}
      title="Border, one way"
      rows={rows.length ? rows : [{ label: 'Charges', value: costs.borderMissing ? 'Not worked out' : 'None', tone: costs.borderMissing ? 'danger' : undefined }]}
      total={{
        label: 'Border',
        value: costs.borderMissing ? '—' : formatCurrency(costs.crossBorderCost),
        tone: costs.borderMissing ? 'danger' : undefined,
      }}
      edit={edit}
    />
  );
}

export const BorderBreakdownModal = memo(BorderBreakdownModalImpl);

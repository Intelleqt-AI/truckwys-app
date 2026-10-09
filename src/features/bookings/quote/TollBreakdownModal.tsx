import { memo } from 'react';
import { num, pick, str } from '@/lib/api/list';
import { formatCurrency } from '@/lib/formatters';
import { BreakdownModal, type BreakdownEdit, type BreakdownRow } from './BreakdownModal';
import type { CostBreakdown } from './costs';

/** Toll plazas on the route, excl. VAT like the rest of the quote. */
function TollBreakdownModalImpl({
  visible,
  onClose,
  costs,
  edit,
}: {
  visible: boolean;
  onClose: () => void;
  costs: CostBreakdown;
  /** Tolls for all legs, typed on this quote. */
  edit?: BreakdownEdit | null;
}) {
  const rows: BreakdownRow[] = costs.tollsUnavailable
    ? [{ label: 'Route lookup', value: 'Failed', tone: 'danger' }]
    : costs.tollBreakdown.map((b) => ({
        label: `${str(pick(b, ['plaza']), 'Plaza')}${pick(b, ['route']) ? ` (${str(pick(b, ['route']))})` : ''}`,
        value: formatCurrency(num(pick(b, ['tariff']))),
      }));
  if (!costs.tollsUnavailable && rows.length === 0) rows.push({ label: 'Plazas', value: 'None' });
  if (costs.legs === 2 && costs.tollKnown) rows.push({ label: 'Legs', value: '× 2' });
  return (
    <BreakdownModal
      visible={visible}
      onClose={onClose}
      title="Tolls excl. VAT"
      rows={rows}
      total={{ label: 'Tolls', value: costs.tollKnown ? formatCurrency(costs.tollCost) : '—', tone: costs.tollKnown ? undefined : 'danger' }}
      edit={edit}
      note={costs.tollsEstimated && !costs.tollsUnavailable ? 'Estimated, not a plaza match.' : null}
    />
  );
}

export const TollBreakdownModal = memo(TollBreakdownModalImpl);

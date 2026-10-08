import { memo } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { BreakdownModal, type BreakdownEdit, type BreakdownRow } from './BreakdownModal';
import type { CostBreakdown } from './costs';

/** Driver allowance: nights away × the allowance per night, or the figure typed. */
function DriverBreakdownModalImpl({
  visible,
  onClose,
  costs,
  edit,
}: {
  visible: boolean;
  onClose: () => void;
  costs: CostBreakdown;
  edit?: BreakdownEdit | null;
}) {
  const unknown = !costs.driverKnown || costs.driverMissing;
  const rows: BreakdownRow[] = [
    { label: 'Nights away', value: costs.nights === null ? '—' : String(costs.nights), tone: costs.nights === null ? 'danger' : undefined },
    {
      label: 'Per night',
      value: costs.allowancePerNight !== null ? formatCurrency(costs.allowancePerNight) : 'Not set',
      tone: costs.allowancePerNight === null && (costs.nights ?? 0) > 0 ? 'danger' : undefined,
    },
  ];
  return (
    <BreakdownModal
      visible={visible}
      onClose={onClose}
      title="Driver allowance"
      rows={rows}
      total={{ label: 'Driver allowance', value: unknown ? '—' : formatCurrency(costs.driver), tone: unknown ? 'danger' : undefined }}
      edit={edit}
      // The rule behind the figure, in the backend's words (e.g. the
      // NBCRFLI allowance or "No night away").
      note={costs.costLines.find((l) => l.key === 'driver')?.basis ?? null}
    />
  );
}

export const DriverBreakdownModal = memo(DriverBreakdownModalImpl);

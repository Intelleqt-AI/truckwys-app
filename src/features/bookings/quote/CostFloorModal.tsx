import { memo } from 'react';
import { View } from 'react-native';
import { Label } from '@/components/ui';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { BreakdownModal, Line, type BreakdownRow } from './BreakdownModal';
import type { CostBreakdown } from './costs';

const SHORT: Record<string, string> = {
  fuel: 'Fuel',
  operating: 'Operating costs',
  tolls: 'Tolls',
  driver: 'Driver allowance',
  border: 'Border fees',
  fuel_return: 'Fuel',
  operating_return: 'Operating costs',
  tolls_return: 'Tolls',
  driver_return: 'Driver allowance',
  border_return: 'Border fees',
};

const amount = (v: number | null) => (v === null ? '—' : formatCurrency(v));

/** The cost floor line by line, then price and margin. */
function CostFloorModalImpl({
  visible,
  onClose,
  costs,
}: {
  visible: boolean;
  onClose: () => void;
  costs: CostBreakdown;
}) {
  const loaded: BreakdownRow[] = costs.costLines
    .filter((l) => l.leg === 'loaded')
    .map((l) => ({ label: SHORT[l.key] ?? l.label, value: amount(l.amount), tone: l.amount === null ? 'danger' : undefined }));
  const empty = costs.costLines.filter((l) => l.leg === 'empty_return');
  return (
    <BreakdownModal
      visible={visible}
      onClose={onClose}
      title="Cost floor"
      rows={loaded}
      total={{ label: 'Cost floor', value: amount(costs.floor), tone: costs.floor === null ? 'danger' : undefined }}
    >
      {empty.length > 0 && (
        <View className="mt-3">
          <Label className="mb-1 text-faint">
            Empty return · {formatNumber(costs.distance, { maximumFractionDigits: 1 })} km
          </Label>
          {empty.map((l) => (
            <Line
              key={l.key}
              row={{ label: SHORT[l.key] ?? l.label, value: amount(l.amount), tone: l.amount === null ? 'danger' : undefined }}
            />
          ))}
        </View>
      )}
    </BreakdownModal>
  );
}

export const CostFloorModal = memo(CostFloorModalImpl);

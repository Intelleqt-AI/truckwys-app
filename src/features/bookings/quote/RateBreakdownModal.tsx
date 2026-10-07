import { memo } from 'react';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { BreakdownModal } from './BreakdownModal';

/** Haulage = rate per km × loaded km. A truck's own rate beats the company default. */
function RateBreakdownModalImpl({
  visible,
  onClose,
  vehicleType,
  ratePerKm,
  km,
  amount,
  source,
}: {
  visible: boolean;
  onClose: () => void;
  vehicleType: string;
  ratePerKm: number;
  km: number;
  amount: number;
  /** 'From Superlink' / 'Company default' / 'Your rate', null when empty. */
  source: string | null;
}) {
  return (
    <BreakdownModal
      visible={visible}
      onClose={onClose}
      title="Haulage"
      rows={[
        { label: `Rate${source ? ` (${source.toLowerCase()})` : ''}`, value: `${formatCurrency(ratePerKm)}/km` },
        { label: 'Distance', value: `${formatNumber(Math.round(km))} km` },
      ]}
      total={{ label: 'Haulage', value: formatCurrency(amount) }}
      note={vehicleType ? null : 'Pick a truck to use its own rate.'}
    />
  );
}

export const RateBreakdownModal = memo(RateBreakdownModalImpl);

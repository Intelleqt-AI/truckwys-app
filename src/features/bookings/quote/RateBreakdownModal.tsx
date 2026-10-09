import { memo } from 'react';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { BreakdownModal, type BreakdownEdit } from './BreakdownModal';

const one = (n: number) => formatNumber(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Base rate = rate per km × loaded km. The truck's own rate beats the company default. */
function RateBreakdownModalImpl({
  visible,
  onClose,
  ratePerKm,
  km,
  amount,
  source,
  edit,
}: {
  visible: boolean;
  onClose: () => void;
  ratePerKm: number;
  km: number;
  amount: number;
  /** 'truck' / 'company' / 'yours', null when empty. */
  source: string | null;
  edit?: BreakdownEdit | null;
}) {
  return (
    <BreakdownModal
      visible={visible}
      onClose={onClose}
      title="Base rate"
      rows={[
        // ≈ when the rate has more than cents, so the line can't multiply out exactly.
        {
          label: 'Rate',
          value: `${Math.abs(ratePerKm * 100 - Math.round(ratePerKm * 100)) > 1e-6 ? '≈ ' : ''}${formatCurrency(ratePerKm)}/km${source ? ` · ${source}` : ''}`,
        },
        // 1 dp so rate × km multiplies out.
        { label: 'Distance', value: `${one(km)} km` },
      ]}
      total={{ label: 'Base rate', value: formatCurrency(amount) }}
      edit={edit}
    />
  );
}

export const RateBreakdownModal = memo(RateBreakdownModalImpl);

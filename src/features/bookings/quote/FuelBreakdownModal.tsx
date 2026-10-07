import { memo } from 'react';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { BreakdownModal, type BreakdownRow } from './BreakdownModal';
import { saShortDate } from './rules';
import type { CostBreakdown } from './costs';

const one = (n: number) => formatNumber(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Where the per-litre price came from, in a few words. */
export function fuelSourceText(c: CostBreakdown): string {
  const zone = c.fuelZone === 'COASTAL' ? 'coastal' : 'inland';
  switch (c.fuelSource) {
    case 'own':
      return 'your price';
    case 'override':
      return c.fuelFromMarketCheck ? 'market check' : 'this quote';
    case 'official': {
      const from = saShortDate(c.diesel.official_effective_from);
      return `official ${zone}${from ? `, ${from}` : ''}`;
    }
    default:
      return 'missing';
  }
}

/** Fuel working: the truck's burn for this load, litres and the one diesel figure. */
function FuelBreakdownModalImpl({
  visible,
  onClose,
  costs,
  weightTons,
}: {
  visible: boolean;
  onClose: () => void;
  costs: CostBreakdown;
  weightTons: number | null;
}) {
  const litres = costs.fuelLitres;
  // Whole litres can't multiply out to the cent, so they're shown as ≈.
  const exact = Math.abs(litres - Math.round(litres)) < 1e-9;
  const rows: BreakdownRow[] = [
    { label: 'Truck', value: costs.truckName ?? '—' },
    {
      label: `Burn at ${weightTons != null && weightTons > 0 ? `${formatNumber(weightTons)} t` : 'full load'}`,
      value: costs.consumption ? `${one(costs.consumption)} L/100km` : '—',
    },
    // 1 dp so the line multiplies out.
    { label: 'Distance', value: `${one(costs.chargeDistance)} km` },
    { label: 'Litres', value: costs.consumption ? `${exact ? '' : '≈ '}${formatNumber(Math.round(litres))} L` : '—' },
    {
      label: `${costs.fuelType} (${fuelSourceText(costs)})`,
      value: costs.fuelPrice ? `${formatCurrency(costs.fuelPrice)}/L` : '—',
      tone: costs.fuelPrice ? undefined : 'danger',
    },
  ];
  return (
    <BreakdownModal
      visible={visible}
      onClose={onClose}
      title="Fuel"
      rows={rows}
      total={{ label: 'Fuel', value: costs.fuelKnown ? formatCurrency(costs.fuelCost) : '—', tone: costs.fuelKnown ? undefined : 'danger' }}
    />
  );
}

export const FuelBreakdownModal = memo(FuelBreakdownModalImpl);

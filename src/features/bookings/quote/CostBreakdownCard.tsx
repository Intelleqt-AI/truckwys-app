import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Group, DetailRow, Icon, Txt, Mono } from '@/components/ui';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/formatters';
import type { CostBreakdown } from './costs';

/**
 * Cost breakdown — moved out of CreateQuoteScreen.tsx's render body
 * (Phase 2) verbatim, wrapped in memo. `costs` is already a stable memoized
 * reference upstream, so passing it whole (rather than spreading a dozen
 * scalar props) is correct and this still skips on an unrelated re-render.
 */
function CostBreakdownCardImpl({
  costs,
  vehicleType,
  baseRateNum,
  serviceCharge,
  tripType,
  onTollPress,
  onRemoveUplift,
}: {
  costs: CostBreakdown;
  vehicleType: string;
  baseRateNum: number;
  serviceCharge: number;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  onTollPress: () => void;
  /** Same as the AI card's "Use actual price" — drops serviceCharge to 0. */
  onRemoveUplift: () => void;
}) {
  return (
    <Group label={`Cost breakdown · ${vehicleType || '—'}`}>
      <DetailRow
        label={`Fuel — ${costs.consumption} L/100km @ ${formatCurrency(costs.fuelPrice)}`}
        value={formatCurrency(costs.fuelCost)}
      />
      <Pressable
        onPress={onTollPress}
        accessibilityRole="button"
        accessibilityLabel={`Tolls, ${formatCurrency(costs.tollCost)}. Show toll plaza breakdown`}
        className="flex-row items-center justify-between border-b border-line-row px-3.5 py-3"
      >
        <View className="flex-row items-center gap-1.5">
          <Txt className="text-callout text-muted">Tolls (SA plazas)</Txt>
          <Mono className="text-micro text-faint">Details</Mono>
        </View>
        <View className="flex-row items-center gap-1">
          <Mono className="text-sub font-medium text-fg">{formatCurrency(costs.tollCost)}</Mono>
          <Icon name="chevronRight" size={14} color="#888888" />
        </View>
      </Pressable>
      {costs.crossBorderCost > 0 && (
        <DetailRow
          label="Cross-border / weighbridge"
          value={formatCurrency(costs.crossBorderCost)}
        />
      )}
      <DetailRow label="Driver allowance" value={formatCurrency(costs.driver)} />
      {costs.weightSurcharge > 0 && (
        <DetailRow
          label={`Weight surcharge (${formatPercent(costs.surchargePct)})`}
          value={formatCurrency(costs.weightSurcharge)}
        />
      )}
      <DetailRow
        label={`Base rate (${vehicleType || '—'} · ${formatCurrency(baseRateNum)}/km)`}
        value={formatCurrency(costs.baseCost)}
      />
      {serviceCharge !== 0 && (
        <Pressable
          onPress={onRemoveUplift}
          accessibilityRole="button"
          accessibilityLabel={`Price uplift, ${formatCurrency(serviceCharge)}, from AI recommendation. Remove`}
          className="flex-row items-center justify-between border-b border-line-row px-3.5 py-3"
        >
          <View className="flex-1">
            <Txt className="text-callout text-muted">Price uplift</Txt>
            <Txt className="text-micro text-faint">From AI recommendation</Txt>
          </View>
          <View className="flex-row items-center gap-2">
            <Mono className="text-sub font-medium text-fg">{formatCurrency(serviceCharge)}</Mono>
            <Icon name="x" size={15} color="#888888" />
          </View>
        </Pressable>
      )}
      <View className="flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5">
        <Txt className="text-callout font-semibold text-fg">Quote total</Txt>
        <Mono className="text-heading font-semibold text-accent">
          {formatCurrency(costs.total)}
        </Mono>
      </View>
      <View className="px-3.5 py-2">
        <Mono className="text-micro text-faint">
          {formatNumber(Math.round(costs.distance))} km one way ·{' '}
          {formatNumber(Math.round(costs.chargeDistance))} km{' '}
          {tripType === 'ROUND_TRIP' ? 'round trip' : 'total'}
        </Mono>
      </View>
    </Group>
  );
}

export const CostBreakdownCard = memo(CostBreakdownCardImpl);

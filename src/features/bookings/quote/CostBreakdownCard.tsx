import { memo } from 'react';
import { View, Pressable } from 'react-native';
import { Group, DetailRow, Icon, Txt, Mono } from '@/components/ui';
import { formatCurrency, formatNumber } from '@/lib/formatters';
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
      {/* The rate maths goes on DetailRow's `hint` line rather than inside the
          label. Concatenated in, it grew with the numbers it described and
          squeezed out the amount it was explaining. */}
      <DetailRow
        label="Fuel"
        hint={`${costs.consumption.toFixed(1)} L/100km @ ${formatCurrency(costs.fuelPrice)}`}
        value={formatCurrency(costs.fuelCost)}
        boldValue
      />
      <Pressable
        onPress={onTollPress}
        accessibilityRole="button"
        accessibilityLabel={`Tolls, ${formatCurrency(costs.tollCost)}.${
          costs.tollFree && costs.tollCost === 0 ? ' No plazas on this route.' : ''
        } Show toll plaza breakdown`}
        className="flex-row items-center justify-between border-b border-line-row px-3.5 py-3"
      >
        <View className="flex-1 shrink">
          <View className="flex-row items-center gap-1.5">
            <Txt className="shrink text-callout text-muted" numberOfLines={1}>
              Tolls (SA plazas)
            </Txt>
            <Icon name="alert" size={13} color="#888888" />
          </View>
          {costs.tollFree && costs.tollCost === 0 && (
            <Txt className="text-micro text-faint">No plazas on this route</Txt>
          )}
        </View>
        {/* shrink-0: RN's Yoga defaults flexShrink to 0, so without this the
            amount and chevron were free to overflow and be clipped by Group's
            overflow-hidden Card instead of the label giving way. */}
        <View className="shrink-0 flex-row items-center gap-1">
          <Mono className="text-sub font-semibold text-fg" numberOfLines={1}>
            {formatCurrency(costs.tollCost)}
          </Mono>
          <Icon name="chevronRight" size={14} color="#888888" />
        </View>
      </Pressable>
      {costs.crossBorderCost > 0 && (
        <DetailRow
          label="Cross-border / weighbridge"
          value={formatCurrency(costs.crossBorderCost)}
          boldValue
        />
      )}
      <DetailRow label="Driver allowance" value={formatCurrency(costs.driver)} boldValue />
      <DetailRow
        label="Base rate"
        hint={`${vehicleType || '—'} · ${formatCurrency(baseRateNum)}/km`}
        value={formatCurrency(costs.baseCost)}
        boldValue
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
          <View className="shrink-0 flex-row items-center gap-2">
            <Mono className="text-sub font-semibold text-fg" numberOfLines={1}>
              {formatCurrency(serviceCharge)}
            </Mono>
            <Icon name="x" size={15} color="#888888" />
          </View>
        </Pressable>
      )}
      {/* numberOfLines matters here for a reason that isn't obvious: en-ZA
          groups thousands with a space, which is a legal line break, so an
          unconstrained total could wrap as `R 1 234` / `567,89`. shrink-0 on the
          amount plus shrink on the label makes the words give way instead. */}
      <View className="flex-row items-center justify-between gap-3 bg-surface-hover px-3.5 py-3.5">
        <Txt className="shrink text-callout font-semibold text-fg" numberOfLines={1}>
          Quote total
        </Txt>
        <Mono className="shrink-0 text-heading font-bold text-accent" numberOfLines={1}>
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

import { memo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Card, Icon, Label, Txt, Mono } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import type { CostBreakdown } from './costs';

/** Whole rands: the card and footer; cents live in the modals' line detail. */
export const randWhole = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });

/** One percent format everywhere: whole percent, true minus sign. */
export const pct = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n))}%`;

/**
 * Two blocks, the same on web and mobile:
 *  - Cost floor: the cost lines only (Operating costs, Fuel, Tolls, Driver
 *    allowance, Empty return, Border), total = Cost floor.
 *  - Price: Base rate (rate × km), the costs passed on at cost, any
 *    Adjustment, the price excl. VAT, and the margin.
 * Every row is label + amount; tap a row for its working (and edit field).
 */
function CostBreakdownCardImpl({
  costs,
  serviceCharge,
  adjustmentLabel,
  onRatePress,
  onFuelPress,
  onTollPress,
  onDriverPress,
  onCrossBorderPress,
  onCostPress,
  onAdjustmentPress,
}: {
  costs: CostBreakdown;
  serviceCharge: number;
  /** "Kept from saved price" after a reopen, else "Adjustment". */
  adjustmentLabel: string;
  onRatePress: () => void;
  onFuelPress: () => void;
  onTollPress: () => void;
  onDriverPress: () => void;
  onCrossBorderPress: () => void;
  onCostPress: () => void;
  onAdjustmentPress: () => void;
}) {
  const margin = costs.marginPct;
  const marginTone =
    margin === null ? 'text-muted' : margin < 0 ? 'text-danger' : margin < (costs.costing.target_margin_pct ?? 10) ? 'text-warning' : 'text-success';
  const loaded = (k: string) => costs.costLines.find((l) => l.key === k && l.leg === 'loaded');
  const operating = loaded('operating')?.amount ?? null;
  const emptyReturn = costs.emptyReturnIncluded ? costs.emptyReturnTotal : null;
  // Driver: hidden when nobody sleeps away and nothing needs saying; a missing
  // rate is unknown (—), never R 0,00.
  const showDriver = costs.driver > 0 || costs.driverMissing || !costs.driverKnown || (costs.nights ?? 0) > 0;
  const passedOn = costs.fuelCost + costs.tollCost + costs.driver + costs.crossBorderCost;
  const profit = costs.floor === null ? null : costs.total - costs.floor;

  return (
    <View className="gap-4">
      <View>
        <Label className="mb-2 text-muted">Cost floor</Label>
        <Card className="overflow-hidden">
          <Row label="Operating costs" value={operating === null ? '—' : randWhole(operating)} onPress={onCostPress} />
          <Row label="Fuel" value={costs.fuelKnown ? randWhole(costs.fuelCost) : '—'} warn={!costs.fuelKnown} onPress={onFuelPress} />
          <Row label="Tolls" value={costs.tollKnown ? randWhole(costs.tollCost) : '—'} warn={!costs.tollKnown} onPress={onTollPress} />
          {showDriver && (
            <Row
              label="Driver allowance"
              value={costs.driverKnown && !costs.driverMissing ? randWhole(costs.driver) : '—'}
              warn={!costs.driverKnown || costs.driverMissing}
              onPress={onDriverPress}
            />
          )}
          {costs.emptyReturnIncluded && (
            <Row label="Empty return" value={emptyReturn === null ? '—' : randWhole(emptyReturn)} warn={emptyReturn === null} onPress={onCostPress} />
          )}
          {costs.crossBorderCost > 0 && (
            <Row label="Border" value={randWhole(costs.crossBorderCost)} onPress={onCrossBorderPress} />
          )}
          <TotalRow label="Cost floor" value={costs.floor === null ? '—' : randWhole(costs.floor)} warn={costs.floor === null} onPress={onCostPress} />
        </Card>
      </View>

      <View>
        <Label className="mb-2 text-muted">Price</Label>
        <Card className="overflow-hidden">
          <Row label="Base rate" value={randWhole(costs.baseCost)} onPress={onRatePress} />
          <Row label="Fuel, tolls and allowance at cost" value={randWhole(passedOn)} />
          {serviceCharge !== 0 && (
            <Row label={adjustmentLabel} value={randWhole(serviceCharge)} onPress={onAdjustmentPress} />
          )}
          <TotalRow label="Price excl. VAT" value={randWhole(costs.total)} />
          <View
            className="min-h-[48px] flex-row items-center justify-between gap-3 border-t border-line-row px-3.5"
            accessibilityLabel={margin === null ? 'Margin unknown' : `Margin ${pct(margin)}`}
          >
            <Txt className="text-callout text-muted">Margin</Txt>
            <Mono className={`text-sub font-semibold ${marginTone}`}>
              {margin === null || profit === null ? '—' : `${pct(margin)} · ${randWhole(profit)}`}
            </Mono>
          </View>
        </Card>
      </View>
    </View>
  );
}

function TotalRow({ label, value, warn, onPress }: { label: string; value: string; warn?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  const body = (
    <>
      <Txt className="shrink text-callout font-semibold text-fg" numberOfLines={1}>
        {label}
      </Txt>
      <View className="shrink-0 flex-row items-center gap-1">
        <Mono className={`text-heading font-semibold ${warn ? 'text-danger' : 'text-fg'}`} numberOfLines={1}>
          {value}
        </Mono>
        {onPress ? <Icon name="chevronRight" size={14} color={colors.faint} /> : <View style={{ width: 14 }} />}
      </View>
    </>
  );
  const cls = 'min-h-[52px] flex-row items-center justify-between gap-3 bg-surface-hover px-3.5';
  return onPress ? (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} className={cls}>
      {body}
    </TouchableOpacity>
  ) : (
    <View className={cls} accessibilityLabel={`${label}, ${value}`}>
      {body}
    </View>
  );
}

function Row({
  label,
  value,
  onPress,
  warn,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  warn?: boolean;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <Txt className="shrink text-callout text-muted" numberOfLines={1}>
        {label}
      </Txt>
      <View className="shrink-0 flex-row items-center gap-1">
        <Mono className={`text-sub font-semibold ${warn ? 'text-danger' : 'text-fg'}`} numberOfLines={1}>
          {value}
        </Mono>
        {onPress ? <Icon name="chevronRight" size={14} color={colors.faint} /> : <View style={{ width: 14 }} />}
      </View>
    </>
  );
  const cls = 'min-h-[48px] flex-row items-center justify-between gap-3 border-b border-line-row px-3.5';
  return onPress ? (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      className={cls}
    >
      {body}
    </TouchableOpacity>
  ) : (
    <View className={cls} accessibilityLabel={`${label}, ${value}`}>
      {body}
    </View>
  );
}

export const CostBreakdownCard = memo(CostBreakdownCardImpl);

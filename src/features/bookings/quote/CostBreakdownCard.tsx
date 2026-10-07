import { memo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Card, Icon, Txt, Mono } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import type { CostBreakdown } from './costs';

/**
 * The price, line by line: label + amount, every figure once. The working
 * behind a line lives in its breakdown modal (tap the row). The last row is
 * the cost floor and margin; tap it for the cost lines.
 */
function CostBreakdownCardImpl({
  costs,
  serviceCharge,
  onRatePress,
  onFuelPress,
  onTollPress,
  onCrossBorderPress,
  onCostPress,
  onRemoveUplift,
}: {
  costs: CostBreakdown;
  serviceCharge: number;
  onRatePress: () => void;
  onFuelPress: () => void;
  onTollPress: () => void;
  onCrossBorderPress: () => void;
  onCostPress: () => void;
  onRemoveUplift: () => void;
}) {
  const { colors } = useTheme();
  const margin = costs.marginPct;
  const marginTone =
    margin === null ? 'text-muted' : margin < 0 ? 'text-danger' : margin < 10 ? 'text-warning' : 'text-success';
  return (
    <Card className="overflow-hidden">
      <Row label="Haulage" value={formatCurrency(costs.baseCost)} onPress={onRatePress} />
      <Row label="Fuel" value={costs.fuelKnown ? formatCurrency(costs.fuelCost) : '—'} onPress={onFuelPress} />
      <Row
        label="Tolls"
        value={costs.tollKnown ? formatCurrency(costs.tollCost) : '—'}
        warn={!costs.tollKnown}
        onPress={onTollPress}
      />
      <Row label="Driver nights" value={costs.driverKnown ? formatCurrency(costs.driver) : '—'} warn={!costs.driverKnown} />
      {costs.crossBorderCost > 0 && (
        <Row label="Border" value={formatCurrency(costs.crossBorderCost)} onPress={onCrossBorderPress} />
      )}
      {serviceCharge !== 0 && (
        <Row label="Adjustment" value={formatCurrency(serviceCharge)} onPress={onRemoveUplift} icon="x" />
      )}
      {/* numberOfLines: en-ZA groups thousands with a space, a legal line break. */}
      <View className="flex-row items-center justify-between gap-3 bg-surface-hover px-3.5 py-3.5">
        <Txt className="shrink text-callout font-semibold text-fg" numberOfLines={1}>
          Total excl. VAT
        </Txt>
        <Mono className="shrink-0 text-heading font-semibold text-fg" numberOfLines={1}>
          {formatCurrency(costs.total)}
        </Mono>
      </View>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onCostPress}
        accessibilityRole="button"
        accessibilityLabel={`Cost ${costs.floor === null ? 'unknown' : formatCurrency(costs.floor)}, margin ${
          margin === null ? 'unknown' : `${margin}%`
        }. Show costs`}
        className="min-h-[48px] flex-row items-center justify-between gap-3 border-t border-line-row px-3.5"
      >
        <Txt className="text-sub text-muted" numberOfLines={1}>
          Cost{' '}
          <Mono className="text-sub text-fg">
            {costs.floor === null ? '—' : formatCurrency(costs.floor, { maximumFractionDigits: 0 })}
          </Mono>
        </Txt>
        <View className="shrink-0 flex-row items-center gap-1">
          <Mono className={`text-sub font-semibold ${marginTone}`}>
            {margin === null ? 'Margin —' : `Margin ${margin}%`}
          </Mono>
          <Icon name="chevronRight" size={14} color={colors.faint} />
        </View>
      </TouchableOpacity>
    </Card>
  );
}

function Row({
  label,
  value,
  onPress,
  warn,
  icon = 'chevronRight',
}: {
  label: string;
  value: string;
  onPress?: () => void;
  warn?: boolean;
  icon?: 'chevronRight' | 'x';
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <Txt className="shrink text-callout text-muted" numberOfLines={1}>
        {label}
      </Txt>
      <View className="shrink-0 flex-row items-center gap-1">
        <Mono
          className={`text-sub font-semibold ${warn ? 'text-danger' : 'text-fg'}`}
          numberOfLines={1}
        >
          {value}
        </Mono>
        {onPress ? (
          <Icon name={icon} size={14} color={colors.faint} />
        ) : (
          <View style={{ width: 14 }} />
        )}
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

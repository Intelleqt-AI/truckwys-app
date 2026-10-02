import { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import {
  Card,
  CostsSwatch,
  Icon,
  Mono,
  Label,
  RevenueCostBars,
  type RevenueCostMonth,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useCountUp } from '@/hooks/useCountUp';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { monthShort, monthsSpanText, type HomeMoney } from './derive';
import { monthLabel } from '@/lib/ledger';

// ── HeroRevenue: "Revenue received, last 12 months" with the monthly revenue vs
// costs bars underneath. The mobile version of the web's revenue tile and its
// "Revenue vs costs" chart card. Every figure is from the payments, invoices and
// expenses ledgers (derive.ts computeHomeMoney), not dashboard/finance/:
//   headline  payments received in the last 12 months, incl. VAT
//   delta     against the 12 months before that (shown only when those had payments)
//   chart     per month, excl. VAT, cash basis: revenue received vs approved expenses
// Tapping a month in the chart selects it, so the card itself is not one big
// press target; the way into the reports is the row at the foot.
export function HeroRevenue({
  money,
  onPress,
}: {
  money: HomeMoney;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const revenue = useCountUp(money.received);

  const change =
    money.receivedPrior != null && money.receivedPrior > 0.005
      ? ((money.received - money.receivedPrior) / money.receivedPrior) * 100
      : null;
  const changeRounded = change == null ? null : Math.round(change * 10) / 10;
  const up = (changeRounded ?? 0) >= 0;
  const deltaColor = up ? colors.success : colors.danger;

  const bars: RevenueCostMonth[] = useMemo(
    () =>
      money.months.map((m) => ({
        label: monthShort(m.ym),
        full: monthLabel(m.ym),
        revenue: m.revenue,
        costs: m.costs,
      })),
    [money.months],
  );
  const hasMovement = money.months.some((m) => m.revenue !== 0 || m.costs !== 0);

  return (
    <Card className="overflow-hidden p-4">
      <View className="flex-row items-start justify-between gap-3">
        <Label className="flex-1 text-faint">Revenue received, last 12 months</Label>
        {changeRounded != null && (
          <Mono className="mt-0.5 text-caption" style={{ color: deltaColor }}>
            {`${changeRounded > 0 ? '+' : ''}${formatPercent(changeRounded)} vs prior 12 months`}
          </Mono>
        )}
      </View>
      <Mono
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
        className="mt-1.5 text-figure font-semibold text-fg"
      >
        {formatCurrency(revenue, { maximumFractionDigits: 0 })}
      </Mono>
      <Mono className="mt-0.5 text-caption text-faint">Paid by customers, incl. VAT</Mono>

      {hasMovement ? (
        <>
          <View className="mt-2 flex-row items-center justify-end gap-3">
            <View className="flex-row items-center gap-1.5">
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.accent }} />
              <Mono className="text-caption text-muted">Revenue</Mono>
            </View>
            <View className="flex-row items-center gap-1.5">
              <CostsSwatch />
              <Mono className="text-caption text-muted">Costs</Mono>
            </View>
          </View>
          <View className="mt-1.5">
            <RevenueCostBars months={bars} />
          </View>
        </>
      ) : (
        <Mono className="mt-3 text-caption text-faint">No money in or out in the last 12 months.</Mono>
      )}

      <View className="mt-2 border-t border-line pt-2">
        <Mono className="text-caption text-faint">
          {`Revenue vs costs, excl. VAT, cash basis${money.months.length ? `, ${monthsSpanText(money.months)}` : ''}`}
        </Mono>
        {onPress && (
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Open finance reports"
            hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
            className="mt-1 min-h-[36px] flex-row items-center gap-1 self-start"
          >
            <Mono className="text-caption text-link">View reports</Mono>
            <Icon name="chevronRight" size={14} color={colors.link} />
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
}

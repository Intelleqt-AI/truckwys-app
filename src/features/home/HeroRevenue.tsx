import { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import {
  Card,
  CostsSwatch,
  Icon,
  InfoTip,
  Mono,
  Label,
  RevenueCostBars,
  SegmentedControl,
  type RevenueCostMonth,
} from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useCountUp } from '@/hooks/useCountUp';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { monthShort, monthsSpanText, type HomeMoney } from './derive';
import { BASIS_LABEL, basisText, monthLabel, type RevenueBasis } from '@/lib/ledger';
import { useRevenueBasisStore } from '@/stores/revenueBasisStore';

// ── HeroRevenue: "Revenue excl. VAT, 12 months" with the monthly revenue vs
// costs bars underneath. The mobile version of the web's revenue tile and its
// "Revenue vs costs" chart card. Every figure is from the invoices, payments,
// expenses and credit-notes ledgers (derive.ts computeHomeMoney), on the rules
// the Reports use, so Home agrees with them:
//   headline  revenue excl. VAT on the chosen basis. Received (cash): money in,
//             each payment less its invoice's VAT. Invoiced (accrual): issued
//             invoices less credit notes. What was received incl. VAT is in the tip.
//   delta     against the 12 months before that (shown only when they had revenue)
//   chart     per month, excl. VAT, on that basis: revenue vs expenses not rejected
// Tapping a month in the chart selects it, so the card itself is not one big
// press target; the way into the reports is the row at the foot.

const BASIS_OPTIONS: { label: string; value: RevenueBasis }[] = [
  { label: BASIS_LABEL.cash, value: 'cash' },
  { label: BASIS_LABEL.accrual, value: 'accrual' },
];

export function HeroRevenue({
  money,
  onPress,
}: {
  money: HomeMoney;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const setBasis = useRevenueBasisStore((s) => s.setBasis);
  const revenue = useCountUp(money.revenueExcl);
  const basisWord = money.basis === 'cash' ? 'cash (received)' : 'accrual (invoiced)';

  const change =
    money.revenuePrior != null && money.revenuePrior > 0.005
      ? ((money.revenueExcl - money.revenuePrior) / money.revenuePrior) * 100
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

  const tip =
    (money.basis === 'cash'
      ? 'Money received from customers in the last 12 months, by payment date, less the VAT share of each invoice: the profit and loss revenue on the cash basis.'
      : 'Invoices issued in the last 12 months (not drafts or void), by issue date, excl. VAT, less credit notes: the profit and loss revenue on the accrual basis.') +
    ` Received incl. VAT in the same period: ${formatCurrency(money.received, { maximumFractionDigits: 0 })}. Switch the basis below.`;

  return (
    <Card className="overflow-hidden p-4">
      <View className="flex-row items-start justify-between gap-3">
        {/* The last word and the icon are one unbreakable unit, so the icon stays
            right after "months" even when the title wraps onto a second line. */}
        <View className="flex-1 flex-row flex-wrap items-center gap-x-1.5">
          <Label className="text-faint">Revenue excl. VAT, 12</Label>
          <View className="flex-row items-center gap-1.5">
            <Label className="text-faint">months</Label>
            <InfoTip text={tip} label="About revenue" />
          </View>
        </View>
        {changeRounded != null && (
          <Mono
            className="mt-0.5 shrink text-right text-caption"
            style={{ color: deltaColor, maxWidth: '45%' }}
          >
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
      <Mono className="mt-0.5 text-caption text-faint">{`Excl. VAT, ${basisWord}`}</Mono>

      <View className="mt-3">
        <SegmentedControl options={BASIS_OPTIONS} value={money.basis} onChange={setBasis} />
      </View>

      {hasMovement ? (
        <>
          <View className="mt-3 flex-row items-center justify-end gap-3">
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
          {`Revenue vs costs, ${basisText(money.basis)}${money.months.length ? `, ${monthsSpanText(money.months)}` : ''}`}
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

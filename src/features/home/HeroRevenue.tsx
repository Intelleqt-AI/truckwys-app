import { useMemo } from 'react';
import { View } from 'react-native';
import { Card, Mono, Label, Sparkline, PressScale } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { useCountUp } from '@/hooks/useCountUp';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import type { TrendPoint } from '@/types/domain';
import { monthShort, monthsSpanText, type HomeMoney } from './derive';

// ── HeroRevenue: "Revenue received, last 12 months" with the monthly revenue vs
// costs line underneath. The mobile collapse of the web's revenue tile and its
// "Revenue vs costs" chart card. Every figure is from the payments, invoices and
// expenses ledgers (derive.ts computeHomeMoney), not dashboard/finance/:
//   headline  payments received in the last 12 months, incl. VAT
//   delta     against the 12 months before that (shown only when those had payments)
//   chart     per month, excl. VAT, cash basis: revenue received vs approved expenses
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

  const points: TrendPoint[] = useMemo(
    () => money.months.map((m) => ({ revenue: m.revenue, expenses: m.costs, month: m.ym })),
    [money.months],
  );
  const hasMovement = money.months.some((m) => m.revenue !== 0 || m.costs !== 0);

  // Up to four evenly spaced month ticks, first and last always included.
  const ticks = useMemo(() => {
    const n = money.months.length;
    if (n < 2) return [];
    const idx = n <= 4 ? money.months.map((_, i) => i) : [0, 1, 2, 3].map((i) => Math.round((i * (n - 1)) / 3));
    return idx.map((i) => monthShort(money.months[i]?.ym ?? ''));
  }, [money.months]);

  const content = (
    <Card className="overflow-hidden p-4">
      <View className="flex-row items-start justify-between gap-3">
        <Label className="flex-1 text-faint">Revenue received, last 12 months</Label>
        {changeRounded != null && (
          <Mono className="mt-0.5 text-micro" style={{ color: deltaColor }}>
            {`${changeRounded > 0 ? '+' : ''}${formatPercent(changeRounded)} vs prior 12 months`}
          </Mono>
        )}
      </View>
      <Mono
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
        // Home's one emphasis figure: the only accent-coloured number on the screen.
        className="mt-1.5 text-figure font-semibold text-accent"
      >
        {formatCurrency(revenue, { maximumFractionDigits: 0 })}
      </Mono>
      <Mono className="mt-0.5 text-micro text-faint">Paid by customers, incl. VAT</Mono>

      {hasMovement && points.length >= 2 ? (
        <>
          <View className="mt-1.5 flex-row items-center justify-end gap-3">
            <View className="flex-row items-center gap-1.5">
              <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: colors.accent }} />
              <Mono className="text-micro text-muted">Revenue</Mono>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View
                style={{
                  width: 14,
                  height: 0,
                  borderTopWidth: 2,
                  borderStyle: 'dashed',
                  borderColor: colors.chartMuted,
                }}
              />
              <Mono className="text-micro text-muted">Costs</Mono>
            </View>
          </View>
          <View className="mt-1">
            <Sparkline points={points} height={56} />
          </View>
          <View className="mt-1 flex-row justify-between">
            {ticks.map((m, i) => (
              <Mono key={i} className="text-micro text-faint">
                {m}
              </Mono>
            ))}
          </View>
        </>
      ) : (
        <Mono className="mt-3 text-micro text-faint">
          {hasMovement ? 'Needs two months with entries to chart.' : 'No money in or out in the last 12 months.'}
        </Mono>
      )}

      <View className="mt-2 border-t border-line pt-2">
        <Mono className="text-micro text-faint">
          {`Revenue vs costs, excl. VAT, cash basis${money.months.length ? `, ${monthsSpanText(money.months)}` : ''}`}
        </Mono>
      </View>
    </Card>
  );

  if (!onPress) return content;
  return <PressScale onPress={onPress}>{content}</PressScale>;
}

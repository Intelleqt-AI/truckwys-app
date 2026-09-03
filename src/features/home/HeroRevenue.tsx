import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Mono, Label, Sparkline, PressScale } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { status as statusHues } from '@/theme/tokens';
import { useCountUp } from '@/hooks/useCountUp';
import { formatCurrency, formatPercent, formatNumber } from '@/lib/formatters';
import type { FinanceSummary } from '@/types/domain';

// ── HeroRevenue: the mobile collapse of web's adjacent "Total Revenue" metric
// card + "Revenue vs Fuel Cost" chart card (Overview.tsx) into one focal
// panel. Same copy, same series, same line treatment — merged because a
// 3-column desktop grid has room for both side by side and a single phone
// column does not.
export function HeroRevenue({
  finance,
  onPress,
}: {
  finance: FinanceSummary;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const revenue = useCountUp(finance.totalRevenue);

  const delta = finance.revenueChangePct
    ? `${finance.revenueChangePct > 0 ? '+' : ''}${formatPercent(finance.revenueChangePct)} vs prev 30d`
    : undefined;
  // Matches the bento tiles just below (StatCard's green-up/red-down), not
  // web's CSS (which colors revenue-up accent-blue) — the same screen using
  // two different "positive" colors would read as a mistake, not a choice.
  const deltaColor = finance.revenueChangePct >= 0 ? statusHues.success : statusHues.danger;

  const last = finance.monthlyTrend.at(-1);
  const fuelRatioPct = last && last.revenue > 0 ? (last.expenses / last.revenue) * 100 : undefined;

  const content = (
    <Card className="overflow-hidden p-5">
      <LinearGradient
        pointerEvents="none"
        colors={[colors.glow, 'transparent']}
        style={StyleSheet.absoluteFillObject}
      />
      <View className="flex-row items-start justify-between">
        <Label className="text-faint">Total revenue</Label>
        {delta && (
          <Mono className="text-micro" style={{ color: deltaColor }}>
            {delta}
          </Mono>
        )}
      </View>
      <Mono className="mt-2 tracking-display text-fg" style={{ fontSize: 32, fontWeight: '600' }}>
        {formatCurrency(revenue, { maximumFractionDigits: 0 })}
      </Mono>
      {/* Legend — same swatches/labels as web's chart-card header (top-right
          of the chart), so the two lines below are identifiable without
          having to guess which is revenue and which is fuel cost. */}
      <View className="mt-3 flex-row items-center justify-end gap-3">
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: colors.accent }} />
          <Mono className="text-nano text-muted">Revenue</Mono>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View
            style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: statusHues.danger }}
          />
          <Mono className="text-nano text-muted">Fuel cost</Mono>
        </View>
      </View>
      <View className="mt-1.5">
        <Sparkline points={finance.monthlyTrend} />
      </View>
      {/* Net margin is deliberately not repeated here — it's the bento tile
          right below this card, and showing the same number twice on one
          screen read as a mistake, not confirmation. Web's chart-card footer
          also had a hardcoded "Trend ↑ improving" stat; that's fake, not
          derived, so it's omitted rather than copied. */}
      {fuelRatioPct != null && (
        <View className="mt-4 flex-row border-t border-line pt-3.5">
          <Mono className="text-caption text-muted">
            Fuel/Rev ratio{' '}
            <Mono className="text-caption text-warning">
              {formatNumber(fuelRatioPct, { maximumFractionDigits: 0 })}%
            </Mono>
          </Mono>
        </View>
      )}
    </Card>
  );

  if (!onPress) return content;
  return <PressScale onPress={onPress}>{content}</PressScale>;
}

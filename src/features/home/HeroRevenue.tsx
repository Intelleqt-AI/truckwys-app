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
  // Web's chart-card footer hardcodes this to "↑ improving" regardless of the
  // actual number — derived from the real revenue delta here instead, so a
  // month that's actually declining can't get told it's improving.
  const trendUp = finance.revenueChangePct >= 0;

  const monthLabels = finance.monthlyTrend.slice(-4).map((p) => p.month?.slice(5) ?? '');

  const content = (
    <Card className="overflow-hidden p-3.5">
      <LinearGradient
        pointerEvents="none"
        colors={[colors.glow, 'transparent']}
        style={StyleSheet.absoluteFillObject}
      />
      <View className="flex-row items-start justify-between">
        <Label className="text-faint">Total revenue</Label>
        {/* Web's separate "Revenue vs Fuel Cost" chart-card title, folded up
            here (see file header) — top-right, stacked above the delta,
            smaller than the rest of this row so it reads as a caption. */}
        <View className="items-end">
          {/* <Mono className="text-nano text-faint">Revenue vs Fuel Cost (Last 30 Days)</Mono> */}
          {delta && (
            <Mono className="mt-0.5 text-micro" style={{ color: deltaColor }}>
              {delta}
            </Mono>
          )}
        </View>
      </View>
      <Mono className="mt-1.5 tracking-display text-fg" style={{ fontSize: 22, fontWeight: '600' }}>
        {formatCurrency(revenue, { maximumFractionDigits: 0 })}
      </Mono>

      <View className="mt-1.5 flex-row items-center justify-end gap-3">
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
      <View className="mt-1">
        <Sparkline points={finance.monthlyTrend} height={56} />
      </View>
      {monthLabels.some(Boolean) && (
        <View className="mt-1 flex-row justify-between">
          {monthLabels.map((m, i) => (
            <Mono key={i} className="text-nano text-faint">
              {m}
            </Mono>
          ))}
        </View>
      )}

      <View className="mt-2 flex-row flex-wrap gap-1.5 border-t border-line pt-2">
        <Mono className="text-nano text-faint">Revenue vs Fuel Cost (Last 30 Days)</Mono>
        {/* <Mono className="text-micro text-muted">
          Net Margin{' '}
          <Mono className="text-micro text-accent">{formatPercent(finance.netMarginPct)}</Mono>
        </Mono> */}
        {fuelRatioPct != null && (
          <Mono className="text-nano text-muted">
            Fuel/Rev ratio{' '}
            <Mono className="text-nano text-warning">
              {formatNumber(fuelRatioPct, { maximumFractionDigits: 0 })}%
            </Mono>
          </Mono>
        )}
        <Mono className="text-nano text-muted">
          Trend{' '}
          <Mono
            className="text-nano"
            style={{ color: trendUp ? statusHues.success : statusHues.danger }}
          >
            {trendUp ? '↑ improving' : '↓ declining'}
          </Mono>
        </Mono>
      </View>
    </Card>
  );

  if (!onPress) return content;
  return <PressScale onPress={onPress}>{content}</PressScale>;
}

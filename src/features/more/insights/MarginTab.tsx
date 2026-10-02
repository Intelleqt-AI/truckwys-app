import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { DetailRow, EmptyState, FilterChips, Group, StatCard, Txt } from '@/components/ui';
import { ErrorState, ListSkeleton } from '@/components/feedback';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { formatCurrencyCompact, formatPercent } from '@/lib/formatters';
import { monthLabel, periodText, plural, resolvePeriod, type PeriodId } from '@/lib/ledger';
import { useLedger } from '@/lib/useLedger';
import { useTheme } from '@/theme/ThemeProvider';
import { randWhole } from './findings';
import { marginFromLedger } from './margin';

const PERIODS: { label: string; value: PeriodId }[] = [
  { label: 'This month', value: 'this-month' },
  { label: 'Last month', value: 'last-month' },
  { label: '3 months', value: 'last-3' },
  { label: '6 months', value: 'last-6' },
  { label: '12 months', value: 'last-12' },
  { label: 'Year to date', value: 'ytd' },
];
const HALF = { width: '47.5%' } as const;
const KEYS = ['invoices', 'payments', 'expenses'] as const;

/**
 * Insights > Margin: what you keep after approved costs, on the Profit and
 * loss report's basis (excl. VAT, cash basis), so it agrees with the
 * "Costs left out of profit" finding.
 */
export function MarginTab() {
  const [period, setPeriod] = useState<PeriodId>('last-12');
  const ledger = useLedger([...KEYS]);
  const queryClient = useQueryClient();
  const { refreshing, onRefresh } = useManualRefresh(() =>
    Promise.all(KEYS.map((k) => queryClient.refetchQueries({ queryKey: [`ledger-${k}`] }))),
  );
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const p = useMemo(() => resolvePeriod(period), [period]);
  const data = ledger.data;
  const r = useMemo(() => (data ? marginFromLedger(data, p) : null), [data, p]);

  if (ledger.loading) {
    return (
      <View className="p-screen">
        <ListSkeleton rows={3} />
      </View>
    );
  }
  if (ledger.error || !data || !r) return <ErrorState onRetry={ledger.retry} message="Couldn't load margin." />;

  const span = periodText(p);
  const withPending = r.net - r.pending;
  const empty = r.revenue === 0 && r.costs === 0 && r.pending === 0;

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.faint}
          colors={[colors.faint]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      <View className="mb-3">
        <FilterChips options={PERIODS} value={period} onChange={setPeriod} />
      </View>
      <Txt className="mb-4 text-caption text-faint">
        {span}, excl. VAT, cash basis: money received less approved costs, as in the Profit and loss report.
        {data.partial.length ? ` Based on the ${data.partial.join(', ')}.` : ''}
      </Txt>

      {empty ? (
        <EmptyState
          icon="chart"
          title="Nothing to report"
          body={`Nothing received or approved in ${span}.`}
        />
      ) : (
        <>
          <View className="mb-5 flex-row flex-wrap gap-3">
            <View className="flex-row" style={HALF}>
              <StatCard
                label="Revenue"
                value={formatCurrencyCompact(r.revenue)}
                sub={plural(r.paymentCount, 'payment')}
              />
            </View>
            <View className="flex-row" style={HALF}>
              <StatCard label="Approved costs" value={formatCurrencyCompact(r.costs)} sub="excl. VAT" />
            </View>
            <View className="flex-row" style={HALF}>
              <StatCard
                label="Net margin"
                value={r.pct != null ? formatPercent(r.pct) : formatCurrencyCompact(r.net)}
                sub={r.pct != null ? randWhole(r.net) : 'no revenue received'}
                delta={r.net < 0 ? 'Loss' : undefined}
                deltaTone="down"
              />
            </View>
            <View className="flex-row" style={HALF}>
              {r.pending > 0 ? (
                <StatCard
                  label="With pending costs"
                  value={formatCurrencyCompact(withPending)}
                  sub={`${randWhole(r.pending)} not approved (${r.pendingCount})`}
                  delta={withPending < 0 ? 'Loss' : undefined}
                  deltaTone="down"
                />
              ) : (
                <StatCard label="Pending costs" value={formatCurrencyCompact(0)} sub="Every cost is approved" />
              )}
            </View>
          </View>

          <Group label="Net margin by month">
            {r.months.map((m) => {
              const quiet = m.revenue === 0 && m.costs === 0;
              return (
                <DetailRow
                  key={m.ym}
                  label={monthLabel(m.ym)}
                  hint={
                    quiet
                      ? 'Nothing received or approved'
                      : `Revenue ${randWhole(m.revenue)}, costs ${randWhole(m.costs)}`
                  }
                  value={quiet ? 'None' : randWhole(m.net)}
                  valueColor={!quiet && m.net < 0 ? colors.danger : undefined}
                  last={false}
                />
              );
            })}
            <DetailRow
              label="Total"
              hint={span}
              value={randWhole(r.net)}
              valueColor={r.net < 0 ? colors.danger : undefined}
              boldValue
              last
            />
          </Group>
        </>
      )}
    </ScrollView>
  );
}

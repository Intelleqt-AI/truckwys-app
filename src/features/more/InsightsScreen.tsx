import { useLayoutEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, SwipeTabs, Group, DetailRow, StatCard, EmptyState } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { fetchData } from '@/lib/api/client';
import { asArray, num, str, pick } from '@/lib/api/list';
import { formatCurrencyCompact, formatPercent } from '@/lib/formatters';
import { FindingsTab } from './insights/FindingsTab';
import { MarginTab } from './insights/MarginTab';
import { useTheme } from '@/theme/ThemeProvider';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Insights'>;

// 'findings' is the first tab. Deep links that still ask for the old 'briefing'
// tab land on it.
type Tab = 'findings' | 'margin' | 'cashflow' | 'lanes';
const startTab = (t?: string): Tab => (t === 'cashflow' || t === 'lanes' || t === 'margin' ? t : 'findings');

export function InsightsScreen({ navigation, route }: Props) {
  const [tab, setTab] = useState<Tab>(startTab(route.params?.tab));
  const { colors } = useTheme();

  // SheetScreen's ScrollView can't host SwipeTabs' PagerView (a ScrollView's
  // content has no bounded height, which PagerView needs to render pages and
  // handle the swipe gesture) — so this screen sets its own plain, opaque
  // header instead, same as MoreScreen does for the same reason.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'Insights',
      headerLargeTitle: false,
      headerTransparent: false,
      headerStyle: { backgroundColor: colors.bgDeep },
    });
  }, [navigation, colors.bgDeep]);

  return (
    <Screen scroll={false} padded={false} topInset={false} contentClassName="pt-2">
      <SwipeTabs
        tabs={[
          { label: 'Findings', value: 'findings' },
          { label: 'Margin', value: 'margin' },
          { label: 'Cash flow', value: 'cashflow' },
          { label: 'Lanes', value: 'lanes' },
        ]}
        value={tab}
        onChange={setTab}
        lazy
      >
        <FindingsTab />
        <MarginTab />
        <Cashflow />
        <Lanes />
      </SwipeTabs>
    </Screen>
  );
}

function Cashflow() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-cashflow'],
    queryFn: () => fetchData('dashboard/cashflow/') as Promise<Record<string, unknown>>,
    retry: false,
  });
  const insets = useSafeAreaInsets();
  if (isLoading)
    return (
      <View className="p-screen">
        <ListSkeleton rows={3} />
      </View>
    );
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load cash flow." />;
  // The figures live under `summary` (CashFlowForecastView). They used to be
  // read off the top level, where none of those keys exist, so every tile read
  // R 0. A failed forecast is a 503 with no `summary`, which lands in the error
  // state above rather than as zeros.
  const summary = (data.summary ?? {}) as Record<string, unknown>;
  const periodDays = num(pick(data, ['period_days']), 90);
  const totalWeeks = num(pick(summary, ['total_weeks']));
  const weeksNegative = num(pick(summary, ['weeks_negative']));
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: insets.bottom + 24,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row flex-wrap gap-3">
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard
            label={`Expected in, ${periodDays} days`}
            value={formatCurrencyCompact(num(pick(summary, ['total_expected_in'])))}
          />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard
            label={`Expected out, ${periodDays} days`}
            value={formatCurrencyCompact(num(pick(summary, ['total_expected_out'])))}
          />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard
            label="Net position"
            value={formatCurrencyCompact(num(pick(summary, ['net_position'])))}
          />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard
            label="Weeks in the red"
            value={totalWeeks > 0 ? `${weeksNegative} of ${totalWeeks}` : 'None'}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function Lanes() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports-lanes'],
    queryFn: async () =>
      asArray(await fetchData('reports/margin-by-lane/')).map((l) => {
        const r = l as Record<string, unknown>;
        return {
          lane: str(pick(r, ['lane', 'route']), 'Unknown lane'),
          margin: num(pick(r, ['margin', 'margin_percent'])),
        };
      }),
    retry: false,
  });
  const insets = useSafeAreaInsets();
  if (isLoading)
    return (
      <View className="p-screen">
        <ListSkeleton rows={4} />
      </View>
    );
  if (isError) return <ErrorState onRetry={refetch} message="Couldn't load lanes." />;
  if (!data || data.length === 0)
    return (
      <EmptyState
        icon="route"
        title="No lane data"
        body="Lane margins appear as you complete trips."
      />
    );
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: insets.bottom + 24,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Group label="Margin by lane">
        {data.slice(0, 12).map((l, i) => (
          <DetailRow
            key={l.lane + i}
            label={l.lane}
            value={formatPercent(l.margin)}
            mono={false}
            last={i === data.length - 1}
          />
        ))}
      </Group>
    </ScrollView>
  );
}

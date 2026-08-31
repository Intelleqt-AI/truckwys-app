import { useLayoutEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, SwipeTabs, Label, Card, Badge, Group, DetailRow, StatCard, Txt, EmptyState } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { fetchData } from '@/lib/api/client';
import { asArray, num, str, pick } from '@/lib/api/list';
import { formatCurrencyCompact, formatPercent } from '@/lib/formatters';
import { useInsights, type Signal } from './api';
import { useTheme } from '@/theme/ThemeProvider';
import type { AppStackParamList, InsightsTab } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Insights'>;

const SEV: Record<Signal['severity'], 'danger' | 'warning' | 'info'> = {
  high: 'danger',
  medium: 'warning',
  low: 'info',
};

export function InsightsScreen({ navigation, route }: Props) {
  const [tab, setTab] = useState<InsightsTab>(route.params?.tab ?? 'briefing');
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
    <Screen scroll={false} padded={false} topInset={false} contentClassName="pt-3">
      <View className="px-screen">
        <Label className="mb-3">AI</Label>
      </View>
      <SwipeTabs
        tabs={[
          { label: 'Briefing', value: 'briefing' },
          { label: 'Cash flow', value: 'cashflow' },
          { label: 'Lanes', value: 'lanes' },
        ]}
        value={tab}
        onChange={setTab}
      >
        <Briefing />
        <Cashflow />
        <Lanes />
      </SwipeTabs>
    </Screen>
  );
}

function Briefing() {
  const { data, isLoading, isError, refetch } = useInsights();
  const insets = useSafeAreaInsets();
  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError) return <ErrorState onRetry={refetch} message="Couldn't load insights." />;
  if (!data || data.length === 0)
    return <EmptyState icon="sparkle" title="No insights yet" body="AI signals about your operations appear here." />;
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-2.5">
        {data.map((s) => (
          <Card key={s.id} className="p-4">
            <View className="mb-2 flex-row items-center gap-2">
              <Badge label={s.category} tone={SEV[s.severity]} />
            </View>
            {s.title ? <Txt className="text-body font-medium text-fg">{s.title}</Txt> : null}
            {s.body ? <Txt className="mt-1 text-sub text-muted">{s.body}</Txt> : null}
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

function Cashflow() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-cashflow'],
    queryFn: () => fetchData('dashboard/cashflow/') as Promise<Record<string, unknown>>,
    retry: false,
  });
  const insets = useSafeAreaInsets();
  if (isLoading) return <View className="p-screen"><ListSkeleton rows={3} /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load cash flow." />;
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row flex-wrap gap-3">
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="Inflow" value={formatCurrencyCompact(num(pick(data, ['inflow', 'total_inflow'])))} />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="Outflow" value={formatCurrencyCompact(num(pick(data, ['outflow', 'total_outflow'])))} />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="Net position" value={formatCurrencyCompact(num(pick(data, ['net', 'net_position'])))} />
        </View>
        <View className="flex-row" style={{ width: '47.5%' }}>
          <StatCard label="Projected" value={formatCurrencyCompact(num(pick(data, ['projected', 'forecast'])))} />
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
          lane: str(pick(r, ['lane', 'route']), '—'),
          margin: num(pick(r, ['margin', 'margin_percent'])),
        };
      }),
    retry: false,
  });
  const insets = useSafeAreaInsets();
  if (isLoading) return <View className="p-screen"><ListSkeleton rows={4} /></View>;
  if (isError) return <ErrorState onRetry={refetch} message="Couldn't load lanes." />;
  if (!data || data.length === 0)
    return <EmptyState icon="route" title="No lane data" body="Lane margins appear as you complete trips." />;
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Group label="Margin by lane">
        {data.slice(0, 12).map((l, i) => (
          <DetailRow key={l.lane + i} label={l.lane} value={formatPercent(l.margin)} mono={false} last={i === data.length - 1} />
        ))}
      </Group>
    </ScrollView>
  );
}

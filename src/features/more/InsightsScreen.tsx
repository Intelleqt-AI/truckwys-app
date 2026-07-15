import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, UnderlineTabs, Card, Badge, Group, DetailRow, StatCard, Txt, EmptyState } from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { fetchData } from '@/lib/api/client';
import { asArray, num, str, pick } from '@/lib/api/list';
import { formatCurrencyCompact, formatPercent } from '@/lib/formatters';
import { useInsights, type Signal } from './api';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Insights'>;
type Tab = 'briefing' | 'cashflow' | 'lanes';

const SEV: Record<Signal['severity'], 'danger' | 'warning' | 'info'> = {
  high: 'danger',
  medium: 'warning',
  low: 'info',
};

export function InsightsScreen({ navigation }: Props) {
  const [tab, setTab] = useState<Tab>('briefing');
  return (
    <SheetScreen eyebrow="AI" title="Insights" onBack={() => navigation.goBack()}>
      <View className="mb-4">
        <UnderlineTabs
          tabs={[
            { label: 'Briefing', value: 'briefing' },
            { label: 'Cash flow', value: 'cashflow' },
            { label: 'Lanes', value: 'lanes' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === 'briefing' && <Briefing />}
      {tab === 'cashflow' && <Cashflow />}
      {tab === 'lanes' && <Lanes />}
    </SheetScreen>
  );
}

function Briefing() {
  const { data, isLoading, isError, refetch } = useInsights();
  if (isLoading) return <ListSkeleton />;
  if (isError) return <ErrorState onRetry={refetch} message="Couldn't load insights." />;
  if (!data || data.length === 0)
    return <EmptyState icon="sparkle" title="No insights yet" body="AI signals about your operations appear here." />;
  return (
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
  );
}

function Cashflow() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-cashflow'],
    queryFn: () => fetchData('dashboard/cashflow/') as Promise<Record<string, unknown>>,
    retry: false,
  });
  if (isLoading) return <ListSkeleton rows={3} />;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load cash flow." />;
  return (
    <View className="flex-row flex-wrap gap-3">
      <View style={{ width: '47.5%' }}>
        <StatCard label="Inflow" value={formatCurrencyCompact(num(pick(data, ['inflow', 'total_inflow'])))} />
      </View>
      <View style={{ width: '47.5%' }}>
        <StatCard label="Outflow" value={formatCurrencyCompact(num(pick(data, ['outflow', 'total_outflow'])))} />
      </View>
      <View style={{ width: '47.5%' }}>
        <StatCard label="Net position" value={formatCurrencyCompact(num(pick(data, ['net', 'net_position'])))} />
      </View>
      <View style={{ width: '47.5%' }}>
        <StatCard label="Projected" value={formatCurrencyCompact(num(pick(data, ['projected', 'forecast'])))} />
      </View>
    </View>
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
  if (isLoading) return <ListSkeleton rows={4} />;
  if (isError) return <ErrorState onRetry={refetch} message="Couldn't load lanes." />;
  if (!data || data.length === 0)
    return <EmptyState icon="route" title="No lane data" body="Lane margins appear as you complete trips." />;
  return (
    <Group label="Margin by lane">
      {data.slice(0, 12).map((l, i) => (
        <DetailRow key={l.lane + i} label={l.lane} value={formatPercent(l.margin)} mono={false} last={i === data.length - 1} />
      ))}
    </Group>
  );
}

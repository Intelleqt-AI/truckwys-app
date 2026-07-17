import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  AmbientGlow,
  AppHeader,
  SwipeTabs,
  StatCard,
  StatusPill,
  Group,
  DetailRow,
  ListRow,
  Badge,
  Icon,
  IconButton,
  Mono,
  SectionLabel,
  EmptyState,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useInvoices, useExpenses, useFinanceReports, deleteExpense } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { toast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters';
import type { TabParamList, FinanceTab } from '@/navigation/types';

type Props = BottomTabScreenProps<TabParamList, 'Finance'>;

export function FinanceScreen({ route }: Props) {
  const [tab, setTab] = useState<FinanceTab>(route.params?.tab ?? 'invoices');
  const insets = useSafeAreaInsets();
  const { nav } = useAppNavigation();
  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <AmbientGlow />
      <View className="px-screen">
        <AppHeader
          title="Finance"
          right={
            // Ghost slot on Reports keeps the header height identical across
            // tabs, so the pager never jumps vertically.
            <View style={tab === 'reports' ? { opacity: 0 } : undefined} pointerEvents={tab === 'reports' ? 'none' : 'auto'}>
              <IconButton
                name="plus"
                accessibilityLabel={tab === 'expenses' ? 'New expense' : 'New invoice'}
                onPress={() => nav.navigate(tab === 'expenses' ? 'AddExpense' : 'CreateInvoice')}
              />
            </View>
          }
        />
      </View>
      <SwipeTabs
        tabs={[
          { label: 'Invoices', value: 'invoices' },
          { label: 'Expenses', value: 'expenses' },
          { label: 'Reports', value: 'reports' },
        ]}
        value={tab}
        onChange={setTab}
      >
        <InvoicesTab />
        <ExpensesTab />
        <ReportsTab />
      </SwipeTabs>
    </View>
  );
}

function InvoicesTab() {
  const { data, isLoading, isError, refetch } = useInvoices();
  const { openInvoice } = useAppNavigation();

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load invoices." />;

  const outstanding = data.filter((i) => i.status !== 'PAID').reduce((s, i) => s + i.balance, 0);
  const overdue = data.filter((i) => i.status === 'OVERDUE').length;

  return (
    <FlashList
      data={data}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3 flex-row gap-3">
          <StatCard label="Outstanding" value={formatCurrencyCompact(outstanding)} />
          <StatCard label="Overdue" value={String(overdue)} />
        </View>
      }
      ListEmptyComponent={<EmptyState icon="receipt" title="No invoices" body="Invoices you raise appear here." />}
      renderItem={({ item }) => (
        <View className="mb-2.5 overflow-hidden rounded-xs border border-line bg-surface">
          <ListRow
            leading={<Icon name="receipt" size={22} color="#888888" />}
            title={item.number}
            subtitle={item.customer}
            trailing={
              <View className="items-end gap-1">
                <Mono className="text-callout font-semibold text-fg">
                  {formatCurrency(item.total, { maximumFractionDigits: 0 })}
                </Mono>
                <View className="flex-row items-center gap-1.5">
                  {item.earlyPayEligible && <Badge label="Fast Pay" tone="info" />}
                  <StatusPill status={item.status} />
                </View>
              </View>
            }
            onPress={() => openInvoice(item.id, item.raw)}
            last
          />
        </View>
      )}
    />
  );
}

function ExpensesTab() {
  const { data, isLoading, isError, refetch } = useExpenses();
  const qc = useQueryClient();
  const removeExpense = async (id: string | number) => {
    try {
      await deleteExpense(id);
      await qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete');
    }
  };
  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load expenses." />;

  const total = data.reduce((s, e) => s + e.amount, 0);
  const byCategory = data.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  return (
    <FlashList
      data={data}
      keyExtractor={(e) => String(e.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3 flex-row gap-3">
            <StatCard label="Total expenses" value={formatCurrencyCompact(total)} />
            <StatCard label="Categories" value={String(Object.keys(byCategory).length)} />
          </View>
        </View>
      }
      ListEmptyComponent={<EmptyState icon="dollar" title="No expenses" body="Logged expenses appear here." />}
      renderItem={({ item }) => (
        <View className="mb-2.5 overflow-hidden rounded-xs border border-line bg-surface">
          <ListRow
            leading={<Icon name="dollar" size={22} color="#888888" />}
            title={item.description || item.category}
            subtitle={item.category}
            trailing={
              <View className="flex-row items-center gap-1">
                <Mono className="text-callout font-semibold text-fg">{formatCurrency(item.amount)}</Mono>
                <IconButton name="x" size={16} accessibilityLabel="Delete expense" onPress={() => removeExpense(item.id)} />
              </View>
            }
            last
          />
        </View>
      )}
    />
  );
}

function ReportsTab() {
  const { data, isLoading, isError, refetch } = useFinanceReports();
  if (isLoading) return <View className="p-screen"><ListSkeleton rows={4} /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load reports." />;
  const { summary: f, monthlyTrend, marginByLane } = data;

  const maxTrend = Math.max(1, ...monthlyTrend.flatMap((m) => [m.revenue, m.expense]));

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}>
      <View className="mb-5 flex-row flex-wrap gap-3">
        <View style={{ width: '47.5%' }}>
          <StatCard label="Total revenue" value={formatCurrencyCompact(f.totalRevenue)} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="Net margin" value={`${f.netMarginPct}%`} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="Outstanding" value={formatCurrencyCompact(f.outstanding)} />
        </View>
        <View style={{ width: '47.5%' }}>
          <StatCard label="DSO" value={`${f.dso}d`} />
        </View>
      </View>

      {monthlyTrend.length > 0 && (
        <View className="mb-5">
          <SectionLabel>Revenue vs expense</SectionLabel>
          <View className="rounded-xs border border-line bg-surface p-4">
            {monthlyTrend.map((m) => (
              <View key={m.label} className="mb-3">
                <View className="mb-1 flex-row justify-between">
                  <Mono className="text-micro text-faint">{m.label}</Mono>
                  <Mono className="text-micro text-muted">{formatCurrencyCompact(m.revenue)}</Mono>
                </View>
                <Bar value={m.revenue} max={maxTrend} tone="accent" />
                <View className="h-1" />
                <Bar value={m.expense} max={maxTrend} tone="muted" />
              </View>
            ))}
          </View>
        </View>
      )}

      {marginByLane.length > 0 && (
        <Group label="Margin by lane">
          {marginByLane.slice(0, 8).map((l) => (
            <DetailRow key={l.lane} label={l.lane} value={`${l.margin}%`} mono={false} />
          ))}
        </Group>
      )}

      {monthlyTrend.length === 0 && marginByLane.length === 0 && (
        <EmptyState icon="chart" title="No report data" body="Reports populate as you invoice and record expenses." />
      )}
    </ScrollView>
  );
}

function Bar({ value, max, tone }: { value: number; max: number; tone: 'accent' | 'muted' }) {
  const { colors } = useTheme();
  const pct = Math.max(2, Math.round((value / max) * 100));
  return (
    <View className="h-2 overflow-hidden rounded-xs bg-surface-hover">
      <View
        style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: tone === 'accent' ? colors.accent : colors.faint,
        }}
      />
    </View>
  );
}

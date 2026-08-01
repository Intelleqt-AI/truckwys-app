import { useState } from 'react';
import { View, ScrollView, RefreshControl, Pressable, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  AmbientGlow,
  AppHeader,
  SwipeTabs,
  SearchField,
  FilterChips,
  StatCard,
  StatusPill,
  Group,
  DetailRow,
  ListRow,
  Card,
  Badge,
  Icon,
  IconButton,
  Txt,
  Mono,
  SectionLabel,
  EmptyState,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import {
  useInvoices,
  useExpenses,
  useFinanceReports,
  approveExpense,
  rejectExpense,
  deleteExpense,
  EXPENSE_STATUSES,
  expenseCategoryLabel,
} from './api';
import type { ExpenseLite } from '@/types/domain';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { useTheme } from '@/theme/ThemeProvider';
import { formatCurrency, formatCurrencyCompact, formatDate } from '@/lib/formatters';
import type { TabParamList, FinanceTab } from '@/navigation/types';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';

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
  const { data, isLoading, isError, refetch, isRefetching } = useInvoices();
  useRefetchOnFocus(refetch);
  const { openInvoice } = useAppNavigation();

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load invoices." />;

  const outstanding = data.filter((i) => i.status !== 'PAID').reduce((s, i) => s + i.balance, 0);
  const overdue = data.filter((i) => i.status === 'OVERDUE').length;

  return (
    <FlashList
      data={data}
      keyExtractor={(i) => String(i.id)}
      onRefresh={refetch}
      refreshing={isRefetching}
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

const EXPENSE_STATUS_FILTERS = [
  { label: 'All', value: 'ALL' },
  ...EXPENSE_STATUSES.map((s) => ({ label: s.charAt(0) + s.slice(1).toLowerCase(), value: s })),
];

function ExpensesTab() {
  const { data, isLoading, isError, refetch, isRefetching } = useExpenses();
  useRefetchOnFocus(refetch);
  const { nav } = useAppNavigation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('ALL');

  const refresh = () => invalidateFor(qc, 'expense');
  const act = async (fn: () => Promise<unknown>, errMsg: string) => {
    try {
      await fn();
      refresh();
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : errMsg);
    }
  };

  // Contextual action sheet — Edit always; Approve/Reject only while pending; Delete.
  const openActions = (e: ExpenseLite) => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Edit', onPress: () => nav.navigate('AddExpense', { id: e.id, preview: e.raw }) },
    ];
    if (e.status === 'PENDING') {
      buttons.push({ text: 'Approve', onPress: () => act(() => approveExpense(e.id), 'Could not approve') });
      buttons.push({ text: 'Reject', onPress: () => act(() => rejectExpense(e.id), 'Could not reject') });
    }
    buttons.push({
      text: 'Delete',
      style: 'destructive',
      onPress: () =>
        Alert.alert('Delete expense', 'Permanently delete this expense?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => act(() => deleteExpense(e.id), 'Could not delete') },
        ]),
    });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(e.description || expenseCategoryLabel(e.category), formatCurrency(e.amount), buttons);
  };

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load expenses." />;

  // ── KPI cards (this calendar month, matching web) ──
  const now = new Date();
  const thisMonth = data.filter((e) => {
    if (!e.date) return false;
    const d = new Date(e.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalMtd = thisMonth.filter((e) => e.status === 'APPROVED').reduce((s, e) => s + e.amount, 0);
  const pending = data.filter((e) => e.status === 'PENDING');
  const pendingAmount = pending.reduce((s, e) => s + e.amount, 0);
  const fuelMtd = thisMonth.filter((e) => e.category === 'FUEL').reduce((s, e) => s + e.amount, 0);
  const catTotals = thisMonth.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});
  const topEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];

  const list = data.filter(
    (e) =>
      (statusF === 'ALL' || e.status === statusF) &&
      (!q ||
        `${e.description} ${e.vendor} ${e.expenseNumber}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <FlashList
      data={list}
      keyExtractor={(e) => String(e.id)}
      onRefresh={refetch}
      refreshing={isRefetching}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3 flex-row flex-wrap gap-3">
            <View style={{ width: '47.5%' }}>
              <StatCard label="Total (MTD)" value={formatCurrencyCompact(totalMtd)} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="Pending approval" value={`${pending.length} · ${formatCurrencyCompact(pendingAmount)}`} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="Fuel (MTD)" value={formatCurrencyCompact(fuelMtd)} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard
                label="Top category"
                value={topEntry ? `${expenseCategoryLabel(topEntry[0])}` : 'N/A'}
              />
            </View>
          </View>
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search expenses…" />
          </View>
          <FilterChips options={EXPENSE_STATUS_FILTERS} value={statusF} onChange={setStatusF} />
        </View>
      }
      ItemSeparatorComponent={() => <View className="h-2.5" />}
      ListEmptyComponent={<EmptyState icon="dollar" title="No expenses" body="No expenses match this filter." />}
      renderItem={({ item }) => (
        <Card>
          <Pressable className="p-3.5 active:bg-surface-hover" onPress={() => openActions(item)}>
            <View className="mb-1.5 flex-row items-center justify-between gap-2">
              <Mono className="text-micro uppercase tracking-wide text-accent">
                {expenseCategoryLabel(item.category)}
              </Mono>
              <StatusPill status={item.status} />
            </View>
            <Txt className="text-body font-medium text-fg" numberOfLines={1}>
              {item.description || expenseCategoryLabel(item.category)}
            </Txt>
            <View className="mt-2 flex-row items-center justify-between">
              <Txt className="text-caption text-muted" numberOfLines={1}>
                {[item.vendor, item.date ? formatDate(item.date) : ''].filter(Boolean).join(' · ') || '—'}
              </Txt>
              <Mono className="text-body font-semibold text-fg">{formatCurrency(item.amount)}</Mono>
            </View>
          </Pressable>
        </Card>
      )}
    />
  );
}

function ReportsTab() {
  const { data, isLoading, isError, refetch, isRefetching } = useFinanceReports();
  useRefetchOnFocus(refetch);
  const { colors } = useTheme();
  if (isLoading) return <View className="p-screen"><ListSkeleton rows={4} /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load reports." />;
  const { summary: f, monthlyTrend, marginByLane } = data;

  const maxTrend = Math.max(1, ...monthlyTrend.flatMap((m) => [m.revenue, m.expense]));

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
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

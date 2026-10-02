import { useState } from 'react';
import { View, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  AppHeader,
  SwipeTabs,
  SearchField,
  FilterChips,
  StatCard,
  KpiRow,
  StatusPill,
  Group,
  DetailRow,
  Card,
  IconButton,
  OverflowMenu,
  type OverflowAction,
  Button,
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
import type { ExpenseLite, InvoiceLite } from '@/types/domain';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { toast } from '@/lib/toast';
import { invoiceBalance, isInvoiceOverdue } from '@/lib/invoiceStatus';
import { localDateISO, saDaysBetween } from '@/lib/dates';
import { invalidateFor } from '@/lib/queryInvalidation';
import { useSubscription } from '@/hooks/useSubscription';
import { useTheme } from '@/theme/ThemeProvider';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatNumber,
  formatPercent,
} from '@/lib/formatters';
import type { TabParamList, FinanceTab } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';

type Props = BottomTabScreenProps<TabParamList, 'Finance'>;

export function FinanceScreen({ route }: Props) {
  const [tab, setTab] = useState<FinanceTab>(route.params?.tab ?? 'invoices');
  const insets = useSafeAreaInsets();
  const { nav } = useAppNavigation();
  const subscription = useSubscription();
  // The manual action goes away while billing is blocked; invoice-on-delivery is
  // raised server-side and is deliberately unaffected.
  const hideCreate = subscription.blocked && tab !== 'expenses';

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <View className="px-screen">
        <AppHeader
          title="Finance"
          right={
            // Ghost slot on Reports keeps the header height identical across
            // tabs, so the pager never jumps vertically.
            <View
              style={tab === 'reports' || hideCreate ? { opacity: 0 } : undefined}
              pointerEvents={tab === 'reports' || hideCreate ? 'none' : 'auto'}
            >
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

// Statuses that count as money still owed: the invoice has gone to the customer
// and is not settled. Drafts are not owed until they are sent, and cancelled
// invoices never are. Same set as the backend's one "outstanding" rule.
const OWED_STATUSES = new Set(['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE']);

type InvoiceFilter = 'ALL' | 'SENT' | 'OVERDUE' | 'PAID' | 'DRAFT';

function invoiceMatches(inv: InvoiceLite, filter: InvoiceFilter): boolean {
  if (filter === 'ALL') return true;
  // Overdue is the one shared definition (unpaid, sent, past due), whatever the
  // status string says, so the chip, the tile and the row badge cannot disagree.
  if (filter === 'OVERDUE') return isInvoiceOverdue(inv.raw);
  return inv.status === filter;
}

// Whole rands in lists and tiles; cents live on the invoice itself.
const wholeRands = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });

// Aging line for an invoice that is still owed: "12 days late" (danger, by the
// shared overdue rule), "due today", "due in 3 days". Drafts, paid and cancelled
// invoices have nothing to chase, so they get none.
function dueAging(inv: InvoiceLite): { text: string; late: boolean } | null {
  if (!OWED_STATUSES.has(inv.status) || !inv.dueDate || !(invoiceBalance(inv.raw) > 0)) return null;
  const days = saDaysBetween(inv.dueDate.slice(0, 10), new Date());
  if (days == null) return null;
  if (isInvoiceOverdue(inv.raw) && days > 0) return { text: `${days} ${days === 1 ? 'day' : 'days'} late`, late: true };
  if (days === 0) return { text: 'due today', late: false };
  if (days < 0) return { text: `due in ${-days} ${-days === 1 ? 'day' : 'days'}`, late: false };
  return null;
}

function InvoicesTab() {
  // useInvoices follows every page (fetchAllRows), so the tiles and chip counts
  // below are totals over the whole ledger, not the size of a first page.
  const { data, isLoading, isError, refetch } = useInvoices();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const { openInvoice, goTab } = useAppNavigation();
  const [filter, setFilter] = useState<InvoiceFilter>('ALL');

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load invoices." />;

  const owed = data.filter((i) => OWED_STATUSES.has(i.status));
  const outstanding = owed.reduce((s, i) => s + invoiceBalance(i.raw), 0);
  const overdueList = data.filter((i) => isInvoiceOverdue(i.raw));
  const overdueAmount = overdueList.reduce((s, i) => s + invoiceBalance(i.raw), 0);

  const FILTERS: { label: string; value: InvoiceFilter }[] = [
    { label: 'All', value: 'ALL' },
    { label: 'Sent', value: 'SENT' },
    { label: 'Overdue', value: 'OVERDUE' },
    { label: 'Paid', value: 'PAID' },
    { label: 'Draft', value: 'DRAFT' },
  ];
  // Counts use the same rule as the filter, over the full list, so a chip never
  // disagrees with the rows it shows or with the tiles above.
  const options = FILTERS.map((f) => ({
    ...f,
    count: data.filter((i) => invoiceMatches(i, f.value)).length,
  }));
  const rows = data.filter((i) => invoiceMatches(i, filter));

  return (
    <FlashList
      data={rows}
      keyExtractor={(i) => String(i.id)}
      onRefresh={onRefresh}
      refreshing={refreshing}
      extraData={filter}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3">
            <KpiRow>
              <StatCard
                label="Outstanding"
                value={wholeRands(outstanding)}
                note={`${owed.length} ${owed.length === 1 ? 'invoice' : 'invoices'} unpaid`}
                emphasis
              />
              <StatCard
                label="Overdue"
                value={wholeRands(overdueAmount)}
                note={
                  overdueList.length > 0
                    ? `${overdueList.length} ${overdueList.length === 1 ? 'invoice' : 'invoices'} late`
                    : 'Nothing late'
                }
                tone={overdueList.length > 0 ? 'danger' : undefined}
                onPress={() => setFilter('OVERDUE')}
              />
            </KpiRow>
          </View>
          <FilterChips options={options} value={filter} onChange={(v) => setFilter(v as InvoiceFilter)} />
        </View>
      }
      ListEmptyComponent={
        filter === 'ALL' ? (
          <EmptyState
            icon="receipt"
            title="No invoices yet."
            body="Invoices are generated from completed bookings."
            action={<Button label="View bookings" variant="secondary" onPress={() => goTab('Bookings', { tab: 'history' })} />}
          />
        ) : (
          <EmptyState
            icon="receipt"
            title="No invoices here."
            body="No invoices match this filter."
            action={<Button label="Show all" variant="secondary" onPress={() => setFilter('ALL')} />}
          />
        )
      }
      renderItem={({ item }) => {
        const aging = dueAging(item);
        return (
          <Card className="mb-2.5">
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => openInvoice(item.id, item.raw)}
              accessibilityRole="button"
              className="min-h-[56px] flex-row items-center gap-3 px-4 py-3"
            >
              <View className="flex-1">
                <Txt className="text-body text-fg" numberOfLines={1}>
                  {item.customer}
                </Txt>
                <View className="mt-0.5 flex-row items-center gap-1.5">
                  <Mono className="shrink text-caption text-muted" numberOfLines={1}>
                    {item.number}
                  </Mono>
                  {aging && (
                    <Mono
                      className={`text-caption ${aging.late ? 'font-medium text-danger' : 'text-faint'}`}
                      numberOfLines={1}
                    >
                      {`· ${aging.text}`}
                    </Mono>
                  )}
                </View>
              </View>
              <View className="items-end gap-1">
                <Mono className="text-callout font-semibold text-fg">{wholeRands(item.total)}</Mono>
                <StatusPill
                  status={
                    isInvoiceOverdue(item.raw) && (item.status === 'SENT' || item.status === 'VIEWED')
                      ? 'OVERDUE'
                      : item.status
                  }
                />
              </View>
            </TouchableOpacity>
          </Card>
        );
      }}
    />
  );
}

const EXPENSE_STATUS_FILTERS = [
  { label: 'All', value: 'ALL' },
  ...EXPENSE_STATUSES.map((s) => ({ label: s.charAt(0) + s.slice(1).toLowerCase(), value: s })),
];

function ExpensesTab() {
  const { data, isLoading, isError, refetch } = useExpenses();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
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

  // Per-row action sheet: Edit always; Approve/Reject only while pending; Delete
  // last, after its confirmation.
  const actionsFor = (e: ExpenseLite): OverflowAction[] => [
    { label: 'Edit', icon: 'edit', onPress: () => nav.navigate('AddExpense', { id: e.id, preview: e.raw }) },
    ...(e.status === 'PENDING'
      ? [
          { label: 'Approve', icon: 'check' as const, onPress: () => act(() => approveExpense(e.id), 'Could not approve') },
          { label: 'Reject', icon: 'x' as const, onPress: () => act(() => rejectExpense(e.id), 'Could not reject') },
        ]
      : []),
    {
      label: 'Delete',
      icon: 'trash',
      destructive: true,
      onPress: () =>
        Alert.alert('Delete expense', 'Permanently delete this expense?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => act(() => deleteExpense(e.id), 'Could not delete') },
        ]),
    },
  ];

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load expenses." />;

  // ── KPI cards (this calendar month, matching web) ──
  // Compare the stored YYYY-MM against the local month. new Date('2026-10-01')
  // is UTC midnight, which would put the 1st into the previous month for anyone
  // west of UTC.
  const thisMonthKey = localDateISO().slice(0, 7);
  const thisMonth = data.filter((e) => !!e.date && e.date.slice(0, 7) === thisMonthKey);
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
      onRefresh={onRefresh}
      refreshing={refreshing}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3">
            <KpiRow>
              <StatCard label="Total (MTD)" value={formatCurrencyCompact(totalMtd)} />
              <StatCard
                label="Pending approval"
                value={formatCurrencyCompact(pendingAmount)}
                note={`${pending.length} ${pending.length === 1 ? 'expense' : 'expenses'}`}
                tone={pending.length > 0 ? 'warning' : undefined}
                onPress={() => setStatusF('PENDING')}
              />
              <StatCard label="Fuel (MTD)" value={formatCurrencyCompact(fuelMtd)} />
              {topEntry && <StatCard label="Top category" value={expenseCategoryLabel(topEntry[0])} />}
            </KpiRow>
          </View>
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search expenses…" />
          </View>
          <FilterChips options={EXPENSE_STATUS_FILTERS} value={statusF} onChange={setStatusF} />
        </View>
      }
      ItemSeparatorComponent={() => <View className="h-2.5" />}
      ListEmptyComponent={
        <EmptyState
          icon="banknote"
          title="No expenses"
          body={statusF === 'ALL' && !q ? 'Expenses you record appear here.' : 'No expenses match this filter.'}
        />
      }
      renderItem={({ item }) => (
        <Card className="flex-row items-start">
          <TouchableOpacity
            activeOpacity={0.7}
            className="flex-1 p-3.5"
            accessibilityRole="button"
            onPress={() => nav.navigate('AddExpense', { id: item.id, preview: item.raw })}
          >
            <View className="mb-1.5 flex-row items-center justify-between gap-2">
              <Mono className="text-caption font-medium text-muted">
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
          </TouchableOpacity>
          <View className="py-3 pr-3">
            <OverflowMenu
              actions={actionsFor(item)}
              title={item.description || expenseCategoryLabel(item.category)}
              accessibilityLabel={`Actions for ${item.description || expenseCategoryLabel(item.category)}`}
            />
          </View>
        </Card>
      )}
    />
  );
}

function ReportsTab() {
  const { data, isLoading, isError, refetch } = useFinanceReports();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
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
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.faint}
          colors={[colors.faint]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      <View className="mb-5">
        <KpiRow>
          <StatCard label="Total revenue" value={formatCurrencyCompact(f.totalRevenue)} />
          <StatCard label="Net margin" value={formatPercent(f.netMarginPct)} />
          <StatCard label="Outstanding" value={formatCurrencyCompact(f.outstanding)} />
          <StatCard label="DSO" value={`${formatNumber(f.dso, { maximumFractionDigits: 1 })}d`} />
        </KpiRow>
      </View>

      {monthlyTrend.length > 0 && (
        <View className="mb-5">
          <SectionLabel>Revenue vs expense</SectionLabel>
          <Card className="p-4">
            {monthlyTrend.map((m) => (
              <View key={m.label} className="mb-3">
                <View className="mb-1 flex-row justify-between">
                  <Mono className="text-caption text-faint">{m.label}</Mono>
                  <Mono className="text-caption text-muted">{formatCurrencyCompact(m.revenue)}</Mono>
                </View>
                <Bar value={m.revenue} max={maxTrend} tone="accent" />
                <View className="h-1" />
                <Bar value={m.expense} max={maxTrend} tone="muted" />
              </View>
            ))}
          </Card>
        </View>
      )}

      {marginByLane.length > 0 && (
        <Group label="Margin by lane">
          {marginByLane.slice(0, 8).map((l) => (
            <DetailRow key={l.lane} label={l.lane} value={formatPercent(l.margin)} mono={false} />
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
    <View className="h-2 overflow-hidden rounded-pill" style={{ backgroundColor: colors.chartBar }}>
      <View
        style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: tone === 'accent' ? colors.accent : colors.chartMuted,
        }}
      />
    </View>
  );
}

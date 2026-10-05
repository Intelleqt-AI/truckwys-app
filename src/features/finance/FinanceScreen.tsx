import { useState } from 'react';
import { View, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
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
  Card,
  IconButton,
  OverflowMenu,
  type OverflowAction,
  Button,
  Txt,
  Mono,
  EmptyState,
  ListRow,
} from '@/components/ui';
import { ReportLibrary } from './reports/ReportLibrary';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useCreditNotesList } from '@/lib/finance/api';
import { num, pick } from '@/lib/api/list';
import {
  useInvoicesList,
  useInvoicesSummary,
  useInvoiceAging,
  useExpensesList,
  useExpensesSummary,
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
} from '@/lib/formatters';
import type { TabParamList, FinanceTab } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

type Props = BottomTabScreenProps<TabParamList, 'Finance'>;

export function FinanceScreen({ route }: Props) {
  const [tab, setTab] = useState<FinanceTab>(route.params?.tab ?? 'invoices');
  const insets = useSafeAreaInsets();
  const { nav } = useAppNavigation();
  const subscription = useSubscription();
  // The manual action goes away while billing is blocked; invoice-on-delivery is
  // raised server-side and is deliberately unaffected.
  const hideCreate = subscription.blocked && tab !== 'expenses';
  // Credit notes are issued from an invoice, not from here, and Reports has
  // nothing to add.
  const noAdd = tab === 'reports' || tab === 'credits' || hideCreate;

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <View className="px-screen">
        <AppHeader
          title="Finance"
          right={
            // Ghost slot on Reports keeps the header height identical across
            // tabs, so the pager never jumps vertically.
            <View
              style={noAdd ? { opacity: 0 } : undefined}
              pointerEvents={noAdd ? 'none' : 'auto'}
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
          { label: 'Credits', value: 'credits' },
          { label: 'Expenses', value: 'expenses' },
          { label: 'Reports', value: 'reports' },
        ]}
        value={tab}
        onChange={setTab}
      >
        <InvoicesTab />
        <CreditNotesTab />
        <ExpensesTab />
        <ReportLibrary />
      </SwipeTabs>
    </View>
  );
}

// Statuses that count as money still owed: the invoice has gone to the customer
// and is not settled. Drafts are not owed until they are sent, and cancelled
// invoices never are. Same set as the backend's one "outstanding" rule.
const OWED_STATUSES = new Set(['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE']);

/** Under a server-paged list while the next page loads. */
function MoreSpinner() {
  const { colors } = useTheme();
  return (
    <View className="py-4">
      <ActivityIndicator color={colors.faint} />
    </View>
  );
}

type InvoiceFilter = 'ALL' | 'SENT' | 'OVERDUE' | 'PAID' | 'DRAFT';

// Whole rands in lists and tiles; cents live on the invoice itself.
const wholeRands = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });

/** Credit notes applied to an invoice (incl. VAT), when it has any. */
const creditedOf = (inv: InvoiceLite): number => num(pick(inv.raw, ['credited_amount']));

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
  const [filter, setFilter] = useState<InvoiceFilter>('ALL');
  const [q, setQ] = useState('');
  const search = useDebouncedValue(q.trim());
  // Server-side: one page of rows (status chip and search done by the API), the
  // tiles and chip counts from invoices/summary/ over every invoice, and what is
  // owed in total from the aging report. Nothing here downloads the ledger.
  const list = useInvoicesList(filter, search);
  const summaryQ = useInvoicesSummary();
  const agingQ = useInvoiceAging();
  const { refreshing, onRefresh } = useManualRefresh(async () => {
    await Promise.all([list.refresh(), summaryQ.refetch(), agingQ.refetch()]);
  });
  const { openInvoice, goTab } = useAppNavigation();

  if (list.isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (list.isError && list.combinedData.length === 0)
    return <ErrorState onRetry={() => void list.refresh()} message="Couldn't load invoices." />;

  const rows = list.combinedData;
  const sum = summaryQ.data;
  const aging = agingQ.data?.summary;
  const overdueCount = sum?.overdue_count ?? 0;

  const FILTERS: { label: string; value: InvoiceFilter }[] = [
    { label: 'All', value: 'ALL' },
    { label: 'Sent', value: 'SENT' },
    { label: 'Overdue', value: 'OVERDUE' },
    { label: 'Paid', value: 'PAID' },
    { label: 'Draft', value: 'DRAFT' },
  ];
  // Counts are the server's, over every invoice, by the same rule as the filter.
  const options = FILTERS.map((f) => ({
    ...f,
    count: sum?.status_counts?.[f.value === 'ALL' ? 'All' : f.value],
  }));

  return (
    <FlashList
      data={rows}
      keyExtractor={(i) => String(i.id)}
      onRefresh={onRefresh}
      refreshing={refreshing}
      showsVerticalScrollIndicator={false}
      extraData={filter}
      onEndReached={() => list.hasMore && !list.isFetching && void list.loadMore()}
      onEndReachedThreshold={1.5}
      ListFooterComponent={list.isFetching ? <MoreSpinner /> : null}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3">
            <KpiRow>
              <StatCard
                label="Outstanding"
                value={aging ? wholeRands(aging.total_outstanding) : '—'}
                note={
                  aging
                    ? `${aging.total_invoice_count} ${aging.total_invoice_count === 1 ? 'invoice' : 'invoices'} unpaid`
                    : undefined
                }
                emphasis
              />
              <StatCard
                label="Overdue"
                value={sum ? wholeRands(sum.overdue_amount) : '—'}
                note={
                  !sum
                    ? undefined
                    : overdueCount > 0
                      ? `${overdueCount} ${overdueCount === 1 ? 'invoice' : 'invoices'} late`
                      : 'Nothing late'
                }
                tone={overdueCount > 0 ? 'danger' : undefined}
                onPress={() => setFilter('OVERDUE')}
              />
            </KpiRow>
          </View>
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search invoices…" />
          </View>
          <FilterChips options={options} value={filter} onChange={(v) => setFilter(v as InvoiceFilter)} />
        </View>
      }
      ListEmptyComponent={
        filter === 'ALL' && !search ? (
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
            action={<Button label="Show all" variant="secondary" onPress={() => { setFilter('ALL'); setQ(''); }} />}
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
                {creditedOf(item) > 0 && (
                  <Mono className="text-caption text-faint">{`${wholeRands(creditedOf(item))} credited`}</Mono>
                )}
                <StatusPill
                  status={
                    isInvoiceOverdue(item.raw) && (item.status === 'SENT' || item.status === 'VIEWED')
                      ? 'OVERDUE'
                      // An invoice that has been cancelled is "Void" (loads and quotes keep "Cancelled").
                      : item.status === 'CANCELLED'
                        ? 'VOID'
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

type CreditFilter = 'ALL' | 'ISSUED' | 'VOID';

/** Credit notes, newest first: what was credited, against which invoice, and why. */
function CreditNotesTab() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<CreditFilter>('ALL');
  const search = useDebouncedValue(q.trim());
  // Server-side: newest first, status and search done by the API; page 1 carries
  // the chip counts over every credit note.
  const list = useCreditNotesList(filter, search);
  const { refreshing, onRefresh } = useManualRefresh(list.refresh);
  const { nav } = useAppNavigation();

  if (list.isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (list.isError && list.combinedData.length === 0)
    return <ErrorState onRetry={() => void list.refresh()} message="Couldn't load credit notes." />;

  const rows = list.combinedData;
  const counts = list.extras?.status_counts;
  const options = [
    { label: 'All', value: 'ALL' as const, count: counts?.ALL },
    { label: 'Issued', value: 'ISSUED' as const, count: counts?.ISSUED },
    { label: 'Void', value: 'VOID' as const, count: counts?.VOID },
  ];

  return (
    <FlashList
      data={rows}
      keyExtractor={(c) => String(c.id)}
      onRefresh={onRefresh}
      refreshing={refreshing}
      showsVerticalScrollIndicator={false}
      extraData={filter}
      onEndReached={() => list.hasMore && !list.isFetching && void list.loadMore()}
      onEndReachedThreshold={1.5}
      ListFooterComponent={list.isFetching ? <MoreSpinner /> : null}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search credit notes…" />
          </View>
          <FilterChips options={options} value={filter} onChange={setFilter} />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="receipt"
          title={counts?.ALL === 0 ? 'No credit notes yet' : 'No credit notes here'}
          body={
            counts?.ALL === 0
              ? 'To correct an invoice that has been sent, open it and choose Issue credit note.'
              : 'No credit notes match this filter.'
          }
        />
      }
      renderItem={({ item }) => (
        <Card className="mb-2.5">
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => nav.navigate('CreditNoteDetail', { id: item.id })}
            accessibilityRole="button"
            className="min-h-[56px] flex-row items-center gap-3 px-4 py-3"
          >
            <View className="flex-1">
              <Txt className="text-body text-fg" numberOfLines={1}>
                {item.customer_name}
              </Txt>
              <Mono className="mt-0.5 text-caption text-muted" numberOfLines={1}>
                {`${item.credit_note_number} · ${item.invoice_number} · ${formatDate(item.issue_date)}`}
              </Mono>
            </View>
            <View className="items-end gap-1">
              <Mono
                className={`text-callout font-semibold ${item.status === 'VOID' ? 'text-faint line-through' : 'text-fg'}`}
              >
                {wholeRands(num(item.total_amount))}
              </Mono>
              <StatusPill status={item.status} />
            </View>
          </TouchableOpacity>
        </Card>
      )}
    />
  );
}

const EXPENSE_STATUS_FILTERS = [
  { label: 'All', value: 'ALL' },
  ...EXPENSE_STATUSES.map((s) => ({ label: s.charAt(0) + s.slice(1).toLowerCase(), value: s })),
];

function ExpensesTab() {
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('ALL');
  const search = useDebouncedValue(q.trim());
  // Server-side: one page of rows (status and search done by the API, newest
  // first) plus expenses/summary/ for the tiles and chip counts over every
  // expense.
  const list = useExpensesList(statusF, search);
  const summaryQ = useExpensesSummary();
  const { refreshing, onRefresh } = useManualRefresh(async () => {
    await Promise.all([list.refresh(), summaryQ.refetch()]);
  });
  const { nav } = useAppNavigation();
  const qc = useQueryClient();

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

  if (list.isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (list.isError && list.combinedData.length === 0)
    return <ErrorState onRetry={() => void list.refresh()} message="Couldn't load expenses." />;

  // ── Tiles: the server's summary over every expense ──
  // Spend is approved and pending (rejected is not spend). "This month" is the
  // current calendar month's entry; the local date, not UTC, names the month.
  const sum = summaryQ.data;
  const monthKey = localDateISO().slice(0, 7);
  const thisMonth = sum?.months.find(
    (m) => `${m.year}-${String(m.month).padStart(2, '0')}` === monthKey,
  );
  const topCategory = sum?.by_category[0];
  const statusCounts = sum?.status_counts;
  const statusOptions = EXPENSE_STATUS_FILTERS.map((f) => ({
    ...f,
    count: statusCounts?.[f.value],
  }));
  const pendingCount = sum?.pending_count ?? 0;
  const data = list.combinedData;

  return (
    <FlashList
      data={data}
      keyExtractor={(e) => String(e.id)}
      onRefresh={onRefresh}
      refreshing={refreshing}
      showsVerticalScrollIndicator={false}
      extraData={statusF}
      onEndReached={() => list.hasMore && !list.isFetching && void list.loadMore()}
      onEndReachedThreshold={1.5}
      ListFooterComponent={list.isFetching ? <MoreSpinner /> : null}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3">
            <KpiRow>
              <StatCard
                label="This month"
                value={sum ? formatCurrencyCompact(thisMonth?.amount ?? 0) : '—'}
                note="Approved and pending"
              />
              <StatCard
                label="Pending approval"
                value={sum ? formatCurrencyCompact(sum.pending_amount) : '—'}
                note={sum ? `${pendingCount} ${pendingCount === 1 ? 'expense' : 'expenses'}` : undefined}
                tone={pendingCount > 0 ? 'warning' : undefined}
                onPress={() => setStatusF('PENDING')}
              />
              <StatCard
                label="Approved, 12 months"
                value={sum ? formatCurrencyCompact(sum.approved_year_amount) : '—'}
              />
              {topCategory && (
                <StatCard label="Top category" value={expenseCategoryLabel(topCategory.category)} note="All time" />
              )}
            </KpiRow>
          </View>
          <Card className="mb-3 overflow-hidden">
            <ListRow
              title="Suppliers"
              subtitle="Who you buy from, linked to expenses"
              onPress={() => nav.navigate('Suppliers')}
              last
            />
          </Card>
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search expenses…" />
          </View>
          <FilterChips options={statusOptions} value={statusF} onChange={setStatusF} />
        </View>
      }
      ItemSeparatorComponent={() => <View className="h-2.5" />}
      ListEmptyComponent={
        <EmptyState
          icon="banknote"
          title="No expenses"
          body={statusF === 'ALL' && !search ? 'Expenses you record appear here.' : 'No expenses match this filter.'}
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
              <View className="items-end">
                <Mono className="text-body font-semibold text-fg">{formatCurrency(item.amount)}</Mono>
                {item.vat > 0 && (
                  <Mono className="text-caption text-faint">{`VAT ${formatCurrency(item.vat)}`}</Mono>
                )}
              </View>
            </View>
          </TouchableOpacity>
          <View className="py-3 pr-3">
            <OverflowMenu
              actions={actionsFor(item)}
              title={item.description || expenseCategoryLabel(item.category)}
              subtitle={[
                item.description ? expenseCategoryLabel(item.category) : '',
                formatCurrency(item.amount),
                item.date ? formatDate(item.date) : '',
              ]
                .filter(Boolean)
                .join(' · ')}
              accessibilityLabel={`Actions for ${item.description || expenseCategoryLabel(item.category)}`}
            />
          </View>
        </Card>
      )}
    />
  );
}


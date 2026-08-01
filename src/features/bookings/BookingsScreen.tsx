import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  AmbientGlow,
  AppHeader,
  SwipeTabs,
  FilterChips,
  SearchField,
  StatCard,
  StatusPill,
  Avatar,
  Card,
  Icon,
  Txt,
  Mono,
  ListRow,
  Button,
  Fab,
  EmptyState,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useQuotes, useLoads, convertQuoteToLoad } from './api';
import { AssignSheet } from './AssignSheet';
import { str, pick } from '@/lib/api/list';
import type { QuoteLite, LoadLite } from '@/types/domain';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { TabParamList, BookingsTab } from '@/navigation/types';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';

type Props = BottomTabScreenProps<TabParamList, 'Bookings'>;

const ACTIVE = ['PENDING', 'ASSIGNED', 'LOADING', 'IN_TRANSIT'];
const DONE = ['DELIVERED', 'INVOICED', 'CANCELLED'];

export function BookingsScreen({ route }: Props) {
  const [tab, setTab] = useState<BookingsTab>(route.params?.tab ?? 'quotes');
  const { createQuote, aiQuote } = useAppNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <AmbientGlow />
      <View className="px-screen">
        <AppHeader
          eyebrow="Operations"
          title="Bookings"
          live
          right={
            <Button label="AI quote" icon="sparkle" variant="ghost" onPress={aiQuote} />
          }
        />
      </View>
      <SwipeTabs
        tabs={[
          { label: 'Quotes', value: 'quotes' },
          { label: 'Orders', value: 'orders' },
          { label: 'History', value: 'history' },
        ]}
        value={tab}
        onChange={setTab}
      >
        <QuotesTab />
        <OrdersTab />
        <HistoryTab />
      </SwipeTabs>
      <Fab onPress={() => createQuote()} />
    </View>
  );
}

// ── Quotes ───────────────────────────────────────────────────────────────
const QUOTE_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'In-Transit', value: 'IT' },
  { label: 'Completed', value: 'COMPLETED' },
];

function QuotesTab() {
  const { data, isLoading, isError, refetch, isRefetching } = useQuotes();
  useRefetchOnFocus(refetch);
  const [filter, setFilter] = useState('ALL');
  // One sheet instance serves the whole list — the card only sets the target.
  const [convertQuote, setConvertQuote] = useState<QuoteLite | null>(null);
  const [convertBusy, setConvertBusy] = useState(false);
  const { openQuote, openLoad } = useAppNavigation();
  const qc = useQueryClient();

  const convert = async (driverId: string, vehicleId: string) => {
    if (!convertQuote) return;
    setConvertBusy(true);
    try {
      const created = await convertQuoteToLoad(convertQuote.id, {
        driver_id: driverId,
        vehicle_id: vehicleId,
      });
      invalidateFor(qc, 'quote', 'load');
      setConvertQuote(null);
      toast.success(driverId && vehicleId ? 'Converted and assigned' : 'Converted to booking');
      const loadId = pick((created ?? {}) as Record<string, unknown>, ['id', 'load_id', 'pk']);
      if (loadId != null) openLoad(loadId as string | number);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not convert quote');
    } finally {
      setConvertBusy(false);
    }
  };

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load quotes." />;

  const list = data.filter((q) => filter === 'ALL' || q.status === filter);

  return (
    <>
      <FlashList
        data={list}
        keyExtractor={(q) => String(q.id)}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
        ItemSeparatorComponent={() => <View className="h-2.5" />}
        ListHeaderComponent={
          <View className="mb-3">
            <FilterChips options={QUOTE_FILTERS} value={filter} onChange={setFilter} />
          </View>
        }
        ListEmptyComponent={<EmptyState icon="file" title="No quotes" body="No quotes match this filter." />}
        renderItem={({ item }) => (
          <QuoteCard
            quote={item}
            onPress={() => openQuote(item.id, item.raw)}
            onConvert={() => setConvertQuote(item)}
          />
        )}
      />
      {convertQuote && (
        <AssignSheet
          mode="convert"
          reference={convertQuote.code}
          vehicleType={str(pick(convertQuote.raw, ['vehicle_type'])) || undefined}
          busy={convertBusy}
          onConfirm={convert}
          onCancel={() => setConvertQuote(null)}
        />
      )}
    </>
  );
}

function QuoteCard({
  quote,
  onPress,
  onConvert,
}: {
  quote: QuoteLite;
  onPress: () => void;
  onConvert: () => void;
}) {
  // Web offers → Booking on accepted cards in the list as well as on the
  // detail page (QuotesList.tsx).
  const accepted = ['ACCEPTED', 'APPROVED'].includes(quote.status);
  return (
    <Card>
      <Pressable className="p-3.5 active:bg-surface-hover" onPress={onPress}>
        <View className="mb-2 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Mono className="text-micro font-semibold text-accent">{quote.code}</Mono>
          </View>
          <StatusPill status={quote.status} />
        </View>
        <Txt className="text-body font-medium text-fg">{quote.customer}</Txt>
        <Txt className="mt-0.5 text-sub text-muted">
          {quote.origin} → {quote.destination}
        </Txt>
        <View className="mt-3 flex-row items-center justify-between">
          <Mono className="text-body font-semibold text-fg">{formatCurrency(quote.amount)}</Mono>
          {quote.marginPct != null && (
            <Mono className="text-micro text-faint">Margin {quote.marginPct}%</Mono>
          )}
        </View>
      </Pressable>
      {accepted && (
        <Pressable
          onPress={onConvert}
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 border-t border-line-row active:bg-surface-hover"
        >
          <Mono className="text-micro tracking-label uppercase text-accent">Convert to booking</Mono>
          <Icon name="arrowRight" size={14} color="#4D9EFF" />
        </Pressable>
      )}
    </Card>
  );
}

// ── Orders / History (loads) ───────────────────────────────────────────────
function OrdersTab() {
  const { data, isLoading, isError, refetch, isRefetching } = useLoads();
  useRefetchOnFocus(refetch);
  const [filter, setFilter] = useState('ALL');
  const { openLoad } = useAppNavigation();

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load orders." />;

  const active = data.filter((l) => ACTIVE.includes(l.status));
  const list = active.filter((l) => filter === 'ALL' || l.status === filter);
  const revenue = active.reduce((s, l) => s + l.amount, 0);

  return (
    <LoadList
      list={list}
      onOpen={openLoad}
      onRefresh={refetch}
      refreshing={isRefetching}
      stats={[
        { label: 'Active orders', value: String(active.length) },
        { label: 'In transit', value: String(active.filter((l) => l.status === 'IN_TRANSIT').length) },
        { label: 'Loading', value: String(active.filter((l) => l.status === 'LOADING').length) },
        { label: 'Revenue', value: formatCurrencyCompact(revenue) },
      ]}
      filters={[
        { label: 'All', value: 'ALL' },
        { label: 'Pending', value: 'PENDING' },
        { label: 'Assigned', value: 'ASSIGNED' },
        { label: 'Loading', value: 'LOADING' },
        { label: 'Transit', value: 'IN_TRANSIT' },
      ]}
      filter={filter}
      onFilter={setFilter}
    />
  );
}

function HistoryTab() {
  const { data, isLoading, isError, refetch, isRefetching } = useLoads();
  useRefetchOnFocus(refetch);
  const [filter, setFilter] = useState('ALL');
  const [q, setQ] = useState('');
  const { openLoad } = useAppNavigation();

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load history." />;

  const done = data.filter((l) => DONE.includes(l.status));
  const list = done.filter(
    (l) =>
      (filter === 'ALL' || l.status === filter) &&
      (!q || `${l.loadNumber} ${l.customer}`.toLowerCase().includes(q.toLowerCase())),
  );
  const revenue = done.filter((l) => l.status !== 'CANCELLED').reduce((s, l) => s + l.amount, 0);

  return (
    <LoadList
      list={list}
      onOpen={openLoad}
      onRefresh={refetch}
      refreshing={isRefetching}
      search={{ value: q, onChange: setQ }}
      stats={[
        { label: 'Completed', value: String(done.filter((l) => l.status !== 'CANCELLED').length) },
        { label: 'Invoiced', value: String(done.filter((l) => l.status === 'INVOICED').length) },
        { label: 'Cancelled', value: String(done.filter((l) => l.status === 'CANCELLED').length) },
        { label: 'Total revenue', value: formatCurrencyCompact(revenue) },
      ]}
      filters={[
        { label: 'All', value: 'ALL' },
        { label: 'Delivered', value: 'DELIVERED' },
        { label: 'Invoiced', value: 'INVOICED' },
        { label: 'Cancelled', value: 'CANCELLED' },
      ]}
      filter={filter}
      onFilter={setFilter}
    />
  );
}

function LoadList({
  list,
  onOpen,
  stats,
  filters,
  filter,
  onFilter,
  search,
  onRefresh,
  refreshing,
}: {
  list: LoadLite[];
  onOpen: (id: string | number, preview?: Record<string, unknown>) => void;
  stats: { label: string; value: string }[];
  filters: { label: string; value: string }[];
  filter: string;
  onFilter: (v: string) => void;
  search?: { value: string; onChange: (v: string) => void };
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <FlashList
      data={list}
      keyExtractor={(l) => String(l.id)}
      onRefresh={onRefresh}
      refreshing={refreshing}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3 flex-row flex-wrap gap-2.5">
            {stats.map((s) => (
              <View key={s.label} style={{ width: '47.5%' }}>
                <StatCard label={s.label} value={s.value} />
              </View>
            ))}
          </View>
          {search && (
            <View className="mb-3">
              <SearchField value={search.value} onChangeText={search.onChange} placeholder="Search history…" />
            </View>
          )}
          <FilterChips options={filters} value={filter} onChange={onFilter} />
        </View>
      }
      ListEmptyComponent={<EmptyState icon="truck" title="No loads" body="No loads match this filter." />}
      renderItem={({ item }) => (
        <View className="overflow-hidden rounded-xs border border-line bg-surface">
          <ListRow
            leading={<Avatar name={item.customer} size={38} />}
            title={item.loadNumber}
            subtitle={`${item.customer} · ${item.pickupState}→${item.deliveryState}`}
            trailing={
              <View className="items-end gap-1">
                <Mono className="text-callout font-semibold text-fg">
                  {formatCurrency(item.amount, { maximumFractionDigits: 0 })}
                </Mono>
                <StatusPill status={item.status} />
              </View>
            }
            onPress={() => onOpen(item.id, item.raw)}
            last
          />
        </View>
      )}
      ItemSeparatorComponent={() => <View className="h-2.5" />}
    />
  );
}

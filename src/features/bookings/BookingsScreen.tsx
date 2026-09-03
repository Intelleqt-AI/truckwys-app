import { useState } from 'react';
import { View, Pressable, Platform, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Fab,
  EmptyState,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useQuotes, useLoads, useLoadsForConvertLookup, needsLoadsLookup } from './api';
import { str, pick } from '@/lib/api/list';
import type { QuoteLite, LoadLite } from '@/types/domain';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/formatters';
import type { TabParamList, BookingsTab } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';

type Props = BottomTabScreenProps<TabParamList, 'Bookings'>;

const ACTIVE = ['PENDING', 'ASSIGNED', 'LOADING', 'IN_TRANSIT'];
const DONE = ['DELIVERED', 'INVOICED', 'CANCELLED'];

export function BookingsScreen({ route }: Props) {
  const [tab, setTab] = useState<BookingsTab>(route.params?.tab ?? 'quotes');
  const { createQuote } = useAppNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <AmbientGlow />
      <View className="px-screen">
        <AppHeader eyebrow="Operations" title="Bookings" live />
      </View>
      <SwipeTabs
        tabs={[
          { label: 'Quotes', value: 'quotes' },
          { label: 'Orders', value: 'orders' },
          { label: 'History', value: 'history' },
        ]}
        value={tab}
        onChange={setTab}
        lazy
      >
        <QuotesTab />
        <OrdersTab />
        <HistoryTab />
      </SwipeTabs>
      {/* Long-press for the voice/AI entry point — undiscoverable alone, so
          it's a second path onto the same screen, not the only one. */}
      <Fab
        onPress={() => createQuote()}
        onLongPress={() => {
          if (Platform.OS !== 'web') void Haptics.selectionAsync();
          createQuote(true);
        }}
      />
    </View>
  );
}

// ── Quotes ───────────────────────────────────────────────────────────────
const QUOTE_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Declined', value: 'DECLINED' },
];

function QuotesTab() {
  const {
    combinedData: data,
    isLoading,
    isError,
    refresh,
    loadMore,
    hasMore,
    isFetching,
  } = useQuotes();
  // Only worth walking the loads table when a visible quote is accepted but
  // doesn't already carry its own load id — see needsLoadsLookup.
  const { data: loadByQuote } = useLoadsForConvertLookup(needsLoadsLookup(data));
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  const [filter, setFilter] = useState('ALL');
  const [q, setQ] = useState('');
  const { openQuote, openAssign, openLoad } = useAppNavigation();

  if (isLoading)
    return (
      <View className="p-screen">
        <ListSkeleton />
      </View>
    );
  if (isError || !data) return <ErrorState onRetry={refresh} message="Couldn't load quotes." />;

  const list = data.filter(
    (item) =>
      (filter === 'ALL' || item.status === filter) &&
      (!q || `${item.code} ${item.customer}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <FlashList
      data={list}
      keyExtractor={(q) => String(q.id)}
      showsVerticalScrollIndicator={false}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={() => hasMore && !isFetching && loadMore()}
      onEndReachedThreshold={0.5}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ItemSeparatorComponent={() => <View className="h-2.5" />}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search quotes…" />
          </View>
          <FilterChips options={QUOTE_FILTERS} value={filter} onChange={setFilter} />
        </View>
      }
      ListFooterComponent={
        isFetching ? (
          <View className="py-4">
            <ActivityIndicator />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState icon="file" title="No quotes" body="No quotes match this filter." />
      }
      renderItem={({ item }) => {
        // The quote row carries its load once converted; fall back to scanning
        // loads by their `quote` back-reference, matching QuoteDetailScreen.
        const convertedFromQuote = pick(item.raw, ['load_id', 'load', 'booking_id']);
        const convertedLoadId =
          convertedFromQuote != null
            ? (convertedFromQuote as string | number)
            : (loadByQuote?.get(String(item.id)) ?? null);
        return (
          <QuoteCard
            quote={item}
            convertedLoadId={convertedLoadId}
            onPress={() => openQuote(item.id, item.raw)}
            onConvert={() =>
              openAssign({
                mode: 'convert',
                quoteId: item.id,
                reference: item.code,
                vehicleType: str(pick(item.raw, ['vehicle_type'])) || undefined,
              })
            }
            onViewBooking={() => openLoad(convertedLoadId!)}
          />
        );
      }}
    />
  );
}

function QuoteCard({
  quote,
  convertedLoadId,
  onPress,
  onConvert,
  onViewBooking,
}: {
  quote: QuoteLite;
  convertedLoadId: string | number | null;
  onPress: () => void;
  onConvert: () => void;
  onViewBooking: () => void;
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
        <Txt className="mt-0.5 text-sub text-muted" numberOfLines={1} ellipsizeMode="tail">
          {[quote.origin, ...quote.stopLabels, quote.destination].join(' → ')}
        </Txt>
        <View className="mt-3 flex-row items-center justify-between">
          <Mono className="text-body font-semibold text-fg">{formatCurrency(quote.amount)}</Mono>
          {quote.marginPct != null && (
            <Mono className="text-micro text-faint">Margin {formatPercent(quote.marginPct)}</Mono>
          )}
        </View>
      </Pressable>
      {accepted && convertedLoadId == null && (
        <Pressable
          onPress={onConvert}
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 border-t border-line-row active:bg-surface-hover"
        >
          <Mono className="text-micro uppercase tracking-label text-accent">
            Convert to booking
          </Mono>
          <Icon name="arrowRight" size={14} color="#4D9EFF" />
        </Pressable>
      )}
      {accepted && convertedLoadId != null && (
        <Pressable
          onPress={onViewBooking}
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 border-t border-line-row active:bg-surface-hover"
        >
          <Mono className="text-micro uppercase tracking-label text-accent">View booking</Mono>
          <Icon name="arrowRight" size={14} color="#4D9EFF" />
        </Pressable>
      )}
    </Card>
  );
}

// ── Orders / History (loads) ───────────────────────────────────────────────
function OrdersTab() {
  const {
    combinedData: data,
    isLoading,
    isError,
    refresh,
    loadMore,
    hasMore,
    isFetching,
  } = useLoads();
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  const [filter, setFilter] = useState('ALL');
  const { openLoad } = useAppNavigation();

  if (isLoading)
    return (
      <View className="p-screen">
        <ListSkeleton />
      </View>
    );
  if (isError || !data) return <ErrorState onRetry={refresh} message="Couldn't load orders." />;

  const active = data.filter((l) => ACTIVE.includes(l.status));
  const list = active.filter((l) => filter === 'ALL' || l.status === filter);
  const revenue = active.reduce((s, l) => s + l.amount, 0);

  return (
    <LoadList
      list={list}
      onOpen={openLoad}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={() => hasMore && !isFetching && loadMore()}
      isFetchingMore={isFetching}
      stats={[
        { label: 'Active orders', value: String(active.length) },
        {
          label: 'In transit',
          value: String(active.filter((l) => l.status === 'IN_TRANSIT').length),
        },
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
  const {
    combinedData: data,
    isLoading,
    isError,
    refresh,
    loadMore,
    hasMore,
    isFetching,
  } = useLoads();
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  const [filter, setFilter] = useState('ALL');
  const [q, setQ] = useState('');
  const { openLoad } = useAppNavigation();

  if (isLoading)
    return (
      <View className="p-screen">
        <ListSkeleton />
      </View>
    );
  if (isError || !data) return <ErrorState onRetry={refresh} message="Couldn't load history." />;

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
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={() => hasMore && !isFetching && loadMore()}
      isFetchingMore={isFetching}
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
  onEndReached,
  isFetchingMore,
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
  onEndReached?: () => void;
  isFetchingMore?: boolean;
}) {
  return (
    <FlashList
      data={list}
      keyExtractor={(l) => String(l.id)}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListFooterComponent={
        isFetchingMore ? (
          <View className="py-4">
            <ActivityIndicator />
          </View>
        ) : null
      }
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3 flex-row flex-wrap justify-between">
            {stats.map((s) => (
              <View
                key={s.label}
                className="flex-row"
                style={{ width: '48%', marginBottom: 10 }}
              >
                <StatCard label={s.label} value={s.value} />
              </View>
            ))}
          </View>
          {search && (
            <View className="mb-3">
              <SearchField
                value={search.value}
                onChangeText={search.onChange}
                placeholder="Search history…"
              />
            </View>
          )}
          <FilterChips options={filters} value={filter} onChange={onFilter} />
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="truck" title="No loads" body="No loads match this filter." />
      }
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

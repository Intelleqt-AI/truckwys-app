import { useEffect, useRef, useState } from 'react';
import { View, Pressable, Platform, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
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
import { useQuotes, useLoads } from './api';
import { str, pick } from '@/lib/api/list';
import type { QuoteLite, LoadLite } from '@/types/domain';
import { bookedLoadOf, quoteStage, type QuoteStage } from '@/lib/quoteStage';
import { staleOf, staleLabel } from '@/lib/staleWork';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { formatCurrency, formatCurrencyCompact, formatPercent } from '@/lib/formatters';
import type { TabParamList, BookingsTab } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useTheme } from '@/theme/ThemeProvider';

type Props = BottomTabScreenProps<TabParamList, 'Bookings'>;

const ACTIVE = ['PENDING', 'ASSIGNED', 'LOADING', 'IN_TRANSIT'];
const DONE = ['DELIVERED', 'INVOICED', 'CANCELLED'];

export function BookingsScreen({ route }: Props) {
  const [tab, setTab] = useState<BookingsTab>(route.params?.tab ?? 'quotes');
  const { createQuote } = useAppNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
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
// Same stages as the web board. Accepted means won and still to book; Booked
// is a quote converted into a load; Expired is a Draft or Sent quote past its
// valid-until day, so it is never counted as live work.
const QUOTE_FILTERS: { label: string; value: 'ALL' | QuoteStage }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Booked', value: 'BOOKED' },
  { label: 'Declined', value: 'DECLINED' },
  { label: 'Expired', value: 'EXPIRED' },
];

// The server can filter these directly. Declined (which also holds Sent quotes
// marked lost) and Expired (a date rule, not a status) are read off the full
// list instead.
const SERVER_FILTERS = ['DRAFT', 'SENT', 'ACCEPTED', 'BOOKED'];
// How many rows a narrowed view tries to fill before it stops asking for pages.
const FILL_TO = 8;
const MAX_AUTO_PAGES = 8;

function QuotesTab() {
  const [filter, setFilter] = useState<'ALL' | QuoteStage>('ALL');
  const {
    combinedData: data,
    isLoading,
    isError,
    refresh,
    loadMore,
    hasMore,
    isFetching,
  } = useQuotes(SERVER_FILTERS.includes(filter) ? filter : undefined);
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  const [q, setQ] = useState('');
  const { openQuote, openAssign, openLoad } = useAppNavigation();

  const list = data.filter(
    (item) =>
      (filter === 'ALL' || quoteStage(item.raw) === filter) &&
      (!q || `${item.code} ${item.customer}`.toLowerCase().includes(q.toLowerCase())),
  );

  // A narrowed view can come up short on the pages loaded so far (for example
  // Expired among a long list of live quotes), so keep asking for the next page
  // a few times rather than showing an empty list that is only empty so far.
  const autoPages = useRef(0);
  useEffect(() => {
    autoPages.current = 0;
  }, [filter, q]);
  useEffect(() => {
    if (isLoading || isFetching || !hasMore) return;
    if (filter === 'ALL' && !q) return;
    if (list.length >= FILL_TO || autoPages.current >= MAX_AUTO_PAGES) return;
    autoPages.current += 1;
    void loadMore();
  }, [isLoading, isFetching, hasMore, filter, q, list.length, loadMore]);

  if (isLoading)
    return (
      <View className="p-screen">
        <ListSkeleton />
      </View>
    );
  if (isError || !data) return <ErrorState onRetry={refresh} message="Couldn't load quotes." />;

  return (
    <FlashList
      data={list}
      keyExtractor={(q) => String(q.id)}
      showsVerticalScrollIndicator={false}
      onRefresh={onRefresh}
      refreshing={refreshing}
      extraData={filter}
      onEndReached={() => hasMore && !isFetching && loadMore()}
      onEndReachedThreshold={0.5}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ItemSeparatorComponent={() => <View className="h-2.5" />}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search quotes…" />
          </View>
          <FilterChips
            options={QUOTE_FILTERS}
            value={filter}
            onChange={(v) => setFilter(v as 'ALL' | QuoteStage)}
          />
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
        <EmptyState
          icon="file"
          title="No quotes"
          body={
            filter === 'BOOKED'
              ? 'No booked quotes. Accepted quotes land here once converted to a booking.'
              : 'No quotes match this filter.'
          }
        />
      }
      renderItem={({ item }) => {
        // The quote API names the load it was booked as, so no scan of the
        // loads table is needed.
        const booked = bookedLoadOf(item.raw);
        return (
          <QuoteCard
            quote={item}
            bookedLoad={booked}
            onPress={() => openQuote(item.id, item.raw)}
            onConvert={() =>
              openAssign({
                mode: 'convert',
                quoteId: item.id,
                reference: item.code,
                vehicleType: str(pick(item.raw, ['vehicle_type'])) || undefined,
              })
            }
            onViewBooking={() => booked && openLoad(booked.id)}
          />
        );
      }}
    />
  );
}

function QuoteCard({
  quote,
  bookedLoad,
  onPress,
  onConvert,
  onViewBooking,
}: {
  quote: QuoteLite;
  bookedLoad: { id: number | string; load_number?: string } | null;
  onPress: () => void;
  onConvert: () => void;
  onViewBooking: () => void;
}) {
  const { colors } = useTheme();
  const stage = quoteStage(quote.raw) ?? quote.status;
  return (
    <Card>
      <Pressable className="p-3.5 active:bg-surface-hover" onPress={onPress}>
        <View className="mb-2 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Mono className="text-caption font-medium text-muted">{quote.code}</Mono>
          </View>
          <StatusPill status={stage} />
        </View>
        <Txt className="text-body font-medium text-fg">{quote.customer}</Txt>
        <Txt className="mt-0.5 text-sub text-muted" numberOfLines={1} ellipsizeMode="tail">
          {[quote.origin, ...quote.stopLabels, quote.destination].join(' → ')}
        </Txt>
        <View className="mt-3 flex-row items-center justify-between">
          <Mono className="text-body font-semibold text-fg">{formatCurrency(quote.amount)}</Mono>
          {/* A quote has no live margin once it is booked or expired. */}
          {quote.marginPct != null && stage !== 'EXPIRED' && stage !== 'BOOKED' && (
            <Mono className="text-micro text-faint">Margin {formatPercent(quote.marginPct)}</Mono>
          )}
        </View>
      </Pressable>
      {/* Accepted still has to be booked; once booked, the quote just points at
          its booking. A quote converts to at most one load. */}
      {stage === 'ACCEPTED' && (
        <Pressable
          onPress={onConvert}
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 border-t border-line-row active:bg-surface-hover"
        >
          <Mono className="text-sub font-medium text-link">Convert to booking</Mono>
          <Icon name="arrowRight" size={14} color={colors.link} />
        </Pressable>
      )}
      {stage === 'BOOKED' && bookedLoad && (
        <Pressable
          onPress={onViewBooking}
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 border-t border-line-row active:bg-surface-hover"
        >
          <Mono className="text-sub font-medium text-link">
            View booking{bookedLoad.load_number ? ` ${bookedLoad.load_number}` : ''}
          </Mono>
          <Icon name="arrowRight" size={14} color={colors.link} />
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
  // Past its delivery date, or open for over 30 days: said as "left open",
  // never counted as current work.
  const current = active.filter((l) => !staleOf(l.raw));
  const staleCount = active.length - current.length;

  return (
    <LoadList
      list={list}
      onOpen={openLoad}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={() => hasMore && !isFetching && loadMore()}
      isFetchingMore={isFetching}
      stats={[
        { label: 'Active orders', value: String(current.length) },
        {
          label: 'In transit',
          value: String(current.filter((l) => l.status === 'IN_TRANSIT').length),
        },
        staleCount > 0
          ? { label: 'Left open', value: String(staleCount) }
          : { label: 'Loading', value: String(current.filter((l) => l.status === 'LOADING').length) },
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

/** " · left open since 20 Jun 2026 (101 days)" for stale open work, else nothing. */
function staleNote(raw: Record<string, unknown>): string {
  const st = staleOf(raw);
  return st ? ` · left open ${staleLabel(st).text}` : '';
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
        <View className="overflow-hidden rounded-card border border-line bg-surface">
          <ListRow
            leading={<Avatar name={item.customer} size={38} />}
            title={item.loadNumber}
            subtitle={`${item.customer} · ${item.pickupState}→${item.deliveryState}${staleNote(item.raw)}`}
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

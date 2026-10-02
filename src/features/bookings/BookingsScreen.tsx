import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
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
  KpiRow,
  StatusPill,
  Avatar,
  Card,
  Icon,
  Txt,
  Mono,
  ListRow,
  Fab,
  EmptyState,
  Button,
} from '@/components/ui';
import { ListSkeleton, ErrorState, Skeleton } from '@/components/feedback';
import { assignedIds } from './AssignDriverVehicleScreen';
import { useQuotes, useLoads } from './api';
import { str, pick } from '@/lib/api/list';
import type { QuoteLite, LoadLite } from '@/types/domain';
import { bookedLoadOf, quoteStage, type QuoteStage } from '@/lib/quoteStage';
import { staleOf, staleLabel } from '@/lib/staleWork';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { formatCurrency, formatDate, formatPercent } from '@/lib/formatters';
import type { TabParamList, BookingsTab } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

type Props = BottomTabScreenProps<TabParamList, 'Bookings'>;

const ACTIVE = ['PENDING', 'ASSIGNED', 'LOADING', 'IN_TRANSIT'];
const DONE = ['DELIVERED', 'INVOICED', 'CANCELLED'];
const ON_THE_MOVE = ['LOADING', 'IN_TRANSIT'];

// Same per-tab title and one-line description as the web's Bookings header.
const TAB_TITLES: Record<BookingsTab, string> = {
  quotes: 'Quotes',
  orders: 'Open orders',
  history: 'Order history',
};
const TAB_DESCRIPTIONS: Record<BookingsTab, string> = {
  quotes: 'Draft, send and track quotes.',
  orders: 'Booked loads that are not yet delivered.',
  history: 'Delivered, invoiced and cancelled loads.',
};
const wholeRand = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Pages are 20 rows, so start the next one well before the list runs out.
const END_REACHED_THRESHOLD = 1.5;
// Module-level so the list sees one component type, not a new one per render.
const Separator = () => <View className="h-2.5" />;

export function BookingsScreen({ route }: Props) {
  const [tab, setTab] = useState<BookingsTab>(route.params?.tab ?? 'quotes');
  const { createQuote } = useAppNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <View className="px-screen">
        <AppHeader title={TAB_TITLES[tab]} subtitle={TAB_DESCRIPTIONS[tab]} live />
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
        <OrdersTab onViewQuotes={() => setTab('quotes')} />
        <HistoryTab />
      </SwipeTabs>
      {tab !== 'quotes' && <LoadsDrain />}
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
const MAX_AUTO_PAGES = 12;

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
  const { colors } = useTheme();
  const { createQuote } = useAppNavigation();
  const [q, setQ] = useState('');

  const list = useMemo(
    () =>
      data.filter(
        (item) =>
          (filter === 'ALL' || quoteStage(item.raw) === filter) &&
          (!q || `${item.code} ${item.customer}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, filter, q],
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
      keyExtractor={quoteKey}
      getItemType={quoteItemType}
      showsVerticalScrollIndicator={false}
      onRefresh={onRefresh}
      refreshing={refreshing}
      extraData={filter}
      onEndReached={() => hasMore && !isFetching && loadMore()}
      onEndReachedThreshold={END_REACHED_THRESHOLD}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ItemSeparatorComponent={Separator}
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
            <ActivityIndicator color={colors.faint} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        q ? (
          <EmptyState icon="file" title="No quotes match your search" />
        ) : filter === 'ALL' ? (
          <EmptyState
            icon="file"
            title="No quotes yet"
            action={<Button label="New quote" icon="plus" onPress={() => createQuote()} />}
          />
        ) : (
          <EmptyState
            icon="file"
            title={`No ${QUOTE_FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} quotes`}
            body={
              filter === 'BOOKED'
                ? 'Accepted quotes land here once converted to a booking.'
                : undefined
            }
          />
        )
      }
      renderItem={renderQuote}
    />
  );
}

const renderQuote = ({ item }: { item: QuoteLite }) => <QuoteCard quote={item} />;

// Accepted / Booked cards carry an extra action row, so they are a different
// height from the rest and get their own recycling pool.
const quoteKey = (q: QuoteLite) => String(q.id);
const quoteItemType = (q: QuoteLite) => {
  const s = quoteStage(q.raw);
  return s === 'ACCEPTED' || s === 'BOOKED' ? 'action' : 'plain';
};

/// Memoized and self-sufficient (navigation lives inside) so a parent re-render
// for search, filter or a page arriving doesn't re-render every visible card.
const QuoteCard = memo(function QuoteCard({ quote }: { quote: QuoteLite }) {
  const { colors } = useTheme();
  const { openQuote, openAssign, openLoad } = useAppNavigation();
  const stage = quoteStage(quote.raw) ?? quote.status;
  // The quote API names the load it was booked as, so no scan of the loads
  // table is needed.
  const bookedLoad = bookedLoadOf(quote.raw);
  // Expired reads "Expired 20 Jun 2026" (the valid-until day); everything else
  // shows when the quote was created. Nothing is shown if the field is missing.
  const dateText = (() => {
    const raw = stage === 'EXPIRED' ? pick(quote.raw, ['valid_until']) : pick(quote.raw, ['created_at']);
    const d = raw ? formatDate(String(raw)) : '';
    if (!d || d === '—') return '';
    return stage === 'EXPIRED' ? `Expired ${d}` : d;
  })();
  const onPress = () => openQuote(quote.id, quote.raw);
  const onConvert = () =>
    openAssign({
      mode: 'convert',
      quoteId: quote.id,
      reference: quote.code,
      vehicleType: str(pick(quote.raw, ['vehicle_type'])) || undefined,
    });
  const onViewBooking = () => bookedLoad && openLoad(bookedLoad.id, undefined, bookedLoad.load_number);
  return (
    <Card>
      <TouchableOpacity className="p-3.5" activeOpacity={0.7} onPress={onPress}>
        <View className="mb-2 flex-row items-center justify-between gap-2">
          <View className="shrink flex-row items-center gap-2">
            <Mono className="text-caption font-medium text-muted">{quote.code}</Mono>
            {dateText !== '' && (
              <Mono className="shrink text-caption text-faint" numberOfLines={1}>
                {dateText}
              </Mono>
            )}
          </View>
          <StatusPill status={stage} />
        </View>
        <Txt className="text-body font-medium text-fg">{quote.customer}</Txt>
        <Txt className="mt-0.5 text-sub text-muted" numberOfLines={1} ellipsizeMode="tail">
          {[quote.origin, ...quote.stopLabels, quote.destination].join(' → ')}
        </Txt>
        <View className="mt-3 flex-row items-center justify-between">
          <Mono className="text-body font-semibold text-fg">{wholeRand(quote.amount)}</Mono>
          {/* A quote has no live margin once it is booked or expired. */}
          {quote.marginPct != null && stage !== 'EXPIRED' && stage !== 'BOOKED' && (
            <Mono className="text-caption text-faint">Margin {formatPercent(quote.marginPct)}</Mono>
          )}
        </View>
      </TouchableOpacity>
      {/* Accepted still has to be booked; once booked, the quote just points at
          its booking. A quote converts to at most one load. */}
      {stage === 'ACCEPTED' && (
        <TouchableOpacity
          onPress={onConvert}
          activeOpacity={0.7}
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 border-t border-line-row"
        >
          <Mono className="text-sub font-medium text-link">Convert to booking</Mono>
          <Icon name="arrowRight" size={14} color={colors.link} />
        </TouchableOpacity>
      )}
      {stage === 'BOOKED' && bookedLoad && (
        <TouchableOpacity
          onPress={onViewBooking}
          activeOpacity={0.7}
          className="min-h-[44px] flex-row items-center justify-center gap-1.5 border-t border-line-row"
        >
          <Mono className="text-sub font-medium text-link">
            View booking{bookedLoad.load_number ? ` ${bookedLoad.load_number}` : ''}
          </Mono>
          <Icon name="arrowRight" size={14} color={colors.link} />
        </TouchableOpacity>
      )}
    </Card>
  );
});

// ── Orders / History (loads) ───────────────────────────────────────────────
// The tiles and chip counts here are totals ("3 need a vehicle"), so they need
// every load, not the first page. The web fetches all pages for the same reason;
// this does it in the background while Orders or History is open, and the tiles
// stay a skeleton (and the chips uncounted) until the last page is in.
const MAX_LOAD_PAGES = 100;
function LoadsDrain() {
  const { hasMore, isFetching, isError, loadMore } = useLoads();
  const pages = useRef(0);
  useEffect(() => {
    if (!hasMore || isFetching || isError || pages.current >= MAX_LOAD_PAGES) return;
    pages.current += 1;
    void loadMore();
  }, [hasMore, isFetching, isError, loadMore]);
  return null;
}

// No vehicle on the order, by id or by the name the API sends back.
const hasNoVehicle = (raw: Record<string, unknown>) =>
  !assignedIds(raw).vehicleId && !str(pick(raw, ['vehicle_info']));

const sumAmount = (rows: LoadLite[]) => rows.reduce((s, l) => s + l.amount, 0);

function OrdersTab({ onViewQuotes }: { onViewQuotes: () => void }) {
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
  if (isError || !data) return <ErrorState onRetry={refresh} message="Couldn't load orders." />;

  const complete = !hasMore;
  const active = data.filter((l) => ACTIVE.includes(l.status));
  const list = active.filter(
    (l) =>
      (filter === 'ALL' || l.status === filter) &&
      (!q || `${l.loadNumber} ${l.customer}`.toLowerCase().includes(q.toLowerCase())),
  );
  // Past its delivery date, or open for over 30 days: said as "left open",
  // never counted as current work.
  const leftOpen = active.filter((l) => staleOf(l.raw)).length;
  const current = active.length - leftOpen;
  // Only orders that can still get a vehicle (Pending, Assigned). One already
  // loading or in transit can't, so it isn't counted.
  const needVehicle = active.filter((l) => hasNoVehicle(l.raw) && !ON_THE_MOVE.includes(l.status));
  const needVehiclePast = needVehicle.filter((l) => staleOf(l.raw)?.overdue).length;
  const inTransit = active.filter((l) => l.status === 'IN_TRANSIT');
  const inTransitLate = inTransit.filter((l) => staleOf(l.raw)?.overdue).length;
  const countOf = (status: string) => (complete ? active.filter((l) => l.status === status).length : undefined);

  return (
    <LoadList
      list={list}
      onOpen={openLoad}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={() => hasMore && !isFetching && loadMore()}
      isFetchingMore={isFetching}
      search={{ value: q, onChange: setQ, placeholder: 'Search orders…' }}
      stats={
        !complete
          ? null
          : active.length === 0
            ? []
            : [
                {
                  label: 'Need a vehicle',
                  value: String(needVehicle.length),
                  note:
                    needVehicle.length === 0
                      ? 'All have a vehicle'
                      : needVehiclePast === needVehicle.length
                        ? 'All past delivery date'
                        : needVehiclePast > 0
                          ? `${needVehiclePast} past delivery date`
                          : 'Assign a vehicle',
                },
                {
                  label: 'In transit',
                  value: String(inTransit.length),
                  note:
                    inTransit.length === 0
                      ? 'None on the road'
                      : inTransitLate === inTransit.length
                        ? inTransit.length === 1
                          ? 'Past its delivery date'
                          : 'All past delivery date'
                        : inTransitLate > 0
                          ? `${inTransitLate} past delivery date`
                          : 'All on schedule',
                },
                {
                  label: 'Open order value',
                  value: wholeRand(sumAmount(active)),
                  note:
                    leftOpen === 0
                      ? plural(current, 'active order', 'active orders')
                      : current === 0
                        ? `${plural(leftOpen, 'order', 'orders')}, all left open`
                        : `${current} active · ${leftOpen} left open`,
                },
              ]
      }
      filters={[
        { label: 'All', value: 'ALL', count: complete ? active.length : undefined },
        { label: 'Pending', value: 'PENDING', count: countOf('PENDING') },
        { label: 'Assigned', value: 'ASSIGNED', count: countOf('ASSIGNED') },
        { label: 'Loading', value: 'LOADING', count: countOf('LOADING') },
        { label: 'In transit', value: 'IN_TRANSIT', count: countOf('IN_TRANSIT') },
      ]}
      filter={filter}
      onFilter={setFilter}
      empty={
        active.length === 0 ? (
          <EmptyState
            icon="truck"
            title="No orders are in progress"
            body="No loads yet. Create a quote, then convert it."
            action={<Button label="View quotes" variant="secondary" onPress={onViewQuotes} />}
          />
        ) : (
          <EmptyState icon="truck" title="No orders match" body="Try another status or search." />
        )
      }
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

  const complete = !hasMore;
  const done = data.filter((l) => DONE.includes(l.status));
  const list = done.filter(
    (l) =>
      (filter === 'ALL' || l.status === filter) &&
      (!q || `${l.loadNumber} ${l.customer}`.toLowerCase().includes(q.toLowerCase())),
  );
  const completed = done.filter((l) => l.status !== 'CANCELLED');
  const invoiced = done.filter((l) => l.status === 'INVOICED');
  const notInvoiced = done.filter((l) => l.status === 'DELIVERED').length;
  const countOf = (status: string) => (complete ? done.filter((l) => l.status === status).length : undefined);

  return (
    <LoadList
      list={list}
      onOpen={openLoad}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={() => hasMore && !isFetching && loadMore()}
      isFetchingMore={isFetching}
      search={{ value: q, onChange: setQ, placeholder: 'Search history…' }}
      stats={
        !complete
          ? null
          : done.length === 0
            ? []
            : [
                {
                  label: 'Delivered, not invoiced',
                  value: String(notInvoiced),
                  note: notInvoiced > 0 ? 'Invoice to get paid' : 'All invoiced',
                },
                {
                  label: 'Invoiced',
                  value: String(invoiced.length),
                  note: `${wholeRand(sumAmount(invoiced))} billed`,
                },
                {
                  label: 'Delivered revenue',
                  value: wholeRand(sumAmount(completed)),
                  note: plural(completed.length, 'load', 'loads'),
                },
              ]
      }
      filters={[
        { label: 'All', value: 'ALL', count: complete ? done.length : undefined },
        { label: 'Delivered', value: 'DELIVERED', count: countOf('DELIVERED') },
        { label: 'Invoiced', value: 'INVOICED', count: countOf('INVOICED') },
        { label: 'Cancelled', value: 'CANCELLED', count: countOf('CANCELLED') },
      ]}
      filter={filter}
      onFilter={setFilter}
      empty={
        done.length === 0 ? (
          <EmptyState
            icon="truck"
            title="No past loads yet"
            body="Delivered, invoiced and cancelled loads show up here."
          />
        ) : (
          <EmptyState icon="truck" title="No loads match" body="Try another status or search." />
        )
      }
    />
  );
}

/** " · left open since 20 Jun 2026 (101 days)" for stale open work, else nothing. */
function staleNote(raw: Record<string, unknown>): string {
  const st = staleOf(raw);
  return st ? ` · left open ${staleLabel(st).text}` : '';
}

type Stat = { label: string; value: string; note?: string };

function LoadList({
  list,
  onOpen,
  stats,
  filters,
  filter,
  onFilter,
  search,
  empty,
  onRefresh,
  refreshing,
  onEndReached,
  isFetchingMore,
}: {
  list: LoadLite[];
  onOpen: (id: string | number, preview?: Record<string, unknown>) => void;
  /** null while the totals are still loading; an empty array shows no tiles. */
  stats: Stat[] | null;
  filters: { label: string; value: string; count?: number }[];
  filter: string;
  onFilter: (v: string) => void;
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  empty: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  onEndReached?: () => void;
  isFetchingMore?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <FlashList
      data={list}
      keyExtractor={(l) => String(l.id)}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={onEndReached}
      onEndReachedThreshold={END_REACHED_THRESHOLD}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListFooterComponent={
        isFetchingMore ? (
          <View className="py-4">
            <ActivityIndicator color={colors.faint} />
          </View>
        ) : null
      }
      ListHeaderComponent={
        <View className="mb-3">
          {stats === null ? (
            <View className="mb-3">
              <KpiRow>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width="100%" height={78} radius={radius.card} />
                ))}
              </KpiRow>
            </View>
          ) : (
            stats.length > 0 && (
              <View className="mb-3">
                <KpiRow>
                  {stats.map((s) => (
                    <StatCard key={s.label} label={s.label} value={s.value} note={s.note} />
                  ))}
                </KpiRow>
              </View>
            )
          )}
          {search && (
            <View className="mb-3">
              <SearchField
                value={search.value}
                onChangeText={search.onChange}
                placeholder={search.placeholder}
              />
            </View>
          )}
          <FilterChips options={filters} value={filter} onChange={onFilter} />
        </View>
      }
      ListEmptyComponent={<>{empty}</>}
      renderItem={({ item }) => (
        <Card>
          <ListRow
            leading={<Avatar name={item.customer} size={38} />}
            title={item.loadNumber}
            subtitle={`${item.customer} · ${item.pickupState}→${item.deliveryState}${staleNote(item.raw)}`}
            trailing={
              <View className="items-end gap-1">
                <Mono className="text-callout font-semibold text-fg">{wholeRand(item.amount)}</Mono>
                <StatusPill status={item.status} />
              </View>
            }
            onPress={() => onOpen(item.id, item.raw)}
            last
          />
        </Card>
      )}
      ItemSeparatorComponent={Separator}
    />
  );
}

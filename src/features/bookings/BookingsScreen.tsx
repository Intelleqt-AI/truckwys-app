import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  AmbientGlow,
  AppHeader,
  UnderlineTabs,
  FilterChips,
  SearchField,
  StatCard,
  StatusPill,
  Avatar,
  ConfidenceTag,
  Card,
  Txt,
  Mono,
  ListRow,
  Button,
  Fab,
  EmptyState,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useQuotes, useLoads } from './api';
import type { QuoteLite, LoadLite } from '@/types/domain';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters';
import type { TabParamList, BookingsTab } from '@/navigation/types';

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
      <View className="px-screen">
        <UnderlineTabs
          tabs={[
            { label: 'Quotes', value: 'quotes' },
            { label: 'Orders', value: 'orders' },
            { label: 'History', value: 'history' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      <View className="flex-1">
        {tab === 'quotes' && <QuotesTab />}
        {tab === 'orders' && <OrdersTab />}
        {tab === 'history' && <HistoryTab />}
      </View>
      <Fab onPress={() => createQuote()} />
    </View>
  );
}

// ── Quotes ───────────────────────────────────────────────────────────────
const QUOTE_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Viewed', value: 'VIEWED' },
  { label: 'Accepted', value: 'ACCEPTED' },
  { label: 'Expired', value: 'EXPIRED' },
];

function QuotesTab() {
  const { data, isLoading, isError, refetch } = useQuotes();
  const [filter, setFilter] = useState('ALL');
  const { openQuote } = useAppNavigation();

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load quotes." />;

  const list = data.filter((q) => filter === 'ALL' || q.status.includes(filter));

  return (
    <FlashList
      data={list}
      keyExtractor={(q) => String(q.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 }}
      ItemSeparatorComponent={() => <View className="h-2.5" />}
      ListHeaderComponent={
        <View className="mb-3">
          <FilterChips options={QUOTE_FILTERS} value={filter} onChange={setFilter} />
        </View>
      }
      ListEmptyComponent={<EmptyState icon="file" title="No quotes" body="No quotes match this filter." />}
      renderItem={({ item }) => <QuoteCard quote={item} onPress={() => openQuote(item.id, item.raw)} />}
    />
  );
}

function QuoteCard({ quote, onPress }: { quote: QuoteLite; onPress: () => void }) {
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
          <View className="flex-row items-center gap-2.5">
            {quote.marginPct != null && (
              <Mono className="text-micro text-faint">Margin {quote.marginPct}%</Mono>
            )}
            {quote.confidence != null && <ConfidenceTag value={quote.confidence} />}
          </View>
        </View>
      </Pressable>
    </Card>
  );
}

// ── Orders / History (loads) ───────────────────────────────────────────────
function OrdersTab() {
  const { data, isLoading, isError, refetch } = useLoads();
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
  const { data, isLoading, isError, refetch } = useLoads();
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
}: {
  list: LoadLite[];
  onOpen: (id: string | number, preview?: Record<string, unknown>) => void;
  stats: { label: string; value: string }[];
  filters: { label: string; value: string }[];
  filter: string;
  onFilter: (v: string) => void;
  search?: { value: string; onChange: (v: string) => void };
}) {
  return (
    <FlashList
      data={list}
      keyExtractor={(l) => String(l.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 }}
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

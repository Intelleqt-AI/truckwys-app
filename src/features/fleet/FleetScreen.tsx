import { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  AppHeader,
  SwipeTabs,
  SearchField,
  FilterChips,
  KpiRow,
  StatCard,
  StatusPill,
  ListRow,
  IconButton,
  OverflowMenu,
  Icon,
  Avatar,
  Mono,
  Txt,
  EmptyState,
  Button,
  SelectionActions,
  SelectionDot,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { StaleDataNotice } from '@/features/home/StaleDataNotice';
import { useVehiclesFleet, useDriversFleet, bulkDeleteVehicles, type VehicleTile } from './api';
import { doingNow, type DoingNow } from './doingNow';
import type { Load } from '@/lib/ledger';
import { pick } from '@/lib/api/list';
import { formatDate } from '@/lib/formatters';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { useDemo } from '@/hooks/useDemo';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { reportBulkDelete } from '@/lib/bulkDelete';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { TabParamList, FleetTab } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { STALE_MS, useAutoRefreshStale } from '@/hooks/useAutoRefreshStale';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

type Props = BottomTabScreenProps<TabParamList, 'Fleet'>;

const VEHICLE_NOUNS = { singular: 'vehicle', plural: 'vehicles' };

// The server's tiles are the filters (vehicles/?view=fleet&tile=): the figure on
// a tile is the number of rows you land on when you tap it.
const VEHICLE_FILTERS: { label: string; value: 'ALL' | VehicleTile }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'In use', value: 'job' },
  { label: 'Available', value: 'free' },
  { label: 'Maintenance', value: 'shop' },
  { label: 'To review', value: 'mismatch' },
];

const DRIVER_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On leave', value: 'ON_LEAVE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

// The "Doing now" line under a truck: what its open order says it is doing.
// Amber dot when the status and the orders disagree or the order was left open.
function DoingNowLine({ info }: { info: DoingNow }) {
  const { colors } = useTheme();
  const warn = info.tone === 'warn';
  return (
    <View className="mt-1">
      <View className="flex-row items-center gap-1.5">
        {warn && (
          <View
            style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warningDot }}
          />
        )}
        <Txt className="flex-1 text-caption text-fg" numberOfLines={1}>
          {info.text}
        </Txt>
      </View>
      {info.sub && (
        <Txt className="text-caption text-muted" numberOfLines={1}>
          {info.sub}
        </Txt>
      )}
    </View>
  );
}

export function FleetScreen({ route }: Props) {
  const [tab, setTab] = useState<FleetTab>(route.params?.tab ?? 'vehicles');
  const insets = useSafeAreaInsets();
  const { nav, openImport } = useAppNavigation();
  const demo = useDemo();
  const qc = useQueryClient();
  // Selection lives here, not in VehiclesTab, because the header actions that
  // drive it (Cancel/Select all/Delete) sit in Fleet's shared header above
  // both tabs.
  const selection = useBulkSelection();
  const { selectMode, selected, enter, exit: exitSelectMode, toggleAll, prune } = selection;
  // Reported up by VehiclesTab: the unfiltered vehicle count (so the header
  // knows whether to show "Select" at all) and the currently visible/filtered
  // ids (so "Select all" and pruning a hidden selection both work here).
  const [vehicleTotal, setVehicleTotal] = useState(0);
  const [visibleIds, setVisibleIds] = useState<(string | number)[]>([]);
  const handleListChange = useCallback((total: number, ids: (string | number)[]) => {
    setVehicleTotal(total);
    setVisibleIds(ids);
  }, []);

  const changeTab = (v: FleetTab) => {
    setTab(v);
    exitSelectMode();
  };

  useEffect(() => {
    prune(visibleIds);
  }, [visibleIds, prune]);

  const runBulkDelete = async () => {
    if (demo.block()) return;
    try {
      const res = await bulkDeleteVehicles([...selected]);
      reportBulkDelete(res, VEHICLE_NOUNS);
      invalidateFor(qc, 'vehicle');
      exitSelectMode();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete');
    }
  };

  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <View className="px-screen">
        {selectMode ? (
          // Same row height/padding as AppHeader (layout.tsx) so nothing
          // jumps when selection starts or ends. A 26px title plus Cancel +
          // Select all + Delete would overflow a narrow phone next to
          // AppHeader's big title, hence this compact row instead.
          <View className="flex-row items-center gap-2 pb-3.5 pt-2">
            <IconButton name="x" accessibilityLabel="Cancel selection" onPress={exitSelectMode} />
            <Txt className="flex-1 text-body font-semibold text-fg" numberOfLines={1}>
              {selected.size} selected
            </Txt>
            <SelectionActions
              count={selected.size}
              total={visibleIds.length}
              noun="vehicle"
              nounPlural="vehicles"
              onSelectAll={() => toggleAll(visibleIds)}
              onConfirmDelete={runBulkDelete}
            />
          </View>
        ) : (
          <AppHeader
            title="Fleet"
            right={
              <View className="flex-row items-center gap-1">
                {tab === 'vehicles' && (
                  <OverflowMenu
                    accessibilityLabel="Vehicle actions"
                    actions={[
                      ...(vehicleTotal > 0
                        ? [{ label: 'Select vehicles', icon: 'check' as const, onPress: () => enter() }]
                        : []),
                      {
                        label: 'Import vehicles',
                        icon: 'import' as const,
                        onPress: () => {
                          if (demo.block()) return;
                          openImport('vehicles');
                        },
                      },
                    ]}
                  />
                )}
                <IconButton
                  name="plus"
                  accessibilityLabel={tab === 'vehicles' ? 'Add vehicle' : 'Add driver'}
                  onPress={() => {
                    // Vehicles/drivers are fixed seeded data in the demo company.
                    if (demo.block()) return;
                    nav.navigate(tab === 'vehicles' ? 'AddVehicle' : 'AddDriver');
                  }}
                />
              </View>
            }
          />
        )}
      </View>
      <SwipeTabs
        tabs={[
          { label: 'Vehicles', value: 'vehicles' },
          { label: 'Drivers', value: 'drivers' },
        ]}
        value={tab}
        onChange={changeTab}
      >
        <VehiclesTab selection={selection} onListChange={handleListChange} />
        <DriversTab />
      </SwipeTabs>
    </View>
  );
}

/** Under a server-paged list while the next page loads. */
function MoreSpinner() {
  const { colors } = useTheme();
  return (
    <View className="py-4">
      <ActivityIndicator color={colors.faint} />
    </View>
  );
}

function VehiclesTab({
  selection,
  onListChange,
}: {
  selection: ReturnType<typeof useBulkSelection>;
  /** Unfiltered vehicle count + the currently visible/filtered ids — Fleet's
   *  header uses these to decide whether to show "Select" and to drive
   *  "Select all" / pruning. */
  onListChange: (total: number, visibleIds: (string | number)[]) => void;
}) {
  const { selectMode, selected, toggle, enter } = selection;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'ALL' | VehicleTile>('ALL');
  const search = useDebouncedValue(q.trim());
  // Server-side: search and the tile filter go to the API, which sends one page
  // of trucks (each with its open order and delivered work) and the tiles. No
  // download of every truck and every load.
  const list = useVehiclesFleet(filter === 'ALL' ? null : filter, search);
  const { isLoading, isError, dataUpdatedAt, isRefetchError, isFetchingAny } = list;
  const data = list.combinedData;
  const sum = list.extras?.summary;
  const refetchAll = () => list.refresh();
  const { refreshing, onRefresh } = useManualRefresh(refetchAll);
  const notice = useManualRefresh(refetchAll);
  useAutoRefreshStale([['vehicles']], dataUpdatedAt);
  const { openVehicle, nav, openImport } = useAppNavigation();
  const { colors } = useTheme();
  const demo = useDemo();

  // The whole fleet's size (not the filtered rows), so the header offers
  // "Select" whenever there are trucks.
  const everyTruck = sum?.total ?? data.length;
  useEffect(() => {
    onListChange(everyTruck, data.map((v) => v.id));
  }, [everyTruck, data, onListChange]);

  if (isLoading)
    return (
      <View className="p-screen">
        <ListSkeleton />
      </View>
    );
  if (isError && data.length === 0)
    return <ErrorState onRetry={() => void list.refresh()} message="Couldn't load vehicles." />;

  // Web's status tiles. Each is also the list filter, so the figure on a tile is
  // the number of rows you land on when you tap it.
  const inUse = sum?.job ?? 0;
  const available = sum?.free ?? 0;
  const maint = sum?.shop ?? 0;
  const outOfService = sum?.out_of_service ?? 0;
  const mismatches = sum ? sum.job_no_order + sum.free_on_order + sum.shop_on_order : 0;
  const toggleFilter = (value: VehicleTile) => setFilter((f) => (f === value ? 'ALL' : value));
  const options = VEHICLE_FILTERS.map((o) => ({
    ...o,
    count: !sum
      ? undefined
      : o.value === 'ALL'
        ? sum.total
        : o.value === 'job'
          ? sum.job
          : o.value === 'free'
            ? sum.free
            : o.value === 'shop'
              ? sum.shop
              : mismatches,
  }));

  return (
    <FlashList
      data={data}
      keyExtractor={(v) => String(v.id)}
      showsVerticalScrollIndicator={false}
      extraData={selectMode ? selected : filter}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={() => list.hasMore && !list.isFetching && void list.loadMore()}
      onEndReachedThreshold={1.5}
      ListFooterComponent={list.isFetching ? <MoreSpinner /> : null}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          {/* An automatic refresh in progress isn't news; only a manual one is shown. */}
          {(notice.refreshing || !isFetchingAny) && (
            <StaleDataNotice
              className="mb-3"
              updatedAt={dataUpdatedAt}
              refreshFailed={isRefetchError}
              refreshing={notice.refreshing}
              onRetry={notice.onRefresh}
              staleAfterMs={STALE_MS + 60_000}
            />
          )}
          {sum && (
            <View className="mb-3">
              <KpiRow>
                <StatCard
                  label="Marked in use"
                  value={String(inUse)}
                  note={`of ${sum.total}`}
                  onPress={() => toggleFilter('job')}
                />
                <StatCard
                  label="Available"
                  value={String(available)}
                  note={
                    available === 0
                      ? 'Every truck is busy'
                      : sum.free_holding > 0
                        ? `${sum.free_holding} holding orders left open`
                        : 'Free to take a load'
                  }
                  onPress={() => toggleFilter('free')}
                />
                <StatCard
                  label="In maintenance"
                  value={String(maint)}
                  note={
                    outOfService > 0
                      ? `${outOfService} out of service`
                      : maint > 0
                        ? 'In the workshop'
                        : 'None in the workshop'
                  }
                  onPress={() => toggleFilter('shop')}
                />
              </KpiRow>
            </View>
          )}
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search vehicles…" />
          </View>
          <FilterChips options={options} value={filter} onChange={setFilter} />
        </View>
      }
      ListEmptyComponent={
        search || filter !== 'ALL' ? (
          <EmptyState icon="truck" title="No vehicles match" body="Try another search or filter." />
        ) : (
          <EmptyState
            icon="truck"
            title="No vehicles"
            body="Already have your fleet in a spreadsheet? Import the list, or add your first vehicle."
            action={
              <View className="flex-row gap-2.5">
                <Button
                  label="Import list"
                  icon="import"
                  variant="secondary"
                  onPress={() => {
                    if (demo.block()) return;
                    openImport('vehicles');
                  }}
                />
                <Button
                  label="Add vehicle"
                  icon="plus"
                  onPress={() => {
                    if (demo.block()) return;
                    nav.navigate('AddVehicle');
                  }}
                />
              </View>
            }
          />
        )
      }
      renderItem={({ item }) => {
        const isSelected = selectMode && selected.has(item.id);
        // The server picks the open order to show (a current one beats one left
        // open) and sends it compact on the row.
        const active = pick(item.raw, ['active_load']) as Load | null | undefined;
        const now = doingNow(item, active ?? undefined);
        return (
          <View
            className={`mb-2.5 overflow-hidden rounded-card border ${
              isSelected ? 'border-line-strong bg-raised' : 'border-line bg-surface'
            }`}
          >
            <ListRow
              leading={
                selectMode ? (
                  <View className="flex-row items-center gap-2.5">
                    <SelectionDot selected={isSelected} />
                    <Icon name="truck" size={22} color={colors.muted} />
                  </View>
                ) : (
                  <Icon name="truck" size={22} color={colors.muted} />
                )
              }
              title={item.name}
              subtitle={item.plate}
              subtitleIcon="idCard"
              detail={now ? <DoingNowLine info={now} /> : undefined}
              trailing={
                <View className="items-end gap-1">
                  {item.aiHealthScore != null && (
                    <Mono className="text-caption text-muted">{item.aiHealthScore}/100</Mono>
                  )}
                  <StatusPill status={item.status} />
                </View>
              }
              onPress={() => (selectMode ? toggle(item.id) : openVehicle(item.id, item.raw))}
              onLongPress={() => !selectMode && enter(item.id)}
              last
            />
          </View>
        );
      }}
    />
  );
}

function DriversTab() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('ALL');
  const search = useDebouncedValue(q.trim());
  // Server-side: status and search (name, username, licence number) go to the
  // API, one page at a time; page 1 carries the counts and licence tiles over
  // every searched driver.
  const list = useDriversFleet(filter, search);
  const { isLoading, isError, dataUpdatedAt, isRefetchError, isFetchingAny } = list;
  const data = list.combinedData;
  const sum = list.extras?.summary;
  const { refreshing, onRefresh } = useManualRefresh(list.refresh);
  const notice = useManualRefresh(list.refresh);
  useAutoRefreshStale([['drivers']], dataUpdatedAt);
  const { openDriver } = useAppNavigation();

  if (isLoading)
    return (
      <View className="p-screen">
        <ListSkeleton />
      </View>
    );
  if (isError && data.length === 0)
    return <ErrorState onRetry={() => void list.refresh()} message="Couldn't load drivers." />;

  const counts = sum?.status_counts;
  const options = DRIVER_FILTERS.map((o) => ({ ...o, count: counts?.[o.value] }));
  const expired = sum?.expired_count ?? 0;

  return (
    <FlashList
      data={data}
      keyExtractor={(d) => String(d.id)}
      showsVerticalScrollIndicator={false}
      extraData={filter}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={() => list.hasMore && !list.isFetching && void list.loadMore()}
      onEndReachedThreshold={1.5}
      ListFooterComponent={list.isFetching ? <MoreSpinner /> : null}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          {(notice.refreshing || !isFetchingAny) && (
            <StaleDataNotice
              className="mb-3"
              updatedAt={dataUpdatedAt}
              refreshFailed={isRefetchError}
              refreshing={notice.refreshing}
              onRetry={notice.onRefresh}
              staleAfterMs={STALE_MS + 60_000}
            />
          )}
          {sum && (
            <View className="mb-3">
              <KpiRow>
                <StatCard label="Drivers" value={String(counts?.ALL ?? 0)} onPress={() => setFilter('ALL')} />
                <StatCard
                  label="Active"
                  value={String(counts?.ACTIVE ?? 0)}
                  onPress={() => setFilter((f) => (f === 'ACTIVE' ? 'ALL' : 'ACTIVE'))}
                />
                <StatCard
                  label="Licences"
                  value={String(expired)}
                  note={
                    expired > 0
                      ? `Expired: ${sum.expired_names.join(', ')}${expired > sum.expired_names.length ? '…' : ''}`
                      : sum.renew_soon > 0
                        ? `${sum.renew_soon} renew within 90 days`
                        : sum.next_renewal
                          ? `Next: ${sum.next_renewal.name}, ${formatDate(sum.next_renewal.date)}`
                          : 'All in date'
                  }
                  tone={expired > 0 ? 'danger' : undefined}
                />
              </KpiRow>
            </View>
          )}
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search drivers…" />
          </View>
          <FilterChips options={options} value={filter} onChange={setFilter} />
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="users" title="No drivers" body="No drivers match this filter." />
      }
      renderItem={({ item }) => {
        const openLoad = String(pick(item.raw, ['open_load_number']) ?? '');
        const base = item.phone || item.licenseNumber;
        return (
          <View className="mb-2.5 overflow-hidden rounded-card border border-line bg-surface">
            <ListRow
              leading={<Avatar name={item.name} uri={item.avatar} size={36} />}
              title={item.name}
              subtitle={openLoad ? `${base ? `${base} · ` : ''}on ${openLoad}` : base}
              subtitleIcon={item.phone ? 'phone' : 'idCardLanyard'}
              trailing={
                <View className="items-end gap-1">
                  {item.safetyScore != null && (
                    <Mono className="text-caption text-muted">Safety {item.safetyScore}</Mono>
                  )}
                  <StatusPill status={item.status} />
                </View>
              }
              onPress={() => openDriver(item.id, item.raw)}
              last
            />
          </View>
        );
      }}
    />
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
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
import { useVehicles, useDrivers, bulkDeleteVehicles } from './api';
import { activeLoadByVehicle, doingNow, type DoingNow } from './doingNow';
import { useLedger } from '@/lib/useLedger';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { useDemo } from '@/hooks/useDemo';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { reportBulkDelete } from '@/lib/bulkDelete';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { TabParamList, FleetTab } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';
import { useAutoRefreshStale } from '@/hooks/useAutoRefreshStale';

type Props = BottomTabScreenProps<TabParamList, 'Fleet'>;

const VEHICLE_NOUNS = { singular: 'vehicle', plural: 'vehicles' };

const VEHICLE_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Available', value: 'AVAILABLE' },
  { label: 'In use', value: 'IN_USE' },
  { label: 'Maintenance', value: 'MAINTENANCE' },
  { label: 'Out of service', value: 'OUT_OF_SERVICE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

const DRIVER_FILTERS = [
  { label: 'All', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'On leave', value: 'ON_LEAVE' },
  { label: 'Inactive', value: 'INACTIVE' },
];

// Chip counts come from the full list (fetchAllRows), so they are real totals.
function withCounts(options: { label: string; value: string }[], items: { status: string }[]) {
  return options.map((o) => ({
    ...o,
    count: o.value === 'ALL' ? items.length : items.filter((i) => i.status === o.value).length,
  }));
}

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
  const { data, isLoading, isError, refetch, dataUpdatedAt, isRefetchError, isFetching } = useVehicles();
  // Every load, for "Doing now". Shares Home's cached ledger, and never blocks
  // the list: while it loads or if it fails the rows simply have no such line.
  const ledger = useLedger(['loads']);
  const refetchAll = () => Promise.all([refetch(), ledger.refetch()]);
  const { refreshing, onRefresh } = useManualRefresh(refetchAll);
  const notice = useManualRefresh(refetchAll);
  useAutoRefreshStale([['vehicles'], ['ledger-loads']], dataUpdatedAt);
  const { openVehicle, nav, openImport } = useAppNavigation();
  const { colors } = useTheme();
  const demo = useDemo();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('ALL');

  const loads = ledger.data?.loads;
  const loadByVehicle = useMemo(() => (loads ? activeLoadByVehicle(loads) : null), [loads]);

  const list = useMemo(
    () =>
      (data ?? []).filter(
        (v) =>
          (filter === 'ALL' || v.status === filter) &&
          (!q || `${v.name} ${v.plate}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, filter, q],
  );

  useEffect(() => {
    onListChange(data?.length ?? 0, list.map((v) => v.id));
  }, [data, list, onListChange]);

  if (isLoading)
    return (
      <View className="p-screen">
        <ListSkeleton />
      </View>
    );
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load vehicles." />;

  // Web's status tiles. Each is also the list filter, so the figure on a tile is
  // the number of rows you land on when you tap it.
  const inUse = data.filter((v) => v.status === 'IN_USE').length;
  const available = data.filter((v) => v.status === 'AVAILABLE').length;
  const maint = data.filter((v) => v.status === 'MAINTENANCE').length;
  const outOfService = data.filter((v) => v.status === 'OUT_OF_SERVICE').length;
  const toggleFilter = (value: string) => setFilter((f) => (f === value ? 'ALL' : value));

  return (
    <FlashList
      data={list}
      keyExtractor={(v) => String(v.id)}
      extraData={loadByVehicle}
      onRefresh={onRefresh}
      refreshing={refreshing}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          {/* An automatic refresh in progress isn't news; only a manual one is shown. */}
          {(notice.refreshing || !isFetching) && (
            <StaleDataNotice
              className="mb-3"
              updatedAt={dataUpdatedAt}
              refreshFailed={isRefetchError}
              refreshing={notice.refreshing}
              onRetry={notice.onRefresh}
            />
          )}
          <View className="mb-3">
            <KpiRow>
              <StatCard
                label="Marked in use"
                value={String(inUse)}
                note={`of ${data.length}`}
                onPress={() => toggleFilter('IN_USE')}
              />
              <StatCard
                label="Available"
                value={String(available)}
                note={available > 0 ? 'Free to take a load' : 'Every truck is busy'}
                onPress={() => toggleFilter('AVAILABLE')}
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
                onPress={() => toggleFilter('MAINTENANCE')}
              />
            </KpiRow>
          </View>
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search vehicles…" />
          </View>
          <FilterChips
            options={withCounts(VEHICLE_FILTERS, data)}
            value={filter}
            onChange={setFilter}
          />
        </View>
      }
      ListEmptyComponent={
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
      }
      renderItem={({ item }) => {
        const isSelected = selectMode && selected.has(item.id);
        const now = loadByVehicle ? doingNow(item, loadByVehicle.get(Number(item.id))) : null;
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
  const { data, isLoading, isError, refetch, dataUpdatedAt, isRefetchError, isFetching } = useDrivers();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const notice = useManualRefresh(refetch);
  useAutoRefreshStale([['drivers']], dataUpdatedAt);
  const { openDriver } = useAppNavigation();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('ALL');

  const list = useMemo(
    () =>
      (data ?? []).filter(
        (d) =>
          (filter === 'ALL' || d.status === filter) &&
          (!q ||
            `${d.name} ${d.phone ?? ''} ${d.licenseNumber ?? ''}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      ),
    [data, filter, q],
  );

  if (isLoading)
    return (
      <View className="p-screen">
        <ListSkeleton />
      </View>
    );
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load drivers." />;

  return (
    <FlashList
      data={list}
      keyExtractor={(d) => String(d.id)}
      onRefresh={onRefresh}
      refreshing={refreshing}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          {(notice.refreshing || !isFetching) && (
            <StaleDataNotice
              className="mb-3"
              updatedAt={dataUpdatedAt}
              refreshFailed={isRefetchError}
              refreshing={notice.refreshing}
              onRetry={notice.onRefresh}
            />
          )}
          <View className="mb-3 flex-row gap-3">
            <StatCard label="Drivers" value={String(data.length)} onPress={() => setFilter('ALL')} />
            <StatCard
              label="Active"
              value={String(data.filter((d) => d.status === 'ACTIVE').length)}
              onPress={() => setFilter((f) => (f === 'ACTIVE' ? 'ALL' : 'ACTIVE'))}
            />
          </View>
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search drivers…" />
          </View>
          <FilterChips
            options={withCounts(DRIVER_FILTERS, data)}
            value={filter}
            onChange={setFilter}
          />
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="users" title="No drivers" body="No drivers match this filter." />
      }
      renderItem={({ item }) => (
        <View className="mb-2.5 overflow-hidden rounded-card border border-line bg-surface">
          <ListRow
            leading={<Avatar name={item.name} uri={item.avatar} size={36} />}
            title={item.name}
            subtitle={item.phone || item.licenseNumber}
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
      )}
    />
  );
}

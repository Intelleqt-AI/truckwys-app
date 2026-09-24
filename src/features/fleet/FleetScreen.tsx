import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  AmbientGlow,
  AppHeader,
  SwipeTabs,
  SearchField,
  FilterChips,
  StatCard,
  StatusPill,
  ListRow,
  IconButton,
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
import { useVehicles, useDrivers, bulkDeleteVehicles } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import { useDemo } from '@/hooks/useDemo';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { reportBulkDelete } from '@/lib/bulkDelete';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { TabParamList, FleetTab } from '@/navigation/types';
import { useManualRefresh } from '@/hooks/useManualRefresh';

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
      <AmbientGlow />
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
                {tab === 'vehicles' && vehicleTotal > 0 && (
                  <TouchableOpacity
                    hitSlop={8}
                    activeOpacity={0.7}
                    className="px-2"
                    onPress={() => enter()}
                  >
                    <Mono className="text-micro uppercase tracking-wide text-accent">Select</Mono>
                  </TouchableOpacity>
                )}
                {tab === 'vehicles' && (
                  <IconButton
                    name="import"
                    accessibilityLabel="Import vehicles"
                    onPress={() => {
                      if (demo.block()) return;
                      openImport('vehicles');
                    }}
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
  const { data, isLoading, isError, refetch } = useVehicles();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
  const { openVehicle, nav, openImport } = useAppNavigation();
  const { colors } = useTheme();
  const demo = useDemo();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('ALL');

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

  const ready = data.filter((v) => ['AVAILABLE', 'IN_USE'].includes(v.status)).length;
  const maint = data.filter((v) => v.status === 'MAINTENANCE').length;

  return (
    <FlashList
      data={list}
      keyExtractor={(v) => String(v.id)}
      onRefresh={onRefresh}
      refreshing={refreshing}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3 flex-row gap-3">
            <StatCard label="Total" value={String(data.length)} />
            <StatCard label="Ready" value={String(ready)} />
            <StatCard label="Service" value={String(maint)} />
          </View>
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search vehicles…" />
          </View>
          <FilterChips options={VEHICLE_FILTERS} value={filter} onChange={setFilter} />
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
        return (
          <View
            className={`mb-2.5 overflow-hidden rounded-xs border ${
              isSelected ? 'border-accent' : 'border-line bg-surface'
            }`}
            style={isSelected ? { backgroundColor: colors.glow } : undefined}
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
  const { data, isLoading, isError, refetch } = useDrivers();
  const { refreshing, onRefresh } = useManualRefresh(refetch);
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
          <View className="mb-3 flex-row gap-3">
            <StatCard label="Drivers" value={String(data.length)} />
            <StatCard
              label="Active"
              value={String(data.filter((d) => d.status === 'ACTIVE').length)}
            />
          </View>
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search drivers…" />
          </View>
          <FilterChips options={DRIVER_FILTERS} value={filter} onChange={setFilter} />
        </View>
      }
      ListEmptyComponent={
        <EmptyState icon="users" title="No drivers" body="No drivers match this filter." />
      }
      renderItem={({ item }) => (
        <View className="mb-2.5 overflow-hidden rounded-xs border border-line bg-surface">
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

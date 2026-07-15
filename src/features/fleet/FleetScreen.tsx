import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import {
  AmbientGlow,
  AppHeader,
  UnderlineTabs,
  SearchField,
  FilterChips,
  StatCard,
  StatusPill,
  ListRow,
  IconButton,
  Icon,
  Mono,
  EmptyState,
} from '@/components/ui';
import { ListSkeleton, ErrorState } from '@/components/feedback';
import { useVehicles, useDrivers } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { useTheme } from '@/theme/ThemeProvider';
import type { TabParamList, FleetTab } from '@/navigation/types';

type Props = BottomTabScreenProps<TabParamList, 'Fleet'>;

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
  { label: 'On duty', value: 'ON_DUTY' },
  { label: 'Inactive', value: 'INACTIVE' },
];

export function FleetScreen({ route }: Props) {
  const [tab, setTab] = useState<FleetTab>(route.params?.tab ?? 'vehicles');
  const insets = useSafeAreaInsets();
  const { nav } = useAppNavigation();
  return (
    <View className="flex-1 bg-bg-deep" style={{ paddingTop: insets.top }}>
      <AmbientGlow />
      <View className="px-screen">
        <AppHeader
          title="Fleet"
          right={
            <IconButton
              name="plus"
              accessibilityLabel={tab === 'vehicles' ? 'Add vehicle' : 'Add driver'}
              onPress={() => nav.navigate(tab === 'vehicles' ? 'AddVehicle' : 'AddDriver')}
            />
          }
        />
        <UnderlineTabs
          tabs={[
            { label: 'Vehicles', value: 'vehicles' },
            { label: 'Drivers', value: 'drivers' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <View className="flex-1">{tab === 'vehicles' ? <VehiclesTab /> : <DriversTab />}</View>
    </View>
  );
}

function VehiclesTab() {
  const { data, isLoading, isError, refetch } = useVehicles();
  const { openVehicle } = useAppNavigation();
  const { colors } = useTheme();
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

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load vehicles." />;

  const ready = data.filter((v) => ['AVAILABLE', 'IN_USE'].includes(v.status)).length;
  const maint = data.filter((v) => v.status === 'MAINTENANCE').length;

  return (
    <FlashList
      data={list}
      keyExtractor={(v) => String(v.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
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
        <EmptyState icon="truck" title="No vehicles" body="No vehicles match this filter." />
      }
      renderItem={({ item }) => (
        <View className="mb-2.5 overflow-hidden rounded-xs border border-line bg-surface">
          <ListRow
            leading={<Icon name="truck" size={22} color={colors.muted} />}
            title={item.name}
            subtitle={item.plate}
            trailing={
              <View className="items-end gap-1">
                {item.healthScore != null && (
                  <Mono className="text-caption text-muted">{item.healthScore}/100</Mono>
                )}
                <StatusPill status={item.status} />
              </View>
            }
            onPress={() => openVehicle(item.id, item.raw)}
            last
          />
        </View>
      )}
    />
  );
}

function DriversTab() {
  const { data, isLoading, isError, refetch } = useDrivers();
  const { openDriver } = useAppNavigation();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('ALL');

  const list = useMemo(
    () =>
      (data ?? []).filter(
        (d) =>
          (filter === 'ALL' || d.status === filter) &&
          (!q || d.name.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, filter, q],
  );

  if (isLoading) return <View className="p-screen"><ListSkeleton /></View>;
  if (isError || !data) return <ErrorState onRetry={refetch} message="Couldn't load drivers." />;

  return (
    <FlashList
      data={list}
      keyExtractor={(d) => String(d.id)}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
      ListHeaderComponent={
        <View className="mb-3">
          <View className="mb-3 flex-row gap-3">
            <StatCard label="Drivers" value={String(data.length)} />
            <StatCard
              label="On duty"
              value={String(data.filter((d) => ['ACTIVE', 'ON_DUTY', 'IN_USE'].includes(d.status)).length)}
            />
          </View>
          <View className="mb-3">
            <SearchField value={q} onChangeText={setQ} placeholder="Search drivers…" />
          </View>
          <FilterChips options={DRIVER_FILTERS} value={filter} onChange={setFilter} />
        </View>
      }
      ListEmptyComponent={<EmptyState icon="users" title="No drivers" body="No drivers match this filter." />}
      renderItem={({ item }) => (
        <View className="mb-2.5 overflow-hidden rounded-xs border border-line bg-surface">
          <ListRow
            leading={<Icon name="user" size={22} color="#888888" />}
            title={item.name}
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

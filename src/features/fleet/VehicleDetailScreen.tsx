import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  StatCard,
  StatusPill,
  SegmentedControl,
  SelectField,
  Group,
  DetailRow,
  SectionLabel,
  ListRow,
  Button,
  Icon,
  Mono,
} from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useVehicle, useVehicleLoads, updateVehicle, deleteVehicle, VEHICLE_STATUSES } from './api';
import { useAppNavigation } from '@/navigation/useAppNavigation';
import { num, str, pick, asArray } from '@/lib/api/list';
import { formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from '@/lib/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'VehicleDetail'>;

const showDate = (v: string) => (v ? formatDate(v) : '—');
const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');

function ScoreBar({ label, value }: { label: string; value: number }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View className="mb-3">
      <View className="mb-1 flex-row justify-between">
        <Mono className="text-micro uppercase tracking-wide text-faint">{label}</Mono>
        <Mono className="text-micro text-muted">{Math.round(value)}/100</Mono>
      </View>
      <View className="h-2 overflow-hidden rounded-xs bg-surface-hover">
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: colors.accent }} />
      </View>
    </View>
  );
}

export function VehicleDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useVehicle(id, preview);
  const { data: loadsData } = useVehicleLoads(id);
  const { openLoad } = useAppNavigation();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'financial'>('overview');

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this vehicle." />;
  const v = (data ?? {}) as Record<string, unknown>;
  const status = str(pick(v, ['status']), 'AVAILABLE').toUpperCase();

  // Maintenance projections (web VehicleFinancialProfile.tsx).
  const mileage = num(pick(v, ['mileage']));
  const serviceInterval = num(pick(v, ['service_interval_km']));
  const lastServiceMileage = num(pick(v, ['last_service_mileage']));
  const nextServiceKm = serviceInterval && lastServiceMileage ? lastServiceMileage + serviceInterval : null;
  const kmUntilService = nextServiceKm != null ? nextServiceKm - mileage : null;
  const regExpiry = str(pick(v, ['registration_expiry']));
  const regOverdue = regExpiry ? new Date(regExpiry).getTime() < Date.now() : false;

  // Financial metrics derived from this vehicle's loads (delivered only).
  const loads = asArray(loadsData ?? []);
  const delivered = loads.filter((l) => str(pick(l, ['status'])).toUpperCase() === 'DELIVERED');
  const totalRevenue = delivered.reduce((s, l) => s + num(pick(l, ['total_amount'])), 0);
  const avgRevPerTrip = delivered.length ? totalRevenue / delivered.length : 0;
  const totalDistance = delivered.reduce((s, l) => s + num(pick(l, ['distance'])), 0);
  const revPerKm = totalDistance ? totalRevenue / totalDistance : 0;

  const setStatus = async (next: string) => {
    if (next === status) return;
    try {
      await updateVehicle(id, { status: next });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['vehicle', id] }),
        qc.invalidateQueries({ queryKey: ['vehicles'] }),
      ]);
      toast.success();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete vehicle', 'This permanently removes the vehicle. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVehicle(id);
            await qc.invalidateQueries({ queryKey: ['vehicles'] });
            toast.success();
            navigation.goBack();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not delete');
          }
        },
      },
    ]);

  return (
    <SheetScreen
      eyebrow="Vehicle"
      title={str(pick(v, ['name', 'make_model', 'model', 'registration']), 'Vehicle')}
      onBack={() => navigation.goBack()}
      actionLabel="Edit"
      actionIcon="edit"
      onAction={() => navigation.navigate('AddVehicle', { id, preview: v })}
      footer={<Button label="Delete vehicle" variant="danger" icon="x" onPress={confirmDelete} fullWidth />}
    >
      <View className="mb-4 flex-row">
        <StatusPill status={status} />
      </View>

      {/* Update status — single dropdown */}
      <View className="mb-5">
        <SelectField
          label="Update status"
          options={VEHICLE_STATUSES.map((s) => ({ label: statusLabel(s), value: s }))}
          value={status}
          onSelect={setStatus}
        />
      </View>

      <View className="mb-5">
        <SegmentedControl
          options={[
            { label: 'Overview', value: 'overview' },
            { label: 'Financial Profile', value: 'financial' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'overview' ? (
        <>
          <View className="mb-5 flex-row flex-wrap gap-3">
            <View style={{ width: '47.5%' }}>
              <StatCard label="AI health score" value={`${num(pick(v, ['ai_health_score', 'health_score']))}/100`} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="Fuel efficiency" value={`${num(pick(v, ['fuel_efficiency_score']))}/100`} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="Uptime" value={`${num(pick(v, ['uptime_percentage'])).toFixed(1)}%`} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="Mileage" value={`${formatNumber(mileage)} km`} />
            </View>
          </View>

          <Group label="Specification">
            <DetailRow label="VIN" value={str(pick(v, ['vin']), '—')} />
            <DetailRow label="Plate" value={str(pick(v, ['plate', 'registration']), '—')} />
            <DetailRow label="Type" value={str(pick(v, ['vehicle_type_name', 'vehicle_type']), '—')} mono={false} />
            <DetailRow label="Capacity" value={`${(num(pick(v, ['capacity', 'capacity_kg'])) / 1000).toFixed(1)} t`} />
            <DetailRow label="Fuel type" value={str(pick(v, ['fuel_type']), '—')} mono={false} />
            <DetailRow label="Year" value={str(pick(v, ['year']), '—')} />
            <DetailRow label="Driver" value={str(pick(v, ['driver_name']), 'Unassigned')} mono={false} last />
          </Group>

          <Group label="Economics">
            <DetailRow label="Cost per km" value={`R ${num(pick(v, ['cost_per_km'])).toFixed(2)}`} />
            <DetailRow label="Margin per trip" value={formatCurrency(num(pick(v, ['margin_per_trip'])))} />
            <DetailRow label="Fuel consumption" value={`${num(pick(v, ['fuel_consumption_per_km'])).toFixed(2)} L/km`} last />
          </Group>

          <Group label="Maintenance">
            <DetailRow label="Last maintenance" value={showDate(str(pick(v, ['last_maintenance_date'])))} />
            <DetailRow label="Service interval" value={serviceInterval ? `${formatNumber(serviceInterval)} km` : '—'} />
            <DetailRow label="Next service at" value={nextServiceKm != null ? `${formatNumber(nextServiceKm)} km` : '—'} />
            <DetailRow
              label="Km until service"
              value={kmUntilService != null ? (kmUntilService <= 0 ? 'Overdue' : `${formatNumber(kmUntilService)} km`) : '—'}
              valueColor={kmUntilService != null && kmUntilService <= 0 ? '#FF4949' : undefined}
            />
            <DetailRow
              label="Registration expiry"
              value={showDate(regExpiry)}
              valueColor={regOverdue ? '#FF4949' : undefined}
              last
            />
          </Group>
        </>
      ) : (
        <>
          <View className="mb-5 flex-row flex-wrap gap-3">
            <View style={{ width: '47.5%' }}>
              <StatCard label="Revenue" value={formatCurrencyCompact(totalRevenue)} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="Avg / trip" value={formatCurrencyCompact(avgRevPerTrip)} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="Revenue / km" value={`R ${revPerKm.toFixed(2)}`} />
            </View>
            <View style={{ width: '47.5%' }}>
              <StatCard label="AI health" value={`${num(pick(v, ['ai_health_score']))}/100`} />
            </View>
          </View>

          <SectionLabel>Performance scores</SectionLabel>
          <View className="mb-5 rounded-xs border border-line bg-surface p-4">
            <ScoreBar label="AI health" value={num(pick(v, ['ai_health_score', 'health_score']))} />
            <ScoreBar label="Uptime" value={num(pick(v, ['uptime_score', 'uptime_percentage']))} />
            <ScoreBar label="Fuel efficiency" value={num(pick(v, ['fuel_efficiency_score']))} />
            <ScoreBar label="Maintenance" value={num(pick(v, ['maintenance_score']))} />
          </View>

          <Group label="Cost analysis">
            <DetailRow label="Cost per km" value={`R ${num(pick(v, ['cost_per_km'])).toFixed(2)}`} />
            <DetailRow label="Margin per trip" value={formatCurrency(num(pick(v, ['margin_per_trip'])))} />
            <DetailRow label="Fuel consumption" value={`${num(pick(v, ['fuel_consumption_per_km'])).toFixed(2)} L/km`} />
            <DetailRow label="Capacity" value={`${(num(pick(v, ['capacity', 'capacity_kg'])) / 1000).toFixed(1)} t`} />
            <DetailRow label="Fuel type" value={str(pick(v, ['fuel_type']), '—')} mono={false} />
            <DetailRow label="Mileage" value={`${formatNumber(mileage)} km`} last />
          </Group>

          <Group label="Compliance & maintenance">
            <DetailRow label="Last maintenance" value={showDate(str(pick(v, ['last_maintenance_date'])))} />
            <DetailRow label="Service interval" value={serviceInterval ? `${formatNumber(serviceInterval)} km` : '—'} />
            <DetailRow
              label="Km until service"
              value={kmUntilService != null ? (kmUntilService <= 0 ? 'Overdue' : `${formatNumber(kmUntilService)} km`) : '—'}
              valueColor={kmUntilService != null && kmUntilService <= 0 ? '#FF4949' : undefined}
            />
            <DetailRow
              label="Registration expiry"
              value={showDate(regExpiry)}
              valueColor={regOverdue ? '#FF4949' : undefined}
            />
            <DetailRow label="VIN" value={str(pick(v, ['vin']), '—')} last />
          </Group>

          {delivered.length > 0 || loads.length > 0 ? (
            <Group label={`Recent loads (${loads.length})`}>
              {loads.slice(0, 8).map((l, i, arr) => {
                const lid = pick(l, ['id']) as string | number;
                return (
                  <ListRow
                    key={String(lid ?? i)}
                    leading={<Icon name="truck" size={20} color={colors.muted} />}
                    title={str(pick(l, ['load_number', 'reference']), 'Load')}
                    subtitle={`${str(pick(l, ['pickup_city']), '—')} → ${str(pick(l, ['delivery_city']), '—')}`}
                    trailing={
                      <View className="items-end gap-1">
                        <Mono className="text-callout font-semibold text-fg">
                          {formatCurrency(num(pick(l, ['total_amount'])), { maximumFractionDigits: 0 })}
                        </Mono>
                        <StatusPill status={str(pick(l, ['status']), 'PENDING').toUpperCase()} />
                      </View>
                    }
                    onPress={() => lid != null && openLoad(lid, l)}
                    last={i === Math.min(arr.length, 8) - 1}
                  />
                );
              })}
            </Group>
          ) : null}
        </>
      )}
    </SheetScreen>
  );
}

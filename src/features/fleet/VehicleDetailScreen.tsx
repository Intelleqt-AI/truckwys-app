import { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, StatCard, StatusPill, Group, DetailRow, SectionLabel, Button, Mono } from '@/components/ui';
import { ErrorState } from '@/components/feedback';
import { useVehicle, updateVehicle, deleteVehicle, VEHICLE_STATUSES } from './api';
import { num, str, pick } from '@/lib/api/list';
import { formatDate, formatNumber } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'VehicleDetail'>;

export function VehicleDetailScreen({ route, navigation }: Props) {
  const { id, preview } = route.params;
  const { data, isError, refetch } = useVehicle(id, preview);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  if (isError && !data) return <ErrorState onRetry={refetch} message="Couldn't load this vehicle." />;
  const v = (data ?? {}) as Record<string, unknown>;
  const status = str(pick(v, ['status']), 'AVAILABLE').toUpperCase();

  const setStatus = async (next: string) => {
    if (next === status) return;
    setBusy(true);
    try {
      await updateVehicle(id, { status: next });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['vehicle', id] }),
        qc.invalidateQueries({ queryKey: ['vehicles'] }),
      ]);
      toast.success(`Set ${next.replace(/_/g, ' ').toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
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
            toast.success('Vehicle deleted');
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

      {/* Status change */}
      <SectionLabel>Update status</SectionLabel>
      <View className="mb-5 flex-row flex-wrap gap-2">
        {VEHICLE_STATUSES.map((s) => {
          const active = s === status;
          return (
            <Pressable
              key={s}
              disabled={busy}
              onPress={() => setStatus(s)}
              className={`min-h-[40px] justify-center rounded-xs border px-3.5 ${
                active ? 'border-accent bg-accent' : 'border-line-active bg-surface'
              }`}
            >
              <Mono className={`text-micro tracking-wide uppercase ${active ? 'text-on-accent' : 'text-fg'}`}>
                {s.replace(/_/g, ' ')}
              </Mono>
            </Pressable>
          );
        })}
      </View>

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
          <StatCard label="Mileage" value={`${formatNumber(num(pick(v, ['mileage'])))} km`} />
        </View>
      </View>

      <Group label="Specifications">
        <DetailRow label="Registration" value={str(pick(v, ['registration', 'plate']), '—')} />
        <DetailRow label="Make / model" value={str(pick(v, ['make_model', 'model']), '—')} mono={false} />
        <DetailRow label="Type" value={str(pick(v, ['vehicle_type_name', 'vehicle_type']), '—')} mono={false} />
        <DetailRow label="VIN" value={str(pick(v, ['vin']), '—')} />
        <DetailRow label="Capacity" value={`${num(pick(v, ['capacity', 'capacity_kg'])) / 1000} t`} last />
      </Group>

      <Group label="Service & compliance">
        <DetailRow label="Next service" value={formatDate(str(pick(v, ['next_service_date', 'service_due'])) || new Date().toISOString())} />
        <DetailRow label="Insurance expiry" value={formatDate(str(pick(v, ['insurance_expiry'])) || new Date().toISOString())} />
        <DetailRow label="Registration expiry" value={formatDate(str(pick(v, ['registration_expiry'])) || new Date().toISOString())} last />
      </Group>
    </SheetScreen>
  );
}

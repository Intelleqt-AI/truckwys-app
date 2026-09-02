import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchData } from '@/lib/api/client';
import { SheetScreen, SelectField, Button, Txt, Mono, type Option } from '@/components/ui';
import { asArray, str, pick } from '@/lib/api/list';
import { assignLoadDriver, convertQuoteToLoad, updateLoadStatus } from './api';
import { invalidateFor } from '@/lib/queryInvalidation';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AssignDriverVehicle'>;

interface DriverOption {
  id: number | string;
  user_details?: { name?: string; username?: string };
}

interface VehicleOption {
  id: number | string;
  make?: string;
  model?: string;
  plate?: string;
}

// Pull the current driver/vehicle id off a load record for prefilling. The API
// returns these either flat or nested depending on the serializer depth.
export function assignedIds(load: Record<string, unknown>) {
  const idOf = (v: unknown) => {
    if (v == null) return '';
    if (typeof v === 'object') return str(pick(v as Record<string, unknown>, ['id', 'pk']));
    return str(v);
  };
  return {
    driverId: idOf(pick(load, ['driver', 'driver_id'])),
    vehicleId: idOf(pick(load, ['vehicle', 'vehicle_id'])),
  };
}

// A real pushed screen (not an inline <Modal>) — mirrors AddDriverScreen etc.
// so the pickers below can safely be proper SelectFields: nesting SelectField's
// own full-screen Modal inside another RN <Modal> (the previous AssignSheet)
// was unreliable on iOS, which is why that version fell back to an inline,
// always-expanded RadioRows list for both fields at once.
export function AssignDriverVehicleScreen({ route, navigation }: Props) {
  const {
    mode,
    loadId,
    quoteId,
    reference,
    vehicleType,
    initialDriverId = '',
    initialVehicleId = '',
    activateOnAssign,
    popCallerOnSuccess,
  } = route.params;
  const reassigning = mode === 'reassign';
  const qc = useQueryClient();

  const [driverId, setDriverId] = useState(initialDriverId);
  const [vehicleId, setVehicleId] = useState(initialVehicleId);
  const [busy, setBusy] = useState(false);

  const { data: driversRaw } = useQuery({
    queryKey: ['drivers-available-for-assign'],
    queryFn: () => fetchData('drivers/?status=ACTIVE'),
  });
  const { data: vehiclesRaw } = useQuery({
    queryKey: ['vehicles-available-for-assign', vehicleType ?? ''],
    queryFn: () =>
      fetchData(
        `vehicles/?status=AVAILABLE${
          vehicleType ? `&vehicle_type__name=${encodeURIComponent(vehicleType)}` : ''
        }`,
      ),
  });

  const clearLabel = reassigning ? '— Unassign —' : '— Assign later —';

  const driverOptions: Option[] = useMemo(() => {
    const rows = asArray<DriverOption>(driversRaw);
    return [
      { label: clearLabel, value: '' },
      ...rows.map((d) => ({
        label: d.user_details?.name || d.user_details?.username || `Driver #${d.id}`,
        value: String(d.id),
      })),
    ];
  }, [driversRaw, clearLabel]);

  const vehicleOptions: Option[] = useMemo(() => {
    const rows = asArray<VehicleOption>(vehiclesRaw);
    return [
      { label: clearLabel, value: '' },
      ...rows.map((v) => {
        const name = [v.make, v.model].filter(Boolean).join(' ');
        return {
          label: `${name || 'Vehicle'}${v.plate ? ` · ${v.plate}` : ` #${v.id}`}`,
          value: String(v.id),
        };
      }),
    ];
  }, [vehiclesRaw, clearLabel]);

  // All-or-nothing, matching web: both picked assigns, neither leaves it
  // unassigned. No capacity or licence check — the backend owns that.
  const both = !!driverId && !!vehicleId;
  const neither = !driverId && !vehicleId;
  const canProceed = (both || neither) && !busy;

  const confirmLabel = busy
    ? reassigning
      ? 'SAVING…'
      : 'CONVERTING…'
    : both
      ? 'CONFIRM'
      : reassigning
        ? 'UNASSIGN'
        : 'ASSIGN LATER';

  const confirm = async () => {
    if (!canProceed) return;
    setBusy(true);
    try {
      if (mode === 'reassign') {
        if (loadId == null) throw new Error('Missing load');
        await assignLoadDriver(loadId, driverId ? Number(driverId) : null, vehicleId ? Number(vehicleId) : null);
        // assign_driver only auto-promotes PENDING -> ASSIGNED; from any other
        // status (e.g. LOADING) it leaves status untouched, so finish the move
        // explicitly when this was opened from the status dropdown — but only
        // if it actually resulted in a real assignment (not a clear).
        if (activateOnAssign && driverId && vehicleId) {
          await updateLoadStatus(loadId, 'ASSIGNED');
        }
        invalidateFor(qc, 'load');
        toast.success(driverId && vehicleId ? 'Assigned' : 'Unassigned');
        navigation.goBack();
      } else {
        if (quoteId == null) throw new Error('Missing quote');
        const created = await convertQuoteToLoad(quoteId, { driver_id: driverId, vehicle_id: vehicleId });
        // A load's status drives revenue/fleet utilisation; a converted quote
        // also stops showing as convertible.
        invalidateFor(qc, 'quote', 'load');
        toast.success(driverId && vehicleId ? 'Converted and assigned' : 'Converted to booking');
        const newLoadId = pick((created ?? {}) as Record<string, unknown>, ['id', 'load_id', 'pk']);
        navigation.pop(popCallerOnSuccess ? 2 : 1);
        if (newLoadId != null) {
          navigation.navigate('LoadDetail', { id: newLoadId as string | number });
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  };

  const noDrivers = driverOptions.length === 1;
  const noVehicles = vehicleOptions.length === 1;

  return (
    <SheetScreen
      variant="modal"
      title={reassigning ? 'Assignment' : 'Convert to booking'}
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label={confirmLabel}
          loading={busy}
          disabled={!canProceed}
          onPress={confirm}
          fullWidth
        />
      }
    >
      <Txt className="mb-5 text-sub text-muted">
        {reassigning
          ? 'Pick a driver and vehicle for this load, or clear both to unassign.'
          : `Convert ${reference ? reference : 'this quote'} to an active booking?`}
      </Txt>

      <View className="gap-4">
        <SelectField
          label="Driver"
          placeholder={clearLabel}
          options={noDrivers ? [] : driverOptions}
          value={driverId}
          onSelect={setDriverId}
          warning={noDrivers ? 'No available drivers — check the Fleet tab.' : undefined}
        />

        <SelectField
          label={vehicleType ? `Vehicle (${vehicleType})` : 'Vehicle'}
          placeholder={clearLabel}
          options={noVehicles ? [] : vehicleOptions}
          value={vehicleId}
          onSelect={setVehicleId}
          warning={
            noVehicles
              ? vehicleType
                ? `No available ${vehicleType} vehicles — check the Fleet tab.`
                : 'No available vehicles — check the Fleet tab.'
              : undefined
          }
        />

        {!both && !neither && (
          <Mono className="text-micro text-warning">
            Select both, or clear both to {reassigning ? 'unassign' : 'assign later'}.
          </Mono>
        )}
      </View>
    </SheetScreen>
  );
}

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

  const { data: driversRaw, isLoading: driversLoading } = useQuery({
    queryKey: ['drivers-available-for-assign'],
    queryFn: () => fetchData('drivers/?status=ACTIVE'),
  });
  const { data: vehiclesRaw, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['vehicles-available-for-assign', vehicleType ?? ''],
    queryFn: () =>
      fetchData(
        `vehicles/?status=AVAILABLE${
          vehicleType ? `&vehicle_type__name=${encodeURIComponent(vehicleType)}` : ''
        }`,
      ),
  });

  // Reassigning: driver stays optional (relabeled away from "unassign"),
  // vehicle becomes mandatory — no clear entry for it at all.
  const driverClearLabel = reassigning ? '— No driver —' : '— Assign later —';
  const vehicleClearLabel = reassigning ? undefined : '— Assign later —';

  const driverOptions: Option[] = useMemo(() => {
    const rows = asArray<DriverOption>(driversRaw);
    return [
      { label: driverClearLabel, value: '' },
      ...rows.map((d) => ({
        label: d.user_details?.name || d.user_details?.username || `Driver #${d.id}`,
        value: String(d.id),
      })),
    ];
  }, [driversRaw, driverClearLabel]);

  const vehicleOptions: Option[] = useMemo(() => {
    const rows = asArray<VehicleOption>(vehiclesRaw);
    const mapped = rows.map((v) => {
      const name = [v.make, v.model].filter(Boolean).join(' ');
      return {
        label: `${name || 'Vehicle'}${v.plate ? ` · ${v.plate}` : ` #${v.id}`}`,
        value: String(v.id),
      };
    });
    return vehicleClearLabel ? [{ label: vehicleClearLabel, value: '' }, ...mapped] : mapped;
  }, [vehiclesRaw, vehicleClearLabel]);

  // Vehicle is the only mandatory-if-anything field in both modes — a driver
  // can never be picked without a vehicle. Reassign mode always requires a
  // vehicle (no clear entry for it); convert mode also allows leaving both
  // empty to assign later.
  const canProceed = reassigning ? !!vehicleId && !busy : (!driverId || !!vehicleId) && !busy;

  const confirmLabel = busy
    ? reassigning
      ? 'SAVING…'
      : 'CONVERTING…'
    : reassigning
      ? 'CONFIRM'
      : vehicleId
        ? 'CONFIRM'
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
        // explicitly when this was opened from the status dropdown. Vehicle is
        // required to get here at all, so this always reflects a real assignment.
        if (activateOnAssign && vehicleId) {
          await updateLoadStatus(loadId, 'ASSIGNED');
        }
        invalidateFor(qc, 'load');
        toast.success('Assigned');
        navigation.goBack();
      } else {
        if (quoteId == null) throw new Error('Missing quote');
        const created = await convertQuoteToLoad(quoteId, { driver_id: driverId, vehicle_id: vehicleId });
        // A load's status drives revenue/fleet utilisation; a converted quote
        // also stops showing as convertible.
        invalidateFor(qc, 'quote', 'load');
        toast.success(vehicleId ? 'Converted and assigned' : 'Converted to booking');
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

  // Gated on isLoading so the "no options" warning doesn't flash before the
  // query has actually resolved (asArray(undefined) === [] looks empty too).
  const noDrivers = !driversLoading && driverOptions.length === 1;
  // Reassign mode has no clear entry in vehicleOptions, so the "empty" baseline is 0 not 1.
  const noVehicles =
    !vehiclesLoading && (reassigning ? vehicleOptions.length === 0 : vehicleOptions.length === 1);

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
          ? 'Pick a vehicle for this load. Driver is optional.'
          : `Convert ${reference ? reference : 'this quote'} to an active booking?`}
      </Txt>

      <View className="gap-4">
        <SelectField
          label={vehicleType ? `Vehicle (${vehicleType})` : 'Vehicle'}
          placeholder={vehicleClearLabel ?? 'Select vehicle'}
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

        <SelectField
          label="Driver"
          placeholder={driverClearLabel}
          options={noDrivers ? [] : driverOptions}
          value={driverId}
          onSelect={setDriverId}
          warning={noDrivers ? 'No available drivers — check the Fleet tab.' : undefined}
        />

        {!reassigning && !!driverId && !vehicleId && (
          <Mono className="text-micro text-warning">
            Select a vehicle to assign a driver, or clear driver to assign later.
          </Mono>
        )}
      </View>
    </SheetScreen>
  );
}

import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchAllRows } from '@/lib/api/fetchAllPages';
import { SheetScreen, SelectField, Button, Txt, type Option } from '@/components/ui';
import { str, pick } from '@/lib/api/list';
import { assignLoadDriver, convertQuoteToLoad, seedLoad, updateLoadStatus } from './api';
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
    queryFn: () => fetchAllRows<DriverOption>('drivers/?status=ACTIVE'),
  });
  const { data: vehiclesRaw, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['vehicles-available-for-assign', vehicleType ?? ''],
    queryFn: () =>
      fetchAllRows<VehicleOption>(
        `vehicles/?status=AVAILABLE${
          vehicleType ? `&vehicle_type__name=${encodeURIComponent(vehicleType)}` : ''
        }`,
      ),
  });

  // Vehicle and driver are both optional: an order can be Assigned with either,
  // both or neither. Reassigning words the clear entries as "No …"; converting
  // as "Assign later".
  const driverClearLabel = reassigning ? 'No driver' : 'Assign later';
  const vehicleClearLabel = reassigning ? 'No vehicle' : 'Assign later';

  const driverOptions: Option[] = useMemo(() => {
    const rows = driversRaw ?? [];
    return [
      { label: driverClearLabel, value: '' },
      ...rows.map((d) => ({
        label: d.user_details?.name || d.user_details?.username || `Driver #${d.id}`,
        value: String(d.id),
      })),
    ];
  }, [driversRaw, driverClearLabel]);

  const vehicleOptions: Option[] = useMemo(() => {
    const rows = vehiclesRaw ?? [];
    const mapped = rows.map((v) => {
      const name = [v.make, v.model].filter(Boolean).join(' ');
      return {
        label: `${name || 'Vehicle'}${v.plate ? ` · ${v.plate}` : ` #${v.id}`}`,
        value: String(v.id),
      };
    });
    return [{ label: vehicleClearLabel, value: '' }, ...mapped];
  }, [vehiclesRaw, vehicleClearLabel]);

  const canProceed = !busy;

  const confirmLabel = busy
    ? reassigning
      ? 'Saving…'
      : 'Converting…'
    : reassigning
      ? 'Confirm'
      : vehicleId || driverId
        ? 'Confirm'
        : 'Assign later';

  const confirm = async () => {
    if (!canProceed) return;
    setBusy(true);
    try {
      if (mode === 'reassign') {
        if (loadId == null) throw new Error('Missing load');
        // Opened from the status dropdown with nothing picked: only the status
        // changes, so there is no assignment to post.
        if (!activateOnAssign || vehicleId || driverId) {
          const assigned = await assignLoadDriver(
            loadId,
            driverId ? Number(driverId) : null,
            vehicleId ? Number(vehicleId) : null,
          );
          // Both endpoints return the full updated load, so write it straight into
          // the detail cache: the screen underneath shows the new driver/vehicle
          // the moment this sheet closes, not after a refetch.
          seedLoad(qc, assigned, loadId);
        }
        // assign_driver only auto-promotes PENDING -> ASSIGNED; from any other
        // status (e.g. LOADING) it leaves status untouched, so finish the move
        // explicitly when this was opened from the status dropdown.
        if (activateOnAssign) {
          seedLoad(qc, await updateLoadStatus(loadId, 'ASSIGNED'), loadId);
        }
        invalidateFor(qc, 'load');
        toast.success('Assigned');
        navigation.goBack();
      } else {
        if (quoteId == null) throw new Error('Missing quote');
        const created = await convertQuoteToLoad(quoteId, { driver_id: driverId, vehicle_id: vehicleId });
        const newLoadId = pick((created ?? {}) as Record<string, unknown>, ['id', 'load_id', 'pk']);
        // The response is the complete new load. Seed the detail cache before
        // navigating so LoadDetail opens populated instead of blank until its
        // own GET gets through the invalidation refetch wave below.
        seedLoad(qc, created, newLoadId as string | number | undefined);
        // A load's status drives revenue/fleet utilisation; a converted quote
        // also stops showing as convertible.
        invalidateFor(qc, 'quote', 'load');
        toast.success(vehicleId || driverId ? 'Converted and assigned' : 'Converted to booking');
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
  // query has actually resolved (no data yet looks empty too).
  const noDrivers = !driversLoading && driverOptions.length === 1;
  const noVehicles = !vehiclesLoading && vehicleOptions.length === 1;

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
          ? activateOnAssign
            ? 'Pick a vehicle and a driver now, or leave them blank and add them later. This marks the order Assigned.'
            : 'Vehicle and driver are both optional.'
          : `Convert ${reference ? reference : 'this quote'} to an active booking?`}
      </Txt>

      <View className="gap-4">
        <SelectField
          label={vehicleType ? `Vehicle (${vehicleType})` : 'Vehicle'}
          placeholder={vehicleClearLabel}
          options={noVehicles ? [] : vehicleOptions}
          value={vehicleId}
          onSelect={setVehicleId}
          warning={
            noVehicles
              ? vehicleType
                ? `No available ${vehicleType} vehicles. Check the Fleet tab.`
                : 'No available vehicles. Check the Fleet tab.'
              : undefined
          }
        />

        <SelectField
          label="Driver"
          placeholder={driverClearLabel}
          options={noDrivers ? [] : driverOptions}
          value={driverId}
          onSelect={setDriverId}
          warning={noDrivers ? 'No available drivers. Check the Fleet tab.' : undefined}
        />
      </View>
    </SheetScreen>
  );
}

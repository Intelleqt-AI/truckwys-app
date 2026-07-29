import { useMemo, useState } from 'react';
import { View, Modal, Pressable, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';
import { asArray, str, pick } from '@/lib/api/list';
import { Txt, Mono, Button, RadioRows, type Option } from '@/components/ui';

interface Props {
  /** `convert` turns an accepted quote into a booking; `reassign` edits an existing load. */
  mode: 'convert' | 'reassign';
  /** Quote number shown in the convert prompt. */
  reference?: string;
  /** Restricts the vehicle list to matching vehicles when known. */
  vehicleType?: string;
  initialDriverId?: string;
  initialVehicleId?: string;
  busy?: boolean;
  onConfirm: (driverId: string, vehicleId: string) => void;
  onCancel: () => void;
}

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

// One sheet for both call sites, mirroring the web ConvertToBookingModal. On
// convert the pickers stay collapsed behind a toggle — most conversions don't
// need them right away — while reassign opens straight into them.
export function AssignSheet({
  mode,
  reference,
  vehicleType,
  initialDriverId = '',
  initialVehicleId = '',
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const reassigning = mode === 'reassign';
  const [showAssign, setShowAssign] = useState(reassigning);
  const [driverId, setDriverId] = useState(initialDriverId);
  const [vehicleId, setVehicleId] = useState(initialVehicleId);

  // Don't fetch until the pickers are actually visible (web: `enabled: showAssign`).
  const { data: driversRaw } = useQuery({
    queryKey: ['drivers-available-for-assign'],
    queryFn: () => fetchData('drivers/?status=ACTIVE'),
    enabled: showAssign,
  });
  const { data: vehiclesRaw } = useQuery({
    queryKey: ['vehicles-available-for-assign', vehicleType ?? ''],
    queryFn: () =>
      fetchData(
        `vehicles/?status=AVAILABLE${
          vehicleType ? `&vehicle_type__name=${encodeURIComponent(vehicleType)}` : ''
        }`,
      ),
    enabled: showAssign,
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

  const noDrivers = showAssign && driverOptions.length === 1;
  const noVehicles = showAssign && vehicleOptions.length === 1;

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
      ? 'ASSIGN & CONFIRM'
      : reassigning
        ? 'CONFIRM — UNASSIGNED'
        : 'CONFIRM — ASSIGN LATER';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} className="flex-1 items-center justify-center bg-black/65 px-6">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-[420px] rounded-sm border border-line bg-surface p-5"
        >
          <Txt className="text-heading font-semibold text-fg">
            {reassigning ? 'Assignment' : 'Convert to booking'}
          </Txt>
          <Txt className="mb-4 mt-1.5 text-sub text-muted">
            {reassigning
              ? 'Pick a driver and vehicle for this load, or clear both to unassign.'
              : `Convert ${reference ? reference : 'this quote'} to an active booking?`}
          </Txt>

          {!showAssign ? (
            <Pressable onPress={() => setShowAssign(true)} hitSlop={8} className="mb-5">
              <Mono className="text-caption text-accent">+ Assign driver and vehicle</Mono>
            </Pressable>
          ) : (
            <ScrollView className="mb-4 max-h-[340px]" keyboardShouldPersistTaps="handled">
              <View className="gap-4">
                <RadioRows
                  label="Driver"
                  options={noDrivers ? [] : driverOptions}
                  value={driverId}
                  onSelect={setDriverId}
                  emptyText="No available drivers — check the Fleet tab."
                />

                <RadioRows
                  label={vehicleType ? `Vehicle (${vehicleType})` : 'Vehicle'}
                  options={noVehicles ? [] : vehicleOptions}
                  value={vehicleId}
                  onSelect={setVehicleId}
                  emptyText={
                    vehicleType
                      ? `No available ${vehicleType} vehicles — check the Fleet tab.`
                      : 'No available vehicles — check the Fleet tab.'
                  }
                />

                {!both && !neither && (
                  <Mono className="text-micro text-warning">
                    Select both, or clear both to {reassigning ? 'unassign' : 'assign later'}.
                  </Mono>
                )}
              </View>
            </ScrollView>
          )}

          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button label="Cancel" variant="secondary" onPress={onCancel} fullWidth />
            </View>
            <View className="flex-1">
              <Button
                label={confirmLabel}
                loading={busy}
                disabled={!canProceed}
                onPress={() => canProceed && onConfirm(driverId, vehicleId)}
                fullWidth
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
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

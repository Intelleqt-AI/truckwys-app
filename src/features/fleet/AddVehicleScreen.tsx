import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SelectField, TextField, DateField, Button, Label } from '@/components/ui';
import { createVehicle, updateVehicle, useVehicleTypesList, useDrivers } from './api';
import { str, num, pick } from '@/lib/api/list';
import { parseNum } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddVehicle'>;

const FALLBACK_TYPES = [
  'Rigid Truck',
  'Semi-Trailer Truck',
  'Flatbed Truck',
  'Tanker',
  'Refrigerated Truck',
  'Tautliner',
  'Box Truck',
];
const STATUSES = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE', 'OUT_OF_SERVICE'].map((v) => ({
  label: v.replace(/_/g, ' '),
  value: v,
}));

export function AddVehicleScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();
  const { data: types } = useVehicleTypesList();
  const { data: drivers } = useDrivers();
  const [busy, setBusy] = useState(false);

  const typeOptions = useMemo(() => {
    const names = (types ?? []).map((t) => t.name);
    return (names.length ? names : FALLBACK_TYPES).map((n) => ({ label: n, value: n }));
  }, [types]);
  const driverOptions = useMemo(
    () => [{ label: '— No driver —', value: '' }, ...(drivers ?? []).map((d) => ({ label: d.name, value: String(d.id) }))],
    [drivers],
  );

  const [vin, setVin] = useState(str(pick(preview, ['vin'])));
  const [make, setMake] = useState(str(pick(preview, ['make'])));
  const [model, setModel] = useState(str(pick(preview, ['model'])));
  const [year, setYear] = useState(
    pick(preview, ['year']) != null ? String(num(pick(preview, ['year']))) : String(new Date().getFullYear()),
  );
  const [plate, setPlate] = useState(str(pick(preview, ['plate', 'registration'])));
  const [capacity, setCapacity] = useState(
    pick(preview, ['capacity']) != null ? String(num(pick(preview, ['capacity'])) / 1000) : '',
  );
  const [mileage, setMileage] = useState(pick(preview, ['mileage']) != null ? String(num(pick(preview, ['mileage']))) : '');
  const [regExpiry, setRegExpiry] = useState(str(pick(preview, ['registration_expiry'])));
  const [lastMaint, setLastMaint] = useState(str(pick(preview, ['last_maintenance_date'])));
  const [serviceInterval, setServiceInterval] = useState(
    pick(preview, ['service_interval_km']) != null ? String(num(pick(preview, ['service_interval_km']))) : '',
  );
  const [lastServiceMileage, setLastServiceMileage] = useState(
    pick(preview, ['last_service_mileage']) != null ? String(num(pick(preview, ['last_service_mileage']))) : '',
  );
  const [type, setType] = useState(str(pick(preview, ['vehicle_type_name', 'vehicle_type'])) || 'Rigid Truck');
  // Not shown any more: fuel type moved to the vehicle type, which is what
  // quotes price against. Vehicle.fuel_type is still required server-side, so
  // keep whatever the record already had and default new vehicles to Diesel.
  const fuelType = str(pick(preview, ['fuel_type'])) || 'Diesel';
  const [status, setStatus] = useState(str(pick(preview, ['status'])).toUpperCase() || 'AVAILABLE');
  const [driver, setDriver] = useState(pick(preview, ['driver']) != null ? String(pick(preview, ['driver'])) : '');

  // Number() was NaN for anything with a comma or a grouping space, and these
  // went straight into the payload — DRF then 400s on "a valid number is
  // required", which read as the whole form being broken.
  const numOrUndef = (v: string) => (v.trim() ? (parseNum(v) ?? undefined) : undefined);
  const numOrNull = (v: string) => (v.trim() ? parseNum(v) : null);
  const capacityTons = capacity.trim() ? parseNum(capacity) : undefined;

  /**
   * Picking a vehicle type seeds Capacity from that type's own capacity.
   *
   * A starting point, not a lock — real vehicles of one type legitimately vary,
   * so the field stays editable and a later type change overwrites it again.
   * Both are in tons here; the payload converts to kg on the way out.
   */
  const chooseType = (name: string) => {
    setType(name);
    const cap = (types ?? []).find((t) => t.name === name)?.capacity;
    if (cap != null) setCapacity(String(cap));
  };

  // The form opens with a type already selected, before the list has loaded, so
  // that selection never went through chooseType. Fill once when the list
  // arrives — and only while Capacity is still blank, so it can't overwrite an
  // edited vehicle's real capacity or something the user just typed.
  const seededCapacity = useRef(false);
  useEffect(() => {
    if (seededCapacity.current || !types?.length) return;
    seededCapacity.current = true;
    if (capacity.trim()) return;
    const cap = types.find((t) => t.name === type)?.capacity;
    if (cap != null) setCapacity(String(cap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types]);

  const submit = async () => {
    // Web marks these seven required; unlike web's drawer we actually enforce it
    // rather than letting the server 400.
    const missing = (
      [
        ['VIN', vin],
        ['Make', make],
        ['Model', model],
        ['Year', year],
        ['Registration plate', plate],
        ['Vehicle type', type],
        ['Capacity', capacity],
      ] as [string, string][]
    ).find(([, v]) => !v.trim());
    if (missing) return toast.error(`${missing[0]} is required`);
    const badField = (
      [
        ['Year', year],
        ['Capacity', capacity],
        ['Mileage', mileage],
        ['Service interval', serviceInterval],
        ['Last service', lastServiceMileage],
      ] as [string, string][]
    ).find(([, v]) => v.trim() && parseNum(v) == null);
    if (badField) return toast.error(`${badField[0]} is not a number`);
    setBusy(true);
    const typeId = (types ?? []).find((t) => t.name === type)?.id;
    const payload = {
      vin: vin.trim() || undefined,
      make: make.trim() || undefined,
      model: model.trim() || undefined,
      plate: plate.trim(),
      fuel_type: fuelType,
      status,
      registration_expiry: regExpiry || undefined,
      last_maintenance_date: lastMaint || undefined,
      year: numOrUndef(year),
      capacity: capacityTons != null ? capacityTons * 1000 : undefined,
      mileage: numOrUndef(mileage),
      service_interval_km: numOrNull(serviceInterval),
      last_service_mileage: numOrNull(lastServiceMileage),
      driver: driver ? Number(driver) : null,
      ...(typeId ? { vehicle_type: typeId } : {}),
    };
    try {
      if (editing) await updateVehicle(editId, payload);
      else await createVehicle(payload);
      invalidateFor(qc, 'vehicle');
      toast.success(editing ? 'Vehicle updated' : 'Vehicle added');
      navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save vehicle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScreen
      eyebrow={editing ? 'Edit' : 'New vehicle'}
      title={editing ? 'Edit vehicle' : 'Add vehicle'}
      variant="modal"
      onBack={() => navigation.goBack()}
      footer={<Button label={editing ? 'Save changes' : 'Add vehicle'} loading={busy} onPress={submit} fullWidth />}
    >
      <View className="gap-4">
        {/* Required first, so nothing mandatory is buried under a run of
            optional fields. Vehicle type sits above Capacity because picking a
            type seeds a starting capacity below it. */}
        <TextField label="VIN" required placeholder="17-character VIN" autoCapitalize="characters" value={vin} onChangeText={setVin} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Make" required placeholder="e.g. Volvo" value={make} onChangeText={setMake} />
          </View>
          <View className="flex-1">
            <TextField label="Model" required placeholder="e.g. FH16" value={model} onChangeText={setModel} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Year" required placeholder="e.g. 2022" keyboardType="number-pad" value={year} onChangeText={setYear} />
          </View>
          <View className="flex-1">
            <TextField label="Registration plate" required placeholder="e.g. CA 123-456" icon="truck" autoCapitalize="characters" value={plate} onChangeText={setPlate} />
          </View>
        </View>
        <SelectField label="Vehicle type" icon="box" required options={typeOptions} value={type} onSelect={chooseType} />
        <TextField label="Capacity (tons)" required placeholder="e.g. 30" keyboardType="decimal-pad" value={capacity} onChangeText={setCapacity} />

        <Label className="mt-1 text-muted">Optional</Label>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Mileage (km)" placeholder="e.g. 120 000" keyboardType="number-pad" numeric value={mileage} onChangeText={setMileage} />
          </View>
          <View className="flex-1">
            <SelectField label="Status" options={STATUSES} value={status} onSelect={setStatus} />
          </View>
        </View>
        <SelectField label="Assigned driver" icon="user" options={driverOptions} value={driver} onSelect={setDriver} />

        <Label className="mt-1 text-muted">Service & compliance</Label>
        <DateField label="Registration expiry" value={regExpiry} onChange={setRegExpiry} />
        <DateField label="Last maintenance date" value={lastMaint} onChange={setLastMaint} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Service interval (km)" placeholder="e.g. 15 000" keyboardType="number-pad" numeric value={serviceInterval} onChangeText={setServiceInterval} />
          </View>
          <View className="flex-1">
            <TextField label="Last service (km)" placeholder="e.g. 110 000" keyboardType="number-pad" numeric value={lastServiceMileage} onChangeText={setLastServiceMileage} />
          </View>
        </View>
      </View>
    </SheetScreen>
  );
}

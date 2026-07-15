import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SelectField, TextField, Button, Label } from '@/components/ui';
import { createVehicle, updateVehicle, useVehicleTypesList, useDrivers } from './api';
import { str, num, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
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
const FUEL_TYPES = ['Diesel', 'Petrol', 'Electric', 'Hybrid'].map((v) => ({ label: v, value: v }));
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
  const [fuelType, setFuelType] = useState(str(pick(preview, ['fuel_type'])) || 'Diesel');
  const [status, setStatus] = useState(str(pick(preview, ['status'])).toUpperCase() || 'AVAILABLE');
  const [driver, setDriver] = useState(pick(preview, ['driver']) != null ? String(pick(preview, ['driver'])) : '');

  const submit = async () => {
    if (!plate.trim()) return toast.error('Registration plate is required');
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
      year: year ? Number(year) : undefined,
      capacity: capacity ? Number(capacity) * 1000 : undefined,
      mileage: mileage ? Number(mileage) : undefined,
      service_interval_km: serviceInterval ? Number(serviceInterval) : null,
      last_service_mileage: lastServiceMileage ? Number(lastServiceMileage) : null,
      driver: driver ? Number(driver) : null,
      ...(typeId ? { vehicle_type: typeId } : {}),
    };
    try {
      if (editing) await updateVehicle(editId, payload);
      else await createVehicle(payload);
      await qc.invalidateQueries({ queryKey: ['vehicles'] });
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
      onBack={() => navigation.goBack()}
      footer={<Button label={editing ? 'Save changes' : 'Add vehicle'} loading={busy} onPress={submit} fullWidth />}
    >
      <View className="gap-4">
        <TextField label="Registration plate" icon="truck" autoCapitalize="characters" value={plate} onChangeText={setPlate} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Make" value={make} onChangeText={setMake} />
          </View>
          <View className="flex-1">
            <TextField label="Model" value={model} onChangeText={setModel} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Year" keyboardType="numeric" value={year} onChangeText={setYear} />
          </View>
          <View className="flex-1">
            <TextField label="VIN" autoCapitalize="characters" value={vin} onChangeText={setVin} />
          </View>
        </View>
        <SelectField label="Vehicle type" icon="box" options={typeOptions} value={type} onSelect={setType} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <SelectField label="Fuel type" options={FUEL_TYPES} value={fuelType} onSelect={setFuelType} />
          </View>
          <View className="flex-1">
            <SelectField label="Status" options={STATUSES} value={status} onSelect={setStatus} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Capacity (tons)" keyboardType="numeric" value={capacity} onChangeText={setCapacity} />
          </View>
          <View className="flex-1">
            <TextField label="Mileage (km)" keyboardType="numeric" value={mileage} onChangeText={setMileage} />
          </View>
        </View>
        <SelectField label="Assigned driver" icon="user" options={driverOptions} value={driver} onSelect={setDriver} />

        <Label className="mt-1 text-muted">Service & compliance</Label>
        <TextField label="Registration expiry" placeholder="YYYY-MM-DD" value={regExpiry} onChangeText={setRegExpiry} />
        <TextField label="Last maintenance date" placeholder="YYYY-MM-DD" value={lastMaint} onChangeText={setLastMaint} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Service interval (km)" keyboardType="numeric" value={serviceInterval} onChangeText={setServiceInterval} />
          </View>
          <View className="flex-1">
            <TextField label="Last service (km)" keyboardType="numeric" value={lastServiceMileage} onChangeText={setLastServiceMileage} />
          </View>
        </View>
      </View>
    </SheetScreen>
  );
}

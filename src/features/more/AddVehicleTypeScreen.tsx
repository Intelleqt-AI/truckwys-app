import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, TextField, SelectField, Button, Txt } from '@/components/ui';
import { createVehicleType, updateVehicleType } from './api';
import { num, str, pick } from '@/lib/api/list';
import { parseNum } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddVehicleType'>;

const ACTIVE_OPTIONS = [
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
];
// Exactly the backend's VehicleType.FUEL_TYPE_CHOICES — Title-Case, and DRF
// enforces them, so anything else 400s. Which fuel a type burns is what decides
// the company default price a quote is costed against.
const FUEL_TYPE_OPTIONS = ['Diesel', 'Petrol', 'Electric', 'Hybrid'].map((f) => ({ label: f, value: f }));

export function AddVehicleTypeScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const editing = editId != null;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const qc = useQueryClient();

  const [name, setName] = useState(str(pick(preview, ['name'])));
  const [description, setDescription] = useState(str(pick(preview, ['description'])));
  const [capacity, setCapacity] = useState(pick(preview, ['capacity']) != null ? String(num(pick(preview, ['capacity']))) : '');
  const [baseRate, setBaseRate] = useState(pick(preview, ['base_rate']) != null ? String(num(pick(preview, ['base_rate']))) : '');
  const [fuelType, setFuelType] = useState(str(pick(preview, ['fuel_type']), 'Diesel'));
  const [consumption, setConsumption] = useState(
    pick(preview, ['fuel_consumption_l_per_100km']) != null
      ? String(num(pick(preview, ['fuel_consumption_l_per_100km'])))
      : '',
  );
  const [activeStr, setActiveStr] = useState(pick(preview, ['active']) === false ? 'false' : 'true');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error('Name is required');
    if (capacity.trim() && parseNum(capacity) == null) return toast.error('Capacity is not a number');
    if (baseRate.trim() && parseNum(baseRate) == null) return toast.error('Base rate is not a number');
    if (consumption.trim() && parseNum(consumption) == null) return toast.error('Fuel consumption is not a number');
    setBusy(true);
    // capacity is in tons (web stores vehicle-type capacity as tons directly).
    const payload = {
      name: name.trim(),
      description: description.trim(),
      capacity: parseNum(capacity) ?? 0,
      base_rate: parseNum(baseRate) ?? 0,
      fuel_type: fuelType,
      // Left out when blank so the backend's own default (36 L/100km) stands
      // rather than being overwritten with a zero.
      ...(consumption.trim() ? { fuel_consumption_l_per_100km: parseNum(consumption) ?? undefined } : {}),
      active: activeStr === 'true',
    };
    try {
      if (editing) await updateVehicleType(editId, payload);
      else await createVehicleType(payload);
      invalidateFor(qc, 'vehicle-type');
      toast.success();
      navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save type');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScreen
      eyebrow={editing ? 'Edit' : 'New vehicle type'}
      title={editing ? 'Edit vehicle type' : 'Add vehicle type'}
      variant="modal"
      onBack={() => navigation.goBack()}
      footer={<Button label={editing ? 'Save changes' : 'Add vehicle type'} loading={busy} onPress={submit} fullWidth />}
    >
      <View className="gap-4">
        <TextField label="Name" icon="truck" required placeholder="e.g. Superlink 30t" value={name} onChangeText={setName} />
        <TextField label="Description" placeholder="Optional" value={description} onChangeText={setDescription} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Capacity (tons)" placeholder="e.g. 30" icon="box" keyboardType="decimal-pad" value={capacity} onChangeText={setCapacity} />
          </View>
          <View className="flex-1">
            <TextField label="Base rate / km" prefix="R" placeholder="e.g. 25" keyboardType="decimal-pad" value={baseRate} onChangeText={setBaseRate} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <SelectField label="Fuel type" icon="dollar" options={FUEL_TYPE_OPTIONS} value={fuelType} onSelect={setFuelType} />
          </View>
          <View className="flex-1">
            <TextField label="Fuel use (L/100km)" placeholder="e.g. 32" keyboardType="decimal-pad" value={consumption} onChangeText={setConsumption} />
          </View>
        </View>
        <Txt className="-mt-1 text-caption text-faint">
          Quotes for this type are costed at your company&apos;s {fuelType.toLowerCase()} price.
        </Txt>
        {editing && <SelectField label="Status" options={ACTIVE_OPTIONS} value={activeStr} onSelect={setActiveStr} />}
      </View>
    </SheetScreen>
  );
}

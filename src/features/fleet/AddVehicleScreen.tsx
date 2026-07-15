import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SelectField, TextField, Button } from '@/components/ui';
import { createVehicle, updateVehicle, useVehicleTypesList } from './api';
import { str, num, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddVehicle'>;

export function AddVehicleScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();
  const { data: types } = useVehicleTypesList();
  const [busy, setBusy] = useState(false);

  const [registration, setRegistration] = useState(str(pick(preview, ['registration', 'plate'])));
  const [make, setMake] = useState(str(pick(preview, ['make'])));
  const [model, setModel] = useState(str(pick(preview, ['model'])));
  const [vehicleType, setVehicleType] = useState(str(pick(preview, ['vehicle_type_name', 'vehicle_type'])));
  const [capacity, setCapacity] = useState(
    pick(preview, ['capacity']) != null ? String(num(pick(preview, ['capacity'])) / 1000) : '',
  );

  const typeOptions = (types ?? []).map((t) => ({ label: t.name, value: t.name, id: t.id }));

  const submit = async () => {
    if (!registration.trim()) return toast.error('Registration is required');
    setBusy(true);
    const typeId = typeOptions.find((t) => t.value === vehicleType)?.id;
    const payload = {
      registration: registration.trim(),
      make: make.trim() || undefined,
      model: model.trim() || undefined,
      capacity: capacity ? Number(capacity) * 1000 : undefined,
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
        <TextField label="Registration" icon="truck" autoCapitalize="characters" value={registration} onChangeText={setRegistration} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Make" value={make} onChangeText={setMake} />
          </View>
          <View className="flex-1">
            <TextField label="Model" value={model} onChangeText={setModel} />
          </View>
        </View>
        <SelectField label="Vehicle type" icon="box" placeholder="Select type" options={typeOptions} value={vehicleType} onSelect={setVehicleType} />
        <TextField label="Capacity (tons)" icon="box" keyboardType="numeric" value={capacity} onChangeText={setCapacity} />
      </View>
    </SheetScreen>
  );
}

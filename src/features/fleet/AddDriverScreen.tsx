import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, TextField, Button } from '@/components/ui';
import { createDriver, updateDriver } from './api';
import { str, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddDriver'>;

export function AddDriverScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(str(pick(preview, ['name', 'full_name', 'driver_name'])));
  const [license, setLicense] = useState(str(pick(preview, ['license_number', 'license'])));
  const [phone, setPhone] = useState(str(pick(preview, ['phone'])));

  const submit = async () => {
    if (!name.trim()) return toast.error('Driver name is required');
    setBusy(true);
    const payload = {
      name: name.trim(),
      license_number: license.trim() || undefined,
      phone: phone.trim() || undefined,
    };
    try {
      if (editing) await updateDriver(editId, payload);
      else await createDriver(payload);
      await qc.invalidateQueries({ queryKey: ['drivers'] });
      toast.success(editing ? 'Driver updated' : 'Driver added');
      navigation.goBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save driver');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScreen
      eyebrow={editing ? 'Edit' : 'New driver'}
      title={editing ? 'Edit driver' : 'Add driver'}
      onBack={() => navigation.goBack()}
      footer={<Button label={editing ? 'Save changes' : 'Add driver'} loading={busy} onPress={submit} fullWidth />}
    >
      <View className="gap-4">
        <TextField label="Full name" icon="user" autoCapitalize="words" value={name} onChangeText={setName} />
        <TextField label="Licence number" icon="shield" autoCapitalize="characters" value={license} onChangeText={setLicense} />
        <TextField label="Phone" icon="phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      </View>
    </SheetScreen>
  );
}

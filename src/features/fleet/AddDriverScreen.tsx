import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SheetScreen, SelectField, TextField, DateField, Button, Label } from '@/components/ui';
import {
  createUser,
  updateUser,
  createDriver,
  updateDriver,
  updateVehicle,
  useDriver,
  useVehicles,
} from './api';
import { str, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddDriver'>;

const PROVINCES = ['GP', 'WC', 'KZN', 'EC', 'MP', 'LP', 'NW', 'FS', 'NC'].map((v) => ({ label: v, value: v }));
const STATUSES = ['ACTIVE', 'INACTIVE', 'ON_LEAVE'].map((v) => ({ label: v.replace(/_/g, ' '), value: v }));

export function AddDriverScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const editing = editId != null;
  const qc = useQueryClient();
  const { data: full } = useDriver(editId ?? '', route.params?.preview, editing);
  const { data: vehicles } = useVehicles();
  const [busy, setBusy] = useState(false);

  const d = useMemo(() => (full ?? {}) as Record<string, unknown>, [full]);
  const userDetails = useMemo(() => (pick(d, ['user_details']) ?? {}) as Record<string, unknown>, [d]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [license, setLicense] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [medicalExpiry, setMedicalExpiry] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [emergency, setEmergency] = useState('');
  const [province, setProvince] = useState('GP');
  const [status, setStatus] = useState('ACTIVE');
  const [vehicle, setVehicle] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate edit form once the driver record loads (deferred, not sync-in-effect).
  useEffect(() => {
    if (!editing || hydrated || !full) return;
    const t = setTimeout(() => {
      setFirstName(str(pick(userDetails, ['first_name'])) || str(pick(d, ['name'])).split(' ')[0] || '');
      setLastName(str(pick(userDetails, ['last_name'])));
      setEmail(str(pick(userDetails, ['email'])));
      setPhone(str(pick(userDetails, ['phone'])));
      setAddress(str(pick(userDetails, ['address'])));
      setLicense(str(pick(d, ['license_number'])));
      setLicenseExpiry(str(pick(d, ['license_expiry'])));
      setMedicalExpiry(str(pick(d, ['medical_card_expiry'])));
      setHireDate(str(pick(d, ['hire_date'])));
      setEmergency(str(pick(d, ['emergency_contact'])));
      setProvince(str(pick(d, ['license_state'])) || 'GP');
      setStatus(str(pick(d, ['status'])).toUpperCase() || 'ACTIVE');
      setHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, [editing, hydrated, full, d, userDetails]);

  const vehicleOptions = useMemo(
    () => [{ label: '— No vehicle —', value: '' }, ...(vehicles ?? []).map((v) => ({ label: `${v.name} · ${v.plate}`, value: String(v.id) }))],
    [vehicles],
  );

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim() || !license.trim() || !licenseExpiry.trim()) {
      return toast.error('First name, last name, licence number and expiry are required');
    }
    setBusy(true);
    const driverFields = {
      license_number: license.trim(),
      license_expiry: licenseExpiry,
      medical_card_expiry: medicalExpiry || undefined,
      license_state: province,
      hire_date: hireDate || undefined,
      status,
      emergency_contact: emergency || undefined,
    };
    try {
      if (editing) {
        await updateDriver(editId, driverFields);
        const uid = pick(userDetails, ['id']);
        if (uid) {
          await updateUser(uid as string | number, {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
          });
        }
        if (vehicle) await updateVehicle(vehicle, { driver: editId });
      } else {
        const username = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`.replace(/\s+/g, '');
        const user = await createUser({
          username,
          email: email.trim() || `${username}@truckwys.com`,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          password: 'TruckWys2026!',
          role: 'DRIVER',
        });
        const newDriver = await createDriver({ user: pick(user, ['id']), ...driverFields });
        const newId = pick(newDriver, ['id']);
        if (vehicle && newId) await updateVehicle(vehicle, { driver: newId });
      }
      // This screen also POST/PATCHes users/, which the old list never
      // invalidated — the Settings team list stayed stale.
      invalidateFor(qc, 'driver');
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
      variant="modal"
      onBack={() => navigation.goBack()}
      footer={<Button label={editing ? 'Save changes' : 'Add driver'} loading={busy} onPress={submit} fullWidth />}
    >
      <View className="gap-4">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="First name" placeholder="Jane" icon="user" autoCapitalize="words" value={firstName} onChangeText={setFirstName} />
          </View>
          <View className="flex-1">
            <TextField label="Last name" placeholder="Dlamini" autoCapitalize="words" value={lastName} onChangeText={setLastName} />
          </View>
        </View>
        <TextField label="Email" placeholder="jane@company.co.za" icon="send" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Phone" placeholder="+27 82 123 4567" icon="phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          </View>
          <View className="flex-1">
            <TextField label="Emergency contact" placeholder="Name · phone" value={emergency} onChangeText={setEmergency} />
          </View>
        </View>
        <TextField label="Address" placeholder="Street, city" value={address} onChangeText={setAddress} />

        <Label className="mt-1 text-muted">Licence</Label>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <TextField label="Licence number" placeholder="e.g. 1234567890" icon="shield" autoCapitalize="characters" value={license} onChangeText={setLicense} />
          </View>
          <View className="flex-1">
            <SelectField label="Province" options={PROVINCES} value={province} onSelect={setProvince} />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DateField label="Licence expiry" value={licenseExpiry} onChange={setLicenseExpiry} />
          </View>
          <View className="flex-1">
            <DateField label="Medical expiry" value={medicalExpiry} onChange={setMedicalExpiry} />
          </View>
        </View>

        <Label className="mt-1 text-muted">Employment</Label>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <DateField label="Hire date" value={hireDate} onChange={setHireDate} />
          </View>
          <View className="flex-1">
            <SelectField label="Status" options={STATUSES} value={status} onSelect={setStatus} />
          </View>
        </View>
        <SelectField label="Assigned vehicle" icon="truck" options={vehicleOptions} value={vehicle} onSelect={setVehicle} />
      </View>
    </SheetScreen>
  );
}

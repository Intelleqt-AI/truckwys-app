import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useForm, Controller, type Control, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  SelectField,
  TextField,
  DateField,
  Button,
  Label,
  SaveSuccessOverlay,
  type TextFieldProps,
} from '@/components/ui';
import {
  createUser,
  updateUser,
  createDriver,
  updateDriver,
  updateVehicle,
  useDriver,
  useVehicles,
  DRIVER_STATUSES,
} from './api';
import {
  driverSchema,
  driverWarnings,
  DRIVER_FIELD_ORDER,
  type DriverFormValues,
} from './validation';
import { str, pick } from '@/lib/api/list';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { dismissKeyboard } from '@/lib/keyboard';
import { useErrorShake } from '@/hooks/useErrorShake';
import { useFieldAnchors } from '@/hooks/useFieldAnchors';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddDriver'>;

const PROVINCES = ['GP', 'WC', 'KZN', 'EC', 'MP', 'LP', 'NW', 'FS', 'NC'].map((v) => ({
  label: v,
  value: v,
}));
const STATUSES = DRIVER_STATUSES.map((v) => ({ label: v.replace(/_/g, ' '), value: v }));

function fromDriverRecord(d: Record<string, unknown>, assignedVehicleId: string): DriverFormValues {
  const userDetails = (pick(d, ['user_details']) ?? {}) as Record<string, unknown>;
  return {
    first_name: str(pick(userDetails, ['first_name'])) || str(pick(d, ['name'])).split(' ')[0] || '',
    last_name: str(pick(userDetails, ['last_name'])),
    license_number: str(pick(d, ['license_number'])),
    license_state: str(pick(d, ['license_state'])) || 'GP',
    license_expiry: str(pick(d, ['license_expiry'])),
    hire_date: str(pick(d, ['hire_date'])),
    email: str(pick(userDetails, ['email'])),
    phone: str(pick(userDetails, ['phone'])),
    address: str(pick(userDetails, ['address'])),
    emergency_contact: str(pick(d, ['emergency_contact'])),
    medical_card_expiry: str(pick(d, ['medical_card_expiry'])),
    status: str(pick(d, ['status'])).toUpperCase() || 'ACTIVE',
    vehicle: assignedVehicleId,
  };
}

/**
 * Creates the linked user account, retrying the synthesized username on a
 * collision instead of letting the second same-named driver 400 with an
 * opaque toast. `createUser`'s thrown Error carries the raw DRF body on
 * `.data` (see `src/lib/api/client.ts`), so a `username` key there is the
 * reliable signal — not string-matching `.message`, whose wording isn't
 * guaranteed to mention the field name.
 */
async function createDriverUser(v: DriverFormValues) {
  const base = `${v.first_name.toLowerCase()}.${v.last_name.toLowerCase()}`.replace(/\s+/g, '');
  for (let attempt = 1; attempt <= 5; attempt++) {
    const username = attempt === 1 ? base : `${base}${attempt}`;
    const email = v.email?.trim() || `${username}@truckwys.com`;
    try {
      return await createUser({
        username,
        email,
        first_name: v.first_name.trim(),
        last_name: v.last_name.trim(),
        phone: v.phone?.trim() || undefined,
        address: v.address?.trim() || undefined,
        password: 'TruckWys2026!',
        role: 'DRIVER',
      });
    } catch (e) {
      const data = (e as { data?: unknown })?.data;
      const isUsernameClash = !!(data && typeof data === 'object' && 'username' in data);
      if (!isUsernameClash) throw e;
      if (attempt === 5) {
        throw new Error('A driver with this name already exists — add a middle initial');
      }
      // else loop again with the next numbered suffix
    }
  }
  // Unreachable — the loop above always returns or throws.
  throw new Error('Could not create driver');
}

type DAnchors = ReturnType<typeof useFieldAnchors<keyof DriverFormValues>>;

// Local Controller wrappers, same convention as AddVehicleScreen's
// VText/VSelect/VDate — kept per-screen rather than shared/generic, matching
// AddCustomerScreen's existing per-screen `Field` helper pattern.
function DText({
  control,
  name,
  anchors,
  warning,
  ...rest
}: {
  control: Control<DriverFormValues>;
  name: keyof DriverFormValues;
  anchors: DAnchors;
  warning?: string;
} & Omit<TextFieldProps, 'value' | 'onChangeText' | 'onBlur' | 'error' | 'warning'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState }) => (
        <View onLayout={anchors.registerY(name)}>
          <TextField
            ref={anchors.registerInput(name)}
            value={value ?? ''}
            onChangeText={onChange}
            onBlur={onBlur}
            error={fieldState.error?.message}
            warning={warning}
            {...rest}
          />
        </View>
      )}
    />
  );
}

function DSelect({
  control,
  name,
  anchors,
  warning,
  ...rest
}: {
  control: Control<DriverFormValues>;
  name: keyof DriverFormValues;
  anchors: DAnchors;
  warning?: string;
} & Omit<ComponentProps<typeof SelectField>, 'value' | 'onSelect' | 'error' | 'warning'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState }) => (
        <View onLayout={anchors.registerY(name)}>
          <SelectField
            value={value ?? ''}
            onSelect={onChange}
            error={fieldState.error?.message}
            warning={warning}
            {...rest}
          />
        </View>
      )}
    />
  );
}

function DDate({
  control,
  name,
  anchors,
  warning,
  ...rest
}: {
  control: Control<DriverFormValues>;
  name: keyof DriverFormValues;
  anchors: DAnchors;
  warning?: string;
} & Omit<ComponentProps<typeof DateField>, 'value' | 'onChange' | 'error' | 'warning'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState }) => (
        <View onLayout={anchors.registerY(name)}>
          <DateField
            value={value ?? ''}
            onChange={onChange}
            error={fieldState.error?.message}
            warning={warning}
            {...rest}
          />
        </View>
      )}
    />
  );
}

const resolver = zodResolver(driverSchema());

export function AddDriverScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const editing = editId != null;
  const qc = useQueryClient();
  const { data: full } = useDriver(editId ?? '', route.params?.preview, editing);
  const { data: vehicles } = useVehicles();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // The vehicle this driver is CURRENTLY assigned to, read off the vehicles
  // list rather than the driver record — Vehicle.driver is the only place
  // that link lives. Fixes the bug where the Assigned vehicle picker opened
  // blank on every edit and an existing assignment could be overwritten but
  // never cleared.
  const assignedVehicle = useMemo(
    () => (vehicles ?? []).find((v) => String(pick(v.raw, ['driver'])) === String(editId)),
    [vehicles, editId],
  );
  const assignedVehicleId = editing && assignedVehicle ? String(assignedVehicle.id) : '';

  const vehicleOptions = useMemo(
    () => [
      { label: '— No vehicle —', value: '' },
      ...(vehicles ?? []).map((v) => ({ label: `${v.name} · ${v.plate}`, value: String(v.id) })),
    ],
    [vehicles],
  );

  const { control, handleSubmit, reset, watch, formState } = useForm<DriverFormValues>({
    resolver,
    defaultValues: fromDriverRecord({}, ''),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const anchors = useFieldAnchors<keyof DriverFormValues>();
  const { shakeStyle, trigger: triggerShake } = useErrorShake();

  // Tracks what the form was hydrated with, so submit can diff the vehicle
  // picker against it (unchanged → no write; changed → assign the new
  // vehicle; cleared → unassign the old one). Updated alongside every reset.
  const [originalVehicleId, setOriginalVehicleId] = useState('');

  // Re-hydrates from `full`/`assignedVehicleId` every time either changes —
  // both the synchronous initialData pass and the real network response,
  // and again once the vehicles list itself loads — but only until the user
  // actually edits something (`reset()` clears isDirty, so this re-arms
  // after each hydration and stops for good once real typing happens).
  useEffect(() => {
    if (!editing || !full || formState.isDirty) return;
    reset(fromDriverRecord(full, assignedVehicleId));
    setOriginalVehicleId(assignedVehicleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, full, assignedVehicleId]);

  // Advisory-only — computed from watched values, never blocks a save.
  const licenseExpiryW = watch('license_expiry');
  const medicalExpiryW = watch('medical_card_expiry');
  const warnings = useMemo(
    () => driverWarnings({ license_expiry: licenseExpiryW, medical_card_expiry: medicalExpiryW }),
    [licenseExpiryW, medicalExpiryW],
  );

  useUnsavedChangesGuard({
    navigation,
    isDirty: () => formState.isDirty && !busy && !saved,
    title: 'Discard changes?',
    message: editing
      ? "Your edits to this driver haven't been saved."
      : "This driver hasn't been saved.",
    buttons: [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', dispatch: true },
    ],
  });

  const onValid = async (v: DriverFormValues) => {
    // Starts closing the keyboard the instant Save is tapped, rather than
    // leaving it up behind SaveSuccessOverlay.
    void dismissKeyboard();
    setBusy(true);
    const driverFields = {
      license_number: v.license_number.trim(),
      license_expiry: v.license_expiry,
      medical_card_expiry: v.medical_card_expiry || undefined,
      license_state: v.license_state,
      hire_date: v.hire_date || undefined,
      status: v.status,
      emergency_contact: v.emergency_contact || undefined,
    };
    try {
      if (editing) {
        await updateDriver(editId, driverFields);
        const userDetails = (pick(full ?? {}, ['user_details']) ?? {}) as Record<string, unknown>;
        const uid = pick(userDetails, ['id']);
        if (uid) {
          await updateUser(uid as string | number, {
            first_name: v.first_name.trim(),
            last_name: v.last_name.trim(),
            email: v.email?.trim() || undefined,
            phone: v.phone?.trim() || undefined,
            address: v.address?.trim() || undefined,
          });
        }
        if (v.vehicle !== originalVehicleId) {
          if (v.vehicle) await updateVehicle(v.vehicle, { driver: editId });
          else if (originalVehicleId) await updateVehicle(originalVehicleId, { driver: null });
        }
      } else {
        const user = await createDriverUser(v);
        const newDriver = await createDriver({ user: pick(user, ['id']), ...driverFields });
        const newId = pick(newDriver, ['id']);
        if (v.vehicle && newId) await updateVehicle(v.vehicle, { driver: newId });
      }
      // This screen also POST/PATCHes users/, which the old list never
      // invalidated — the Settings team list stayed stale.
      invalidateFor(qc, 'driver');
      toast.success(editing ? 'Driver updated' : 'Driver added');
      // Guarantee it's gone before the overlay shows — covers a fast/cached
      // response where the tap-time dismiss above hasn't finished yet.
      await dismissKeyboard();
      setSaved(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save driver');
    } finally {
      setBusy(false);
    }
  };

  const onInvalid = (errors: FieldErrors<DriverFormValues>) => {
    triggerShake();
    const first = DRIVER_FIELD_ORDER.find((n) => errors[n]);
    if (first) anchors.scrollToField(first);
  };

  return (
    <View className="flex-1">
      <SheetScreen
        eyebrow={editing ? 'Edit' : 'New driver'}
        title={editing ? 'Edit driver' : 'Add driver'}
        variant="modal"
        onBack={() => navigation.goBack()}
        scrollRef={anchors.scrollRef}
        footer={
          <Button
            label={editing ? 'Save changes' : 'Add driver'}
            loading={busy}
            onPress={handleSubmit(onValid, onInvalid)}
            fullWidth
          />
        }
      >
        <Animated.View className="gap-4" style={shakeStyle}>
          {/* Required first — licence number and expiry used to sit below email,
              phone, emergency contact and address, so the mandatory fields were
              buried under four optional ones. */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <DText
                control={control}
                name="first_name"
                anchors={anchors}
                label="First name"
                required
                placeholder="Jane"
                icon="user"
                autoCapitalize="words"
              />
            </View>
            <View className="flex-1">
              <DText
                control={control}
                name="last_name"
                anchors={anchors}
                label="Last name"
                required
                placeholder="Dlamini"
                autoCapitalize="words"
              />
            </View>
          </View>
          {/* Full width — a licence number is an alphanumeric ID, not a short
              value, so it doesn't fit a half-width box comfortably. Licence
              province lost its old partner here, so it now pairs with Status
              instead (moved up from the Optional section below — Status
              always has a valid default, so relocating it changes nothing
              about validation, only where it sits). */}
          <DText
            control={control}
            name="license_number"
            anchors={anchors}
            label="Licence number"
            required
            placeholder="e.g. 1234567890"
            icon="shield"
            autoCapitalize="characters"
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <DSelect
                control={control}
                name="license_state"
                anchors={anchors}
                label="Licence province"
                required
                options={PROVINCES}
              />
            </View>
            <View className="flex-1">
              <DSelect control={control} name="status" anchors={anchors} label="Status" options={STATUSES} />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <DDate
                control={control}
                name="license_expiry"
                anchors={anchors}
                label="Licence expiry"
                required
                warning={warnings.license_expiry}
                minimumDate={new Date()}
              />
            </View>
            <View className="flex-1">
              <DDate
                control={control}
                name="hire_date"
                anchors={anchors}
                label="Hire date"
                required
                maximumDate={new Date()}
              />
            </View>
          </View>

          <Label className="mt-1 text-muted">Optional</Label>
          <DText
            control={control}
            name="email"
            anchors={anchors}
            label="Email"
            placeholder="jane@company.co.za"
            icon="send"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {/* Phone and Emergency contact both go full width too — a formatted
              phone number and a compound "Name · phone" value are just as
              cramped at half-width as Licence number above. */}
          <DText
            control={control}
            name="phone"
            anchors={anchors}
            label="Phone"
            placeholder="+27 82 123 4567"
            icon="phone"
            keyboardType="phone-pad"
          />
          <DText
            control={control}
            name="emergency_contact"
            anchors={anchors}
            label="Emergency contact"
            placeholder="Name · phone"
          />
          <DText control={control} name="address" anchors={anchors} label="Address" placeholder="Street, city" />
          <DDate
            control={control}
            name="medical_card_expiry"
            anchors={anchors}
            label="Medical expiry"
            warning={warnings.medical_card_expiry}
            minimumDate={new Date()}
          />
          <DSelect
            control={control}
            name="vehicle"
            anchors={anchors}
            label="Assigned vehicle"
            icon="truck"
            options={vehicleOptions}
          />
        </Animated.View>
      </SheetScreen>

      <SaveSuccessOverlay
        visible={saved}
        title={editing ? 'Driver updated' : 'Driver added'}
        onDone={() => navigation.goBack()}
      />
    </View>
  );
}

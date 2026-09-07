import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
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
import { createVehicle, updateVehicle, useVehicle, useVehicleTypesList, useDrivers } from './api';
import {
  vehicleSchema,
  vehicleWarnings,
  VEHICLE_FIELD_ORDER,
  type VehicleFormValues,
} from './validation';
import { str, num, pick } from '@/lib/api/list';
import { parseNum } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { dismissKeyboard } from '@/lib/keyboard';
import { useErrorShake } from '@/hooks/useErrorShake';
import { useDemo } from '@/hooks/useDemo';
import { useFieldAnchors } from '@/hooks/useFieldAnchors';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
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

function fromRecord(r: Record<string, unknown>): VehicleFormValues {
  return {
    vin: str(pick(r, ['vin'])),
    make: str(pick(r, ['make'])),
    model: str(pick(r, ['model'])),
    year:
      pick(r, ['year']) != null ? String(num(pick(r, ['year']))) : String(new Date().getFullYear()),
    plate: str(pick(r, ['plate', 'registration'])),
    type: str(pick(r, ['vehicle_type_name', 'vehicle_type'])) || 'Rigid Truck',
    capacity: pick(r, ['capacity']) != null ? String(num(pick(r, ['capacity'])) / 1000) : '',
    mileage: pick(r, ['mileage']) != null ? String(num(pick(r, ['mileage']))) : '',
    status: str(pick(r, ['status'])).toUpperCase() || 'AVAILABLE',
    driver: pick(r, ['driver']) != null ? String(pick(r, ['driver'])) : '',
    registration_expiry: str(pick(r, ['registration_expiry'])),
    last_maintenance_date: str(pick(r, ['last_maintenance_date'])),
    service_interval_km:
      pick(r, ['service_interval_km']) != null ? String(num(pick(r, ['service_interval_km']))) : '',
    last_service_mileage:
      pick(r, ['last_service_mileage']) != null ? String(num(pick(r, ['last_service_mileage']))) : '',
  };
}

type VAnchors = ReturnType<typeof useFieldAnchors<keyof VehicleFormValues>>;

// Local Controller wrappers — same shape as AddCustomerScreen's `Field`
// helper, just three of them (text/select/date) since this form uses all
// three field kinds. Not shared with AddDriverScreen: each screen owns its
// own copy typed against its own Values shape, matching the codebase's
// existing per-screen `Field` convention rather than a generic cross-screen
// abstraction.
function VText({
  control,
  name,
  anchors,
  warning,
  ...rest
}: {
  control: Control<VehicleFormValues>;
  name: keyof VehicleFormValues;
  anchors: VAnchors;
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

function VSelect({
  control,
  name,
  anchors,
  warning,
  onSelectExtra,
  ...rest
}: {
  control: Control<VehicleFormValues>;
  name: keyof VehicleFormValues;
  anchors: VAnchors;
  warning?: string;
  /** Extra side-effect after the value commits — chooseType seeds Capacity. */
  onSelectExtra?: (value: string) => void;
} & Omit<ComponentProps<typeof SelectField>, 'value' | 'onSelect' | 'error' | 'warning'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState }) => (
        <View onLayout={anchors.registerY(name)}>
          <SelectField
            value={value ?? ''}
            onSelect={(v) => {
              onChange(v);
              onSelectExtra?.(v);
            }}
            error={fieldState.error?.message}
            warning={warning}
            {...rest}
          />
        </View>
      )}
    />
  );
}

function VDate({
  control,
  name,
  anchors,
  warning,
  ...rest
}: {
  control: Control<VehicleFormValues>;
  name: keyof VehicleFormValues;
  anchors: VAnchors;
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

export function AddVehicleScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const editing = editId != null;
  const qc = useQueryClient();
  const demo = useDemo();
  const { data: types } = useVehicleTypesList();
  const { data: drivers } = useDrivers();
  // Re-fetches on edit instead of trusting `preview` forever — the previous
  // version never refreshed, so any field VehicleDetailScreen didn't already
  // display (or that changed since the list was last fetched) saved back
  // over itself unseen.
  const { data: full } = useVehicle(editId ?? '', editing ? preview : undefined, editing);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const typeOptions = useMemo(() => {
    const names = (types ?? []).map((t) => t.name);
    return (names.length ? names : FALLBACK_TYPES).map((n) => ({ label: n, value: n }));
  }, [types]);
  const driverOptions = useMemo(
    () => [
      { label: '— No driver —', value: '' },
      ...(drivers ?? []).map((d) => ({ label: d.name, value: String(d.id) })),
    ],
    [drivers],
  );

  // Not shown any more: fuel type moved to the vehicle type, which is what
  // quotes price against. Vehicle.fuel_type is still required server-side, so
  // keep whatever the record already had and default new vehicles to Diesel.
  const fuelType = str(pick(full ?? preview, ['fuel_type'])) || 'Diesel';

  // Grandfathers a legacy VIN that isn't 17 chars — see validation.ts. Seeded
  // from `preview` (already the record VehicleDetailScreen is showing) and
  // refreshed once the network fetch lands, in case it differs.
  const [originalVin, setOriginalVin] = useState(() => str(pick(preview, ['vin'])));
  const resolver = useMemo(() => zodResolver(vehicleSchema({ originalVin })), [originalVin]);

  const { control, handleSubmit, reset, watch, setValue, getValues, formState } =
    useForm<VehicleFormValues>({
      resolver,
      defaultValues: fromRecord(preview),
      mode: 'onBlur',
      reValidateMode: 'onChange',
    });

  const anchors = useFieldAnchors<keyof VehicleFormValues>();
  const { shakeStyle, trigger: triggerShake } = useErrorShake();

  // Re-hydrates from `full` every time it changes (both the synchronous
  // initialData pass and the real network response) — but only until the
  // user actually edits something. That's what fixes the stale-preview bug
  // without clobbering someone mid-edit: `reset()` clears isDirty, so the
  // guard re-arms after each hydration and only ever blocks once real typing
  // has happened.
  useEffect(() => {
    if (!editing || !full || formState.isDirty) return;
    reset(fromRecord(full));
    const vin = str(pick(full, ['vin']));
    if (vin) setOriginalVin(vin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, full]);

  /**
   * Picking a vehicle type seeds Capacity from that type's own capacity.
   *
   * A starting point, not a lock — real vehicles of one type legitimately vary,
   * so the field stays editable and a later type change overwrites it again.
   * Both are in tons here; the payload converts to kg on the way out.
   */
  const chooseType = (name: string) => {
    const cap = (types ?? []).find((t) => t.name === name)?.capacity;
    if (cap != null) setValue('capacity', String(cap), { shouldValidate: true, shouldDirty: true });
  };

  // The form opens with a type already selected, before the list has loaded, so
  // that selection never went through chooseType. Fill once when the list
  // arrives — and only while Capacity is still blank, so it can't overwrite an
  // edited vehicle's real capacity or something the user just typed.
  const seededCapacity = useRef(false);
  useEffect(() => {
    if (seededCapacity.current || !types?.length) return;
    seededCapacity.current = true;
    if (getValues('capacity').trim()) return;
    const cap = types.find((t) => t.name === getValues('type'))?.capacity;
    if (cap != null) setValue('capacity', String(cap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types]);

  // Advisory-only — computed from watched values, never blocks a save.
  const regExpiryW = watch('registration_expiry');
  const mileageW = watch('mileage');
  const lastServiceW = watch('last_service_mileage');
  const warnings = useMemo(
    () =>
      vehicleWarnings({
        registration_expiry: regExpiryW,
        mileage: mileageW,
        last_service_mileage: lastServiceW,
      }),
    [regExpiryW, mileageW, lastServiceW],
  );

  useUnsavedChangesGuard({
    navigation,
    isDirty: () => formState.isDirty && !busy && !saved,
    title: 'Discard changes?',
    message: editing
      ? "Your edits to this vehicle haven't been saved."
      : "This vehicle hasn't been saved.",
    buttons: [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', dispatch: true },
    ],
  });

  const onValid = async (v: VehicleFormValues) => {
    // Vehicles are fixed seeded data in the demo company.
    if (demo.block()) return;
    // Starts closing the keyboard the instant Save is tapped, rather than
    // leaving it up behind SaveSuccessOverlay.
    void dismissKeyboard();
    setBusy(true);
    const typeId = (types ?? []).find((t) => t.name === v.type)?.id;
    const capacityTons = parseNum(v.capacity);
    const payload = {
      vin: v.vin.trim(),
      make: v.make.trim(),
      model: v.model.trim(),
      plate: v.plate.trim(),
      fuel_type: fuelType,
      status: v.status,
      registration_expiry: v.registration_expiry || undefined,
      last_maintenance_date: v.last_maintenance_date || undefined,
      year: parseNum(v.year) ?? undefined,
      capacity: capacityTons != null ? capacityTons * 1000 : undefined,
      mileage: v.mileage ? (parseNum(v.mileage) ?? undefined) : undefined,
      service_interval_km: v.service_interval_km ? parseNum(v.service_interval_km) : null,
      last_service_mileage: v.last_service_mileage ? parseNum(v.last_service_mileage) : null,
      driver: v.driver ? Number(v.driver) : null,
      ...(typeId ? { vehicle_type: typeId } : {}),
    };
    try {
      if (editing) await updateVehicle(editId, payload);
      else await createVehicle(payload);
      invalidateFor(qc, 'vehicle');
      toast.success(editing ? 'Vehicle updated' : 'Vehicle added');
      // Guarantee it's gone before the overlay shows — covers a fast/cached
      // response where the tap-time dismiss above hasn't finished yet.
      await dismissKeyboard();
      setSaved(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save vehicle');
    } finally {
      setBusy(false);
    }
  };

  const onInvalid = (errors: FieldErrors<VehicleFormValues>) => {
    triggerShake();
    const first = VEHICLE_FIELD_ORDER.find((n) => errors[n]);
    if (first) anchors.scrollToField(first);
  };

  return (
    <View className="flex-1">
      <SheetScreen
        eyebrow={editing ? 'Edit' : 'New vehicle'}
        title={editing ? 'Edit vehicle' : 'Add vehicle'}
        variant="modal"
        onBack={() => navigation.goBack()}
        scrollRef={anchors.scrollRef}
        footer={
          <Button
            label={editing ? 'Save changes' : 'Add vehicle'}
            loading={busy}
            onPress={handleSubmit(onValid, onInvalid)}
            fullWidth
          />
        }
      >
        <Animated.View className="gap-4" style={shakeStyle}>
          {/* Required first, so nothing mandatory is buried under a run of
              optional fields. Vehicle type sits above Capacity because picking a
              type seeds a starting capacity below it. */}
          <VText
            control={control}
            name="vin"
            anchors={anchors}
            label="VIN"
            required
            placeholder="17-character VIN"
            autoCapitalize="characters"
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <VText
                control={control}
                name="make"
                anchors={anchors}
                label="Make"
                required
                placeholder="e.g. Volvo"
              />
            </View>
            <View className="flex-1">
              <VText
                control={control}
                name="model"
                anchors={anchors}
                label="Model"
                required
                placeholder="e.g. FH16"
              />
            </View>
          </View>
          {/* Year and Vehicle type pair here instead of Year+Plate — both are
              short (a 4-digit number, a dropdown). Registration plate moves
              to its own full-width row below, since a plate number is just as
              cramped at half-width as VIN above. */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <VText
                control={control}
                name="year"
                anchors={anchors}
                label="Year"
                required
                placeholder="e.g. 2022"
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <VSelect
                control={control}
                name="type"
                anchors={anchors}
                label="Vehicle type"
                icon="box"
                required
                options={typeOptions}
                onSelectExtra={chooseType}
              />
            </View>
          </View>
          <VText
            control={control}
            name="plate"
            anchors={anchors}
            label="Registration plate"
            required
            placeholder="e.g. CA 123-456"
            icon="truck"
            autoCapitalize="characters"
          />
          <VText
            control={control}
            name="capacity"
            anchors={anchors}
            label="Capacity (tons)"
            required
            placeholder="e.g. 30"
            keyboardType="decimal-pad"
          />

          <Label className="mt-1 text-muted">Optional</Label>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <VText
                control={control}
                name="mileage"
                anchors={anchors}
                label="Mileage (km)"
                placeholder="e.g. 120 000"
                keyboardType="number-pad"
                numeric
              />
            </View>
            <View className="flex-1">
              <VSelect control={control} name="status" anchors={anchors} label="Status" options={STATUSES} />
            </View>
          </View>
          <VSelect
            control={control}
            name="driver"
            anchors={anchors}
            label="Assigned driver"
            icon="user"
            options={driverOptions}
          />

          <Label className="mt-1 text-muted">Service & compliance</Label>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <VDate
                control={control}
                name="registration_expiry"
                anchors={anchors}
                label="Registration expiry"
                warning={warnings.registration_expiry}
                minimumDate={new Date()}
              />
            </View>
            <View className="flex-1">
              <VDate
                control={control}
                name="last_maintenance_date"
                anchors={anchors}
                label="Last maintenance date"
                maximumDate={new Date()}
              />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <VText
                control={control}
                name="service_interval_km"
                anchors={anchors}
                label="Service interval (km)"
                placeholder="e.g. 15 000"
                keyboardType="number-pad"
                numeric
              />
            </View>
            <View className="flex-1">
              <VText
                control={control}
                name="last_service_mileage"
                anchors={anchors}
                label="Last service (km)"
                placeholder="e.g. 110 000"
                keyboardType="number-pad"
                numeric
                warning={warnings.last_service_mileage}
              />
            </View>
          </View>
        </Animated.View>
      </SheetScreen>

      <SaveSuccessOverlay
        visible={saved}
        title={editing ? 'Vehicle updated' : 'Vehicle added'}
        onDone={() => navigation.goBack()}
      />
    </View>
  );
}

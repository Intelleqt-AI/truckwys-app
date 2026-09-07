import { useState, type ComponentProps } from 'react';
import { Alert, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useForm, useWatch, Controller, type Control, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SheetScreen,
  TextField,
  SelectField,
  Button,
  Txt,
  Label,
  SaveSuccessOverlay,
  type TextFieldProps,
} from '@/components/ui';
import { createVehicleType, updateVehicleType, deleteVehicleType } from './api';
import {
  vehicleTypeSchema,
  VEHICLE_TYPE_FIELD_ORDER,
  type VehicleTypeFormValues,
} from './validation';
import { num, str, pick } from '@/lib/api/list';
import { parseNum } from '@/lib/formatters';
import { toast } from '@/lib/toast';
import { invalidateFor } from '@/lib/queryInvalidation';
import { dismissKeyboard } from '@/lib/keyboard';
import { useErrorShake } from '@/hooks/useErrorShake';
import { useFieldAnchors } from '@/hooks/useFieldAnchors';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useDemo } from '@/hooks/useDemo';
import { DEMO_UNAVAILABLE_MESSAGE } from '@/lib/demoStatus';
import type { AppStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'AddVehicleType'>;

const ACTIVE_OPTIONS = [
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
];
// Exactly the backend's VehicleType.FUEL_TYPE_CHOICES — Title-Case, and DRF
// enforces them, so anything else 400s. Which fuel a type burns is what decides
// the company default price a quote is costed against.
const FUEL_TYPE_OPTIONS = ['Diesel', 'Petrol', 'Electric', 'Hybrid'].map((f) => ({
  label: f,
  value: f,
}));

function fromRecord(r: Record<string, unknown>): VehicleTypeFormValues {
  return {
    name: str(pick(r, ['name'])),
    description: str(pick(r, ['description'])),
    capacity: pick(r, ['capacity']) != null ? String(num(pick(r, ['capacity']))) : '',
    base_rate: pick(r, ['base_rate']) != null ? String(num(pick(r, ['base_rate']))) : '',
    fuel_type: str(pick(r, ['fuel_type']), 'Diesel'),
    fuel_consumption_l_per_100km:
      pick(r, ['fuel_consumption_l_per_100km']) != null
        ? String(num(pick(r, ['fuel_consumption_l_per_100km'])))
        : '',
    fuel_consumption_sensitivity_pct:
      pick(r, ['fuel_consumption_sensitivity_pct']) != null
        ? String(num(pick(r, ['fuel_consumption_sensitivity_pct'])))
        : '',
    active: pick(r, ['active']) === false ? 'false' : 'true',
  };
}

type Anchors = ReturnType<typeof useFieldAnchors<keyof VehicleTypeFormValues>>;

// Local Controller wrappers — same shape as AddVehicleScreen's VText/VSelect,
// just typed against this screen's own values.
function VTText({
  control,
  name,
  anchors,
  ...rest
}: {
  control: Control<VehicleTypeFormValues>;
  name: keyof VehicleTypeFormValues;
  anchors: Anchors;
} & Omit<TextFieldProps, 'value' | 'onChangeText' | 'onBlur' | 'error'>) {
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
            {...rest}
          />
        </View>
      )}
    />
  );
}

function VTSelect({
  control,
  name,
  anchors,
  ...rest
}: {
  control: Control<VehicleTypeFormValues>;
  name: keyof VehicleTypeFormValues;
  anchors: Anchors;
} & Omit<ComponentProps<typeof SelectField>, 'value' | 'onSelect' | 'error'>) {
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
            {...rest}
          />
        </View>
      )}
    />
  );
}

// Isolated in its own component so only this line re-renders when fuel_type
// changes — not the rest of the Fuel section.
function FuelCostNote({ control }: { control: Control<VehicleTypeFormValues> }) {
  const fuelType = useWatch({ control, name: 'fuel_type' });
  return (
    <Txt className="-mt-1 text-caption text-faint">
      Quotes for this type are costed at your company&apos;s {(fuelType || 'diesel').toLowerCase()}{' '}
      price, scaled up or down from Fuel use as a quote&apos;s load moves away from Capacity.
    </Txt>
  );
}

export function AddVehicleTypeScreen({ route, navigation }: Props) {
  const editId = route.params?.id;
  const editing = editId != null;
  const preview = (route.params?.preview ?? {}) as Record<string, unknown>;
  const qc = useQueryClient();
  const demo = useDemo();

  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, setSaved] = useState(false);

  const { control, handleSubmit, getValues, formState } = useForm<VehicleTypeFormValues>({
    resolver: zodResolver(vehicleTypeSchema()),
    defaultValues: fromRecord(preview),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const anchors = useFieldAnchors<keyof VehicleTypeFormValues>();
  const { shakeStyle, trigger: triggerShake } = useErrorShake();

  useUnsavedChangesGuard({
    navigation,
    isDirty: () => formState.isDirty && !busy && !deleting && !saved,
    title: 'Discard changes?',
    message: editing
      ? "Your edits to this vehicle type haven't been saved."
      : "This vehicle type hasn't been saved.",
    buttons: [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', dispatch: true },
    ],
  });

  const onValid = async (v: VehicleTypeFormValues) => {
    if (demo.block(DEMO_UNAVAILABLE_MESSAGE)) return;
    // Starts closing the keyboard the instant Save is tapped, rather than
    // leaving it up behind SaveSuccessOverlay.
    void dismissKeyboard();
    setBusy(true);
    // capacity is in tons (web stores vehicle-type capacity as tons directly).
    const payload = {
      name: v.name.trim(),
      description: (v.description ?? '').trim(),
      capacity: parseNum(v.capacity) ?? 0,
      base_rate: parseNum(v.base_rate) ?? 0,
      fuel_type: v.fuel_type,
      // Left out when blank so the backend's own default (36 L/100km) stands
      // rather than being overwritten with a zero.
      ...(v.fuel_consumption_l_per_100km?.trim()
        ? { fuel_consumption_l_per_100km: parseNum(v.fuel_consumption_l_per_100km) ?? undefined }
        : {}),
      // Same reasoning — left out when blank so the backend's own 2% default
      // stands, rather than sending 0 (which would switch the fuel-weight
      // adjustment off entirely, unlike web which coerces a blank to 2).
      ...(v.fuel_consumption_sensitivity_pct?.trim()
        ? {
            fuel_consumption_sensitivity_pct:
              parseNum(v.fuel_consumption_sensitivity_pct) ?? undefined,
          }
        : {}),
      active: v.active === 'true',
    };
    try {
      if (editing) await updateVehicleType(editId, payload);
      else await createVehicleType(payload);
      invalidateFor(qc, 'vehicle-type');
      toast.success(editing ? 'Vehicle type updated' : 'Vehicle type added');
      // Guarantee it's gone before the overlay shows — covers a fast/cached
      // response where the tap-time dismiss above hasn't finished yet.
      await dismissKeyboard();
      setSaved(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save type');
    } finally {
      setBusy(false);
    }
  };

  const onInvalid = (errors: FieldErrors<VehicleTypeFormValues>) => {
    triggerShake();
    const first = VEHICLE_TYPE_FIELD_ORDER.find((n) => errors[n]);
    if (first) anchors.scrollToField(first);
  };

  const confirmDelete = () => {
    if (!editing) return;
    if (demo.block(DEMO_UNAVAILABLE_MESSAGE)) return;
    Alert.alert('Delete vehicle type', `Delete "${getValues('name').trim() || 'this type'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteVehicleType(editId);
            invalidateFor(qc, 'vehicle-type');
            toast.success('Vehicle type deleted');
            navigation.goBack();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not delete');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      <SheetScreen
        // eyebrow={editing ? 'Edit' : 'New vehicle type'}
        title={editing ? 'Edit vehicle type' : 'Add vehicle type'}
        variant="modal"
        onBack={() => navigation.goBack()}
        scrollRef={anchors.scrollRef}
        footer={
          <Button
            label={editing ? 'Save changes' : 'Add vehicle type'}
            loading={busy}
            onPress={handleSubmit(onValid, onInvalid)}
            fullWidth
          />
        }
      >
        <Animated.View className="gap-5" style={shakeStyle}>
          <View className="gap-3">
            <VTText
              control={control}
              name="name"
              anchors={anchors}
              label="Name"
              icon="truck"
              required
              placeholder="e.g. Superlink 30t"
            />
            <VTText
              control={control}
              name="description"
              anchors={anchors}
              label="Description"
              placeholder="Optional"
            />
          </View>

          <View className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <VTText
                  control={control}
                  name="capacity"
                  anchors={anchors}
                  label="Capacity (tons)"
                  placeholder="e.g. 30"
                  icon="box"
                  keyboardType="numeric"
                  numeric
                />
              </View>
              <View className="flex-1">
                <VTText
                  control={control}
                  name="base_rate"
                  anchors={anchors}
                  label="Base rate / km"
                  prefix="R"
                  placeholder="e.g. 25"
                  keyboardType="numeric"
                  numeric
                  decimals={2}
                />
              </View>
            </View>
          </View>

          <View className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <VTSelect
                  control={control}
                  name="fuel_type"
                  anchors={anchors}
                  label="Fuel type"
                  icon="dollar"
                  options={FUEL_TYPE_OPTIONS}
                />
              </View>
              <View className="flex-1">
                <VTText
                  control={control}
                  name="fuel_consumption_l_per_100km"
                  anchors={anchors}
                  label="Fuel use (L/100km)"
                  placeholder="e.g. 32"
                  keyboardType="numeric"
                  numeric
                />
              </View>
            </View>
            {/* How much fuel use climbs per tonne once a quote's load passes
            Capacity above — same field web calls "Fuel Sensitivity". Blank
            leaves the backend's own 2%/tonne default in place. */}
            <VTText
              control={control}
              name="fuel_consumption_sensitivity_pct"
              anchors={anchors}
              label="Fuel sensitivity (%/ton over capacity)"
              placeholder="e.g. 2"
              keyboardType="numeric"
              numeric
            />
            <FuelCostNote control={control} />
          </View>

          {editing && (
            <View className="gap-3">
              <Label className="text-muted">Status</Label>
              <VTSelect
                control={control}
                name="active"
                anchors={anchors}
                options={ACTIVE_OPTIONS}
              />
              <Button
                label="Delete vehicle type"
                variant="danger"
                icon="trash"
                loading={deleting}
                onPress={confirmDelete}
                fullWidth
              />
            </View>
          )}
        </Animated.View>
      </SheetScreen>

      <SaveSuccessOverlay
        visible={saved}
        title={editing ? 'Vehicle type updated' : 'Vehicle type added'}
        onDone={() => navigation.goBack()}
      />
    </View>
  );
}

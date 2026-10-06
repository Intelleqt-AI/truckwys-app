import { z } from 'zod';
import { parseNum, decimalMax } from '@/lib/formatters';

// Vehicle type's zod schema — brings AddVehicleTypeScreen onto the same
// react-hook-form + zodResolver pattern as `src/features/fleet/validation.ts`'s
// vehicleSchema, replacing the imperative `if (!x.trim()) return
// toast.error(...)` checks the screen used before. All numeric parsing goes
// through `parseNum`, never `Number()` — the latter is `NaN` for the
// comma-decimal input a South African keyboard produces.

const numericOptionalField = (label: string, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || parseNum(v) != null, `${label} must be a number`)
    .refine((v) => !v || (parseNum(v) ?? -1) >= 0, `${label} can't be negative`)
    .refine((v) => !v || (parseNum(v) ?? 0) <= max, `${label} is too large`);

// VehicleType.capacity / base_rate: DecimalField(max_digits=10,
// decimal_places=2). fuel_consumption_l_per_100km: (5,2), caps at 999.99.
// fuel_consumption_sensitivity_pct: (4,2), caps at 99.99.
const VT_MONEY_MAX = decimalMax(10, 2);
const FUEL_USE_MAX = decimalMax(5, 2);
const FUEL_SENSITIVITY_MAX = decimalMax(4, 2);

export function vehicleTypeSchema() {
  return z.object({
    name: z.string().trim().min(1, 'Name is required'),
    description: z.string().trim().optional(),
    // Web stores vehicle-type capacity as tons directly (unlike Vehicle.capacity,
    // which is kg) — see AddVehicleTypeScreen's payload comment.
    capacity: numericOptionalField('Capacity', VT_MONEY_MAX),
    base_rate: numericOptionalField('Base rate', VT_MONEY_MAX),
    // Exactly the backend's VehicleType.FUEL_TYPE_CHOICES — DRF 400s on
    // anything else, so this stays a plain required string rather than an enum
    // the form could drift out of sync with.
    fuel_type: z.string().trim().min(1, 'Fuel type is required'),
    fuel_consumption_l_per_100km: numericOptionalField('Fuel use', FUEL_USE_MAX),
    // Backend's DecimalField(max_digits=4, decimal_places=2) caps this at
    // 99.99 — 100+ would 400 on save.
    fuel_consumption_sensitivity_pct: numericOptionalField(
      'Fuel sensitivity',
      FUEL_SENSITIVITY_MAX,
    ),
    // 'true' | 'false' as a string, matching the SelectField options it drives.
    active: z.string(),
  });
}
export type VehicleTypeFormValues = z.infer<ReturnType<typeof vehicleTypeSchema>>;

// Delete-vs-reset copy for a vehicle type, shared between SettingsScreen's
// swipe-delete row and AddVehicleTypeScreen's edit-sheet button so the two
// can't drift apart. `isOverride` is a company-owned row that shadows a
// shared (company: null) default of the same name — see normalizeVehicleType
// in bookings/api.ts for what the two backend fields behind it mean.
export function vehicleTypeDeleteCopy(name: string, isOverride: boolean) {
  return isOverride
    ? {
        title: 'Reset vehicle type',
        message: `Reset "${name}" to TruckWys's current shared default? Your changes to it will be lost.`,
        confirmLabel: 'Reset',
        errorMessage: 'Could not reset',
      }
    : {
        title: 'Delete vehicle type',
        message: `Delete "${name}"?`,
        confirmLabel: 'Delete',
        errorMessage: 'Could not delete',
      };
}

// JSX order, not object-key order — onInvalid scrolls to whichever of these
// comes first that also has an error.
export const VEHICLE_TYPE_FIELD_ORDER: (keyof VehicleTypeFormValues)[] = [
  'name',
  'description',
  'capacity',
  'base_rate',
  'fuel_type',
  'fuel_consumption_l_per_100km',
  'fuel_consumption_sensitivity_pct',
  'active',
];

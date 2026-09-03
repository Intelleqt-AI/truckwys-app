import { z } from 'zod';
import { parseNum } from '@/lib/formatters';

// Vehicle type's zod schema — brings AddVehicleTypeScreen onto the same
// react-hook-form + zodResolver pattern as `src/features/fleet/validation.ts`'s
// vehicleSchema, replacing the imperative `if (!x.trim()) return
// toast.error(...)` checks the screen used before. All numeric parsing goes
// through `parseNum`, never `Number()` — the latter is `NaN` for the
// comma-decimal input a South African keyboard produces.

const numericOptionalField = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || parseNum(v) != null, `${label} must be a number`)
    .refine((v) => !v || (parseNum(v) ?? -1) >= 0, `${label} can't be negative`);

export function vehicleTypeSchema() {
  return z.object({
    name: z.string().trim().min(1, 'Name is required'),
    description: z.string().trim().optional(),
    // Web stores vehicle-type capacity as tons directly (unlike Vehicle.capacity,
    // which is kg) — see AddVehicleTypeScreen's payload comment.
    capacity: numericOptionalField('Capacity'),
    base_rate: numericOptionalField('Base rate'),
    // Exactly the backend's VehicleType.FUEL_TYPE_CHOICES — DRF 400s on
    // anything else, so this stays a plain required string rather than an enum
    // the form could drift out of sync with.
    fuel_type: z.string().trim().min(1, 'Fuel type is required'),
    fuel_consumption_l_per_100km: numericOptionalField('Fuel use'),
    // Backend's DecimalField(max_digits=4, decimal_places=2) caps this at
    // 99.99 — 100+ would 400 on save.
    fuel_consumption_sensitivity_pct: numericOptionalField('Fuel sensitivity').refine(
      (v) => !v || (parseNum(v) ?? 0) <= 99.99,
      "Fuel sensitivity can't be more than 99.99%",
    ),
    // 'true' | 'false' as a string, matching the SelectField options it drives.
    active: z.string(),
  });
}
export type VehicleTypeFormValues = z.infer<ReturnType<typeof vehicleTypeSchema>>;

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

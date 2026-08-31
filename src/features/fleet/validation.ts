import { z } from 'zod';
import { parseNum } from '@/lib/formatters';

// Fleet's zod schemas — the vehicle and driver forms are the only Fleet
// screens; both moved off imperative `submit()`-time checks
// (`if (!x.trim()) return toast.error(...)`) onto react-hook-form +
// zodResolver, following the pattern already in
// `src/features/customers/AddCustomerScreen.tsx`.
//
// Rules split into two channels:
//  - BLOCKING  → part of the zod schema below, surfaced via `fieldState.error`.
//  - ADVISORY  → computed separately from the watched values (the
//    `vehicleWarnings`/`driverWarnings` functions), surfaced via the new
//    `warning` prop on TextField/SelectField/DateField. These never stop a
//    save — real fleets carry expired licences and odd odometer data, and the
//    user still has to be able to save the rest of the record.
//
// All numeric parsing goes through `parseNum`, never `Number()` — the latter
// is `NaN` for the comma-decimal / grouped-thousands input a South African
// keyboard produces (see `src/lib/formatters.ts`).

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── Vehicle ──────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
// VIN standard excludes I, O, Q (too easily confused with 1, 0).
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

const numericOptionalField = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || parseNum(v) != null, `${label} must be a number`)
    .refine((v) => !v || (parseNum(v) ?? -1) >= 0, `${label} can't be negative`);

/**
 * `originalVin` grandfathers a legacy record: a vehicle saved before this
 * validation existed may have a VIN that isn't 17 chars. Editing every OTHER
 * field on that record must still work — only typing a NEW, invalid VIN over
 * it is blocked. Pass `undefined` for a new vehicle (nothing to grandfather).
 */
export function vehicleSchema({ originalVin }: { originalVin?: string } = {}) {
  return z.object({
    vin: z
      .string()
      .trim()
      .min(1, 'VIN is required')
      .superRefine((v, ctx) => {
        if (originalVin && v === originalVin) return;
        if (!VIN_RE.test(v)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be 17 characters (no I, O or Q)' });
        }
      }),
    make: z.string().trim().min(1, 'Make is required'),
    model: z.string().trim().min(1, 'Model is required'),
    year: z
      .string()
      .trim()
      .min(1, 'Year is required')
      .refine((v) => {
        const n = parseNum(v);
        return n != null && Number.isInteger(n);
      }, 'Enter a whole number')
      .refine((v) => {
        const n = parseNum(v) ?? 0;
        return n >= 1900 && n <= CURRENT_YEAR + 1;
      }, `Enter a year between 1900 and ${CURRENT_YEAR + 1}`),
    plate: z.string().trim().min(3, 'Registration plate is required').max(12, 'Too long for a plate'),
    type: z.string().trim().min(1, 'Vehicle type is required'),
    capacity: z
      .string()
      .trim()
      .min(1, 'Capacity is required')
      .refine((v) => parseNum(v) != null, 'Enter a number, e.g. 30')
      .refine((v) => (parseNum(v) ?? 0) > 0, 'Capacity must be more than 0')
      .refine((v) => (parseNum(v) ?? 0) <= 100, 'That looks too high — check the unit is tons'),
    mileage: numericOptionalField('Mileage'),
    status: z.string(),
    driver: z.string().optional(),
    registration_expiry: z.string().trim().optional(),
    last_maintenance_date: z.string().trim().optional(),
    service_interval_km: numericOptionalField('Service interval'),
    last_service_mileage: numericOptionalField('Last service'),
  });
}
export type VehicleFormValues = z.infer<ReturnType<typeof vehicleSchema>>;

// JSX order, not object-key order — onInvalid scrolls to whichever of these
// comes first that also has an error.
export const VEHICLE_FIELD_ORDER: (keyof VehicleFormValues)[] = [
  'vin',
  'make',
  'model',
  'year',
  'plate',
  'type',
  'capacity',
  'mileage',
  'status',
  'driver',
  'registration_expiry',
  'last_maintenance_date',
  'service_interval_km',
  'last_service_mileage',
];

export function vehicleWarnings(v: {
  registration_expiry?: string;
  mileage?: string;
  last_service_mileage?: string;
}): Partial<Record<'registration_expiry' | 'last_service_mileage', string>> {
  const warnings: Partial<Record<'registration_expiry' | 'last_service_mileage', string>> = {};
  if (v.registration_expiry && v.registration_expiry < todayISO()) {
    warnings.registration_expiry = 'Registration expired';
  }
  const mileage = parseNum(v.mileage);
  const lastService = parseNum(v.last_service_mileage);
  if (mileage != null && lastService != null && lastService > mileage) {
    warnings.last_service_mileage = 'Higher than current mileage';
  }
  return warnings;
}

// ── Driver ───────────────────────────────────────────────────────────────

const cleanPhone = (v: string) => v.replace(/[\s-]/g, '');
// +27821234567 or 0821234567 — 9 digits after the country code / leading 0.
const ZA_PHONE_RE = /^(\+27\d{9}|0\d{9})$/;

export function driverSchema() {
  return z.object({
    first_name: z.string().trim().min(1, 'First name is required'),
    last_name: z.string().trim().min(1, 'Last name is required'),
    license_number: z.string().trim().min(3, 'Licence number is required'),
    license_state: z.string().trim().min(1, 'Licence province is required'),
    license_expiry: z.string().trim().min(1, 'Licence expiry is required'),
    hire_date: z
      .string()
      .trim()
      .min(1, 'Hire date is required')
      .refine((v) => v <= todayISO(), "Hire date can't be in the future"),
    email: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || z.string().email().safeParse(v).success, 'Enter a valid email'),
    phone: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || ZA_PHONE_RE.test(cleanPhone(v)), 'Enter a valid phone, e.g. 082 123 4567'),
    address: z.string().trim().optional(),
    emergency_contact: z.string().trim().optional(),
    medical_card_expiry: z.string().trim().optional(),
    status: z.string(),
    vehicle: z.string().optional(),
  });
}
export type DriverFormValues = z.infer<ReturnType<typeof driverSchema>>;

export const DRIVER_FIELD_ORDER: (keyof DriverFormValues)[] = [
  'first_name',
  'last_name',
  'license_number',
  'license_state',
  'license_expiry',
  'hire_date',
  'email',
  'phone',
  'emergency_contact',
  'address',
  'medical_card_expiry',
  'status',
  'vehicle',
];

export function driverWarnings(v: {
  license_expiry?: string;
  medical_card_expiry?: string;
}): Partial<Record<'license_expiry' | 'medical_card_expiry', string>> {
  const warnings: Partial<Record<'license_expiry' | 'medical_card_expiry', string>> = {};
  const today = todayISO();
  if (v.license_expiry && v.license_expiry < today) warnings.license_expiry = 'Licence expired';
  if (v.medical_card_expiry && v.medical_card_expiry < today) {
    warnings.medical_card_expiry = 'Medical card expired';
  }
  return warnings;
}

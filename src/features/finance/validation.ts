import { z } from 'zod';
import { parseNum } from '@/lib/formatters';

// Finance's zod schemas — same convention as `src/features/fleet/validation.ts`:
// both the Add Expense and Create Invoice forms moved off imperative
// `submit()`-time checks (`if (!x.trim()) return toast.error(...)`) onto
// react-hook-form + zodResolver.
//
// Rules split into two channels:
//  - BLOCKING  → part of the zod schema below, surfaced via `fieldState.error`.
//  - ADVISORY  → computed separately from the watched values (`expenseWarnings`),
//    surfaced via the `warning` prop. These never stop a save.
//
// All numeric parsing goes through `parseNum`, never `Number()` — the latter is
// `NaN` for the comma-decimal / grouped-thousands input a South African
// keyboard produces (see `src/lib/formatters.ts`).

const todayISO = () => new Date().toISOString().slice(0, 10);

const numericOptionalField = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || parseNum(v) != null, `${label} must be a number`)
    .refine((v) => !v || (parseNum(v) ?? -1) >= 0, `${label} can't be negative`);

// ── Expense ──────────────────────────────────────────────────────────────

export function expenseSchema() {
  return z.object({
    category: z.string().trim().min(1, 'Category is required'),
    description: z.string().trim().min(1, 'Description is required'),
    amount: z
      .string()
      .trim()
      .min(1, 'Amount is required')
      .refine((v) => parseNum(v) != null, 'Enter a number, e.g. 1 250,00')
      .refine((v) => (parseNum(v) ?? 0) > 0, 'Must be more than 0'),
    date: z.string().trim().min(1, 'Date is required'),
    litres: numericOptionalField('Litres'),
    pricePerLitre: numericOptionalField('Price / litre'),
    vehicle: z.string().optional(),
    vendor: z.string().trim().optional(),
    receipt: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  });
}
export type ExpenseFormValues = z.infer<ReturnType<typeof expenseSchema>>;

// JSX order, not object-key order — onInvalid scrolls to whichever of these
// comes first that also has an error.
export const EXPENSE_FIELD_ORDER: (keyof ExpenseFormValues)[] = [
  'category',
  'description',
  'litres',
  'pricePerLitre',
  'amount',
  'date',
  'vehicle',
  'vendor',
  'receipt',
  'notes',
];

export function expenseWarnings(v: { date?: string }): Partial<Record<'date', string>> {
  const warnings: Partial<Record<'date', string>> = {};
  if (v.date && v.date > todayISO()) warnings.date = 'Date is in the future';
  return warnings;
}

// ── Invoice ──────────────────────────────────────────────────────────────

/**
 * `originalDueDate` grandfathers a DRAFT invoice that was created (and never
 * sent) with a due date that's since slipped into the past. Editing every
 * OTHER field on that invoice must still work — only setting a NEW past due
 * date is blocked. Pass `undefined` for a new invoice (nothing to grandfather).
 */
export function invoiceSchema({ originalDueDate }: { originalDueDate?: string } = {}) {
  return z.object({
    customer: z.string().trim().min(1, 'Customer is required'),
    subtotal: z
      .string()
      .trim()
      .min(1, 'Amount is required')
      .refine((v) => parseNum(v) != null, 'Enter a number, e.g. 12 500,00')
      .refine((v) => (parseNum(v) ?? 0) > 0, 'Enter an amount'),
    description: z.string().trim().optional(),
    due_date: z
      .string()
      .trim()
      .min(1, 'Due date is required')
      .superRefine((v, ctx) => {
        if (originalDueDate && v === originalDueDate) return;
        if (v < todayISO()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Due date can't be in the past" });
        }
      }),
    payment_terms: z.string(),
  });
}
export type InvoiceFormValues = z.infer<ReturnType<typeof invoiceSchema>>;

export const INVOICE_FIELD_ORDER: (keyof InvoiceFormValues)[] = [
  'customer',
  'subtotal',
  'due_date',
  'payment_terms',
  'description',
];

import { z } from 'zod';
import { parseNum, decimalMax } from '@/lib/formatters';
import { localDateISO } from '@/lib/dates';

// Invoice.total_amount is DecimalField(max_digits=10, decimal_places=2). The
// total is worked out by the server from the lines, so this is only the ceiling
// the screen checks the previewed total against.
const INVOICE_TOTAL_MAX = decimalMax(10, 2);
// Expense.amount is DecimalField(max_digits=10, decimal_places=2).
const EXPENSE_AMOUNT_MAX = decimalMax(10, 2);

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

const todayISO = () => localDateISO();

const numericOptionalField = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || parseNum(v) != null, `${label} must be a number`)
    .refine((v) => !v || (parseNum(v) ?? -1) >= 0, `${label} can't be negative`);

// ── Expense ──────────────────────────────────────────────────────────────

export function expenseSchema() {
  return z
    .object({
      category: z.string().trim().min(1, 'Category is required'),
      description: z.string().trim().min(1, 'Description is required'),
      // Gross: what was paid, VAT included.
      amount: z
        .string()
        .trim()
        .min(1, 'Amount is required')
        .refine((v) => parseNum(v) != null, 'Enter a number, e.g. 1 250,00')
        .refine((v) => (parseNum(v) ?? 0) > 0, 'Must be more than 0')
        .refine((v) => (parseNum(v) ?? 0) <= EXPENSE_AMOUNT_MAX, "That's too large an amount"),
      // The VAT inside `amount`; worked out from it unless the person types their own.
      tax_code: z.string().optional(),
      vat_amount: numericOptionalField('VAT'),
      date: z.string().trim().min(1, 'Date is required'),
      litres: numericOptionalField('Litres'),
      pricePerLitre: numericOptionalField('Price / litre'),
      vehicle: z.string().optional(),
      // The supplier's id; '' for none. `vendor` keeps the old free-text name of an
      // expense raised before suppliers existed, and is only sent back as it was.
      supplier: z.string().optional(),
      vendor: z.string().trim().optional(),
      receipt: z.string().trim().optional(),
      notes: z.string().trim().optional(),
    })
    .superRefine((v, ctx) => {
      const vat = parseNum(v.vat_amount ?? '');
      const amount = parseNum(v.amount);
      if (vat != null && amount != null && vat > amount) {
        ctx.addIssue({ code: 'custom', path: ['vat_amount'], message: "VAT can't be more than the amount" });
      }
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
  'tax_code',
  'vat_amount',
  'date',
  'vehicle',
  'supplier',
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
 * The invoice's header fields. The amounts are not here: they come from the
 * lines (lib/finance/lines), which the server turns into totals.
 *
 * A due date in the past is allowed (a back-dated invoice, or a draft that has
 * been sitting): the screen warns that it will go out already overdue. The only
 * hard rule is the server's, that it isn't before the issue date.
 */
export function invoiceSchema() {
  return z
    .object({
      customer: z.string().trim().min(1, 'Customer is required'),
      issue_date: z.string().trim().min(1, 'Issue date is required'),
      due_date: z.string().trim().min(1, 'Due date is required'),
      payment_terms: z.string(),
      description: z.string().trim().optional(),
      status: z.enum(['DRAFT', 'SENT']),
    })
    .superRefine((v, ctx) => {
      if (v.issue_date && v.due_date && v.due_date < v.issue_date) {
        ctx.addIssue({ code: 'custom', path: ['due_date'], message: "Due date can't be before the issue date" });
      }
    });
}
export type InvoiceFormValues = z.infer<ReturnType<typeof invoiceSchema>>;

export const INVOICE_FIELD_ORDER: (keyof InvoiceFormValues)[] = [
  'customer',
  'issue_date',
  'due_date',
  'payment_terms',
  'description',
];

/** Invoice.total_amount is DecimalField(max_digits=10, decimal_places=2). */
export const INVOICE_TOTAL_LIMIT = INVOICE_TOTAL_MAX;

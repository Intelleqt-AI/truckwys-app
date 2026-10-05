import { useQuery } from '@tanstack/react-query';
import { useInfiniteList } from '@/lib/api/useInfiniteList';
import { fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import { asArray } from '@/lib/api/list';
import type { RevenueBasis } from '@/lib/ledger';
import {
  normalizeInvoice,
  normalizeExpense,
  normalizeFinance,
  type InvoiceLite,
  type ExpenseLite,
  type FinanceSummary,
} from '@/types/domain';

/**
 * invoices/summary/ (core.services.invoice_list): the Invoices tab's tiles and
 * status-chip counts over every invoice of the company, so the tab loads one
 * page of rows plus this, not the whole ledger.
 */
export interface InvoicesSummary {
  month: string;
  invoiced_mtd: number;
  collected_mtd: number;
  collection_rate: number;
  invoiced_last_month: number;
  overdue_count: number;
  overdue_amount: number;
  paid_count: number;
  avg_days_to_pay: number | null;
  draft_count: number;
  draft_amount: number;
  /** All, OVERDUE, SENT, PAID, DRAFT. */
  status_counts: Record<string, number>;
}

/**
 * One server-filtered, newest-first list of invoices. `status` is a chip value
 * (OVERDUE is the shared overdue rule, not a stored status); `search` matches
 * the invoice number or customer. Keyed under 'invoices' so every invoice event
 * reaches it.
 */
export function useInvoicesList(status: string, search: string) {
  const params = new URLSearchParams();
  if (status !== 'ALL') params.set('status', status);
  if (search) params.set('search', search);
  const qs = params.toString();
  return useInfiniteList<InvoiceLite>(
    ['invoices', 'list', status, search],
    `invoices/${qs ? `?${qs}` : ''}`,
    normalizeInvoice,
    { pageSize: 20, keepPrevious: true },
  );
}

export function useInvoicesSummary() {
  return useQuery<InvoicesSummary>({
    queryKey: ['invoices', 'summary'],
    queryFn: () => fetchData<InvoicesSummary>('invoices/summary/'),
  });
}

/** expenses/summary/ (core.services.expense_list): tiles, charts and chip counts over every expense. */
export interface ExpensesSummary {
  spend_total: number;
  spend_count: number;
  approved_year_amount: number;
  approved_year_count: number;
  pending_amount: number;
  pending_count: number;
  /** Spend per calendar month by expense date (13 months); month is 1-12. */
  months: { year: number; month: number; amount: number; count: number }[];
  /** All-time spend by category, biggest first. */
  by_category: { category: string; amount: number; count: number }[];
  status_counts: Record<string, number>;
}

/** Expenses, newest first, status and search done by the server. */
export function useExpensesList(status: string, search: string) {
  const params = new URLSearchParams();
  if (status !== 'ALL') params.set('status', status);
  if (search) params.set('search', search);
  const qs = params.toString();
  return useInfiniteList<ExpenseLite>(
    ['expenses', 'list', status, search],
    `expenses/${qs ? `?${qs}` : ''}`,
    normalizeExpense,
    { pageSize: 20, keepPrevious: true },
  );
}

export function useExpensesSummary() {
  return useQuery<ExpensesSummary>({
    queryKey: ['expenses', 'summary'],
    queryFn: () => fetchData<ExpensesSummary>('expenses/summary/'),
  });
}

export function useInvoice(id: string | number, preview?: Record<string, unknown>, enabled = true) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['invoice', id],
    queryFn: () => fetchData(`invoices/${id}/`),
    // See bookings/api.ts useQuote — placeholderData, not initialData.
    placeholderData: preview,
    // `enabled` gated so CreateInvoiceScreen can call this unconditionally on
    // both create and edit without firing GET invoices// when there's no id.
    enabled: enabled && !!id,
  });
}

/** Single-record expense fetch — used by AddExpenseScreen's edit-mode refetch
 * so a stale `preview` can't clobber fresher data (same fix as fleet's
 * useVehicle/useDriver). */
export function useExpense(id: string | number, preview?: Record<string, unknown>, enabled = true) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['expense', id],
    queryFn: () => fetchData(`expenses/${id}/`),
    initialData: preview,
    enabled: enabled && !!id,
  });
}

export interface InvoicePayment {
  id: string;
  date: string;
  method: string;
  reference: string;
  amount: number;
  notes: string;
  /** Where it was recorded: MANUAL (here or on the web), XERO, QBO or BANK. Only MANUAL payments can be changed here. */
  source: string;
}

/** Payments recorded against one invoice — the web invoice page shows these. */
export function useInvoicePayments(id: string | number) {
  return useQuery<InvoicePayment[]>({
    queryKey: ['invoice-payments', id],
    queryFn: async () =>
      asArray(await fetchData(`payments/?invoice=${id}`)).map((p) => {
        const r = p as Record<string, unknown>;
        return {
          id: String(r.id ?? ''),
          date: String(r.payment_date ?? r.date ?? ''),
          method: String(r.payment_method ?? r.method ?? ''),
          reference: String(r.reference_number ?? r.reference ?? ''),
          amount: Number(r.amount ?? 0),
          notes: String(r.notes ?? ''),
          source: String(r.source ?? 'MANUAL'),
        };
      }),
  });
}

// Label for a Payment.PAYMENT_METHOD_CHOICES value.
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  EFT: 'EFT',
  CASH: 'Cash',
  CREDIT_CARD: 'Card',
  CHEQUE: 'Cheque',
  BANK_TRANSFER: 'Bank transfer',
  ACH: 'ACH',
  EARLY_PAY: 'Fast Pay advance',
};

export const paymentMethodLabel = (v: string) =>
  PAYMENT_METHOD_LABELS[v] ??
  (v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

// invoices/aging/: what customers still owe, by how late it is. Backend bucket
// keys (core/services/aging_service.py): current, 1-30, 31-60, 61-90, 90+.
export interface InvoiceAging {
  summary: {
    total_outstanding: number;
    total_invoice_count: number;
    customer_count: number;
    dso: number | null;
  };
  buckets: { bucket_name: string; invoice_count: number; total_amount: number }[];
}

export function useInvoiceAging() {
  return useQuery<InvoiceAging>({
    queryKey: ['invoice-aging'],
    queryFn: () => fetchData<InvoiceAging>('invoices/aging/'),
  });
}

export interface FinanceReports {
  summary: FinanceSummary;
  monthlyTrend: { label: string; revenue: number; expense: number }[];
}

// ── Mutations / actions ─────────────────────────────────────────────────────
export const createInvoice = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'invoices/', data });

export const updateInvoice = (id: string | number, data: Record<string, unknown>) =>
  patchData<Record<string, unknown>>({ url: `invoices/${id}/`, data });

export const generateInvoicePdf = (id: string | number) =>
  postData<Record<string, unknown>>({ url: `invoices/${id}/generate_pdf/`, data: {} });

export const sendInvoice = (id: string | number) =>
  postData({ url: `invoices/${id}/send_invoice/`, data: {} });

export const sendInvoiceReminder = (id: string | number) =>
  postData({ url: `invoices/${id}/send_reminder/`, data: {} });

export const markInvoicePaid = (id: string | number) =>
  postData({ url: `invoices/${id}/mark_paid/`, data: {} });

// The payment's reference is `reference_number` on the API; the app's sheet
// calls it `reference`, so send it under both names (as the web does).
export const recordPayment = (data: Record<string, unknown>) =>
  postData({
    url: 'payments/',
    data: data.reference != null && data.reference_number == null
      ? { ...data, reference_number: data.reference }
      : data,
  });

/**
 * Once Xero or QuickBooks manages an invoice's payments, TruckWys refuses to
 * record them itself: POST payments/ and mark_paid answer 409
 * `payments_managed_by_accounting` with the provider and a link to record it
 * there. Returns that detail, or null for any other error.
 */
export interface ManagedPayments {
  providerName: string;
  recordUrl: string | null;
}

export function paymentsManagedBy(e: unknown): ManagedPayments | null {
  const err = e as { status?: number; data?: Record<string, unknown> } | null;
  if (err?.status !== 409 || err.data?.code !== 'payments_managed_by_accounting') return null;
  const name = err.data.provider_name;
  const url = err.data.record_url;
  return {
    providerName: typeof name === 'string' && name ? name : 'your accounting system',
    recordUrl: typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null,
  };
}

// Expense category / status enums (authoritative — from the web create payload).
export const EXPENSE_CATEGORIES = [
  { label: 'Fuel', value: 'FUEL' },
  { label: 'Tolls', value: 'TOLLS' },
  { label: 'Maintenance', value: 'MAINTENANCE' },
  { label: 'Driver cost', value: 'DRIVER_COST' },
  { label: 'Subcontractor', value: 'SUBCONTRACTOR' },
  { label: 'Insurance', value: 'INSURANCE' },
  { label: 'Overhead', value: 'OVERHEAD' },
  { label: 'Other', value: 'OTHER' },
];
export const EXPENSE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
export const expenseCategoryLabel = (v: string) =>
  EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ??
  (v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase().replace(/_/g, ' ') : '—');

export const createExpense = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'expenses/', data });

export const updateExpense = (id: string | number, data: Record<string, unknown>) =>
  patchData<Record<string, unknown>>({ url: `expenses/${id}/`, data });

export const approveExpense = (id: string | number) =>
  postData({ url: `expenses/${id}/approve/`, data: {} });

export const rejectExpense = (id: string | number) =>
  postData({ url: `expenses/${id}/reject/`, data: {} });

export const deleteExpense = (id: string | number) => deleteData({ url: `expenses/${id}/` });

/**
 * dashboard/finance/: every revenue, expense and margin figure is excl. VAT.
 * `basis` is 'accrual' (issued invoices less credit notes, the server's default)
 * or 'cash' (money received); receivables stay incl. VAT. Expenses are every one
 * that isn't rejected, net of input VAT. The lane report has its own hook
 * (lanes.ts useLaneMargin).
 */
export function useFinanceReports(basis: RevenueBasis = 'accrual') {
  return useQuery<FinanceReports>({
    queryKey: ['finance-reports', basis],
    // The summary is the screen: when it fails that must show as an error, not
    // as a normalised-null set of R 0 totals.
    queryFn: async () => {
      const finance = await fetchData(`dashboard/finance/?basis=${basis}`);
      const f = finance as Record<string, unknown> | null;
      const trend = asArray((f ?? {}).monthly_trend).map((m) => {
        const r = m as Record<string, unknown>;
        return {
          label: String(r.month ?? r.label ?? ''),
          revenue: Number(r.revenue ?? 0),
          expense: Number(r.expense ?? r.expenses ?? 0),
        };
      });
      return { summary: normalizeFinance(f), monthlyTrend: trend };
    },
  });
}

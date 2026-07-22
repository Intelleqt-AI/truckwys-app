import { useQuery } from '@tanstack/react-query';
import { fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import { asArray } from '@/lib/api/list';
import {
  normalizeInvoice,
  normalizeExpense,
  normalizeFinance,
  type InvoiceLite,
  type ExpenseLite,
  type FinanceSummary,
} from '@/types/domain';

export function useInvoices() {
  return useQuery<InvoiceLite[]>({
    queryKey: ['invoices'],
    queryFn: async () => asArray(await fetchData('invoices/')).map(normalizeInvoice),
  });
}

export function useExpenses() {
  return useQuery<ExpenseLite[]>({
    queryKey: ['expenses'],
    queryFn: async () => asArray(await fetchData('expenses/')).map(normalizeExpense),
  });
}

export function useInvoice(id: string | number, preview?: Record<string, unknown>) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['invoice', id],
    queryFn: () => fetchData(`invoices/${id}/`),
    initialData: preview,
  });
}

export interface FinanceReports {
  summary: FinanceSummary;
  marginByLane: { lane: string; margin: number }[];
  monthlyTrend: { label: string; revenue: number; expense: number }[];
}

// ── Mutations / actions ─────────────────────────────────────────────────────
export const createInvoice = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'invoices/', data });

export const generateInvoicePdf = (id: string | number) =>
  postData<Record<string, unknown>>({ url: `invoices/${id}/generate_pdf/`, data: {} });

export const sendInvoice = (id: string | number) =>
  postData({ url: `invoices/${id}/send_invoice/`, data: {} });

export const sendInvoiceReminder = (id: string | number) =>
  postData({ url: `invoices/${id}/send_reminder/`, data: {} });

export const markInvoicePaid = (id: string | number) =>
  postData({ url: `invoices/${id}/mark_paid/`, data: {} });

export const recordPayment = (data: Record<string, unknown>) =>
  postData({ url: 'payments/', data });

// Expense category / status enums (authoritative — from the web create payload).
export const EXPENSE_CATEGORIES = [
  { label: 'Fuel', value: 'FUEL' },
  { label: 'Tolls', value: 'TOLLS' },
  { label: 'Maintenance', value: 'MAINTENANCE' },
  { label: 'Driver cost', value: 'DRIVER_COST' },
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

export function useFinanceReports() {
  return useQuery<FinanceReports>({
    queryKey: ['finance-reports'],
    queryFn: async () => {
      const [finance, lanes] = await Promise.all([
        fetchData('dashboard/finance/').catch(() => null),
        fetchData('reports/margin-by-lane/').catch(() => []),
      ]);
      const f = finance as Record<string, unknown> | null;
      const trend = asArray((f ?? {}).monthly_trend).map((m) => {
        const r = m as Record<string, unknown>;
        return {
          label: String(r.month ?? r.label ?? ''),
          revenue: Number(r.revenue ?? 0),
          expense: Number(r.expense ?? r.expenses ?? 0),
        };
      });
      const marginByLane = asArray(lanes).map((l) => {
        const r = l as Record<string, unknown>;
        return { lane: String(r.lane ?? r.route ?? '—'), margin: Number(r.margin ?? r.margin_percent ?? 0) };
      });
      return { summary: normalizeFinance(f), marginByLane, monthlyTrend: trend };
    },
  });
}

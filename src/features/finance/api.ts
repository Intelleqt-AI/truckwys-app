import { useQuery } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';
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

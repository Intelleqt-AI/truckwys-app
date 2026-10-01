import { useQuery } from '@tanstack/react-query';
import { fetchAllPages, type AllPages } from '@/lib/api/fetchAllPages';
import type { Customer, Expense, Invoice, Load, Payment, Quote, Vehicle } from '@/lib/ledger';

// Loads the ledgers in full (every page, up to 1 000 rows each), for screens
// that add things up on the device: Home's money tiles, the Insights findings.
// A figure computed from page 1 of a 20-row list is a wrong figure, so these are
// always whole lists. Each source has its own query key (`ledger-<name>`), which
// lib/queryInvalidation.ts refreshes when a `data.changed` push says that kind of
// record changed.

export type SourceName =
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'loads'
  | 'quotes'
  | 'customers'
  | 'vehicles';

const PATHS: Record<SourceName, string> = {
  invoices: 'invoices/',
  payments: 'payments/',
  expenses: 'expenses/',
  loads: 'loads/',
  quotes: 'quotes/',
  customers: 'customers/',
  vehicles: 'vehicles/',
};

const NOUN: Record<SourceName, string> = {
  invoices: 'invoices',
  payments: 'payments',
  expenses: 'expenses',
  loads: 'loads',
  quotes: 'quotes',
  customers: 'customers',
  vehicles: 'vehicles',
};

const STALE = 5 * 60_000;

function useSource<T>(name: SourceName, enabled: boolean) {
  return useQuery<AllPages<T>>({
    queryKey: [`ledger-${name}`],
    queryFn: () => fetchAllPages<T>(PATHS[name]),
    staleTime: STALE,
    retry: 2,
    retryDelay: (attempt) => 4000 * (attempt + 1),
    enabled,
  });
}

export interface Ledger {
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  loads: Load[];
  quotes: Quote[];
  customers: Customer[];
  vehicles: Vehicle[];
  /** "first 1000 of 1250 invoices" style notes when a list could not be loaded in full. */
  partial: string[];
  /** When the oldest of the lists in use was last refreshed (epoch ms). */
  loadedAt: number;
}

type Used = ReturnType<typeof useSource>;
/** Failing (even while still retrying) with nothing to show counts as an error. */
const loadFailed = (q: Used) => q.isError || (q.failureCount > 0 && !q.data);

/**
 * Loads the named ledgers. Never returns zeros for a failed request: `error` is
 * set and the caller shows a retry state instead of a figure.
 */
export function useLedger(need: SourceName[]) {
  const q = {
    invoices: useSource<Invoice>('invoices', need.includes('invoices')),
    payments: useSource<Payment>('payments', need.includes('payments')),
    expenses: useSource<Expense>('expenses', need.includes('expenses')),
    loads: useSource<Load>('loads', need.includes('loads')),
    quotes: useSource<Quote>('quotes', need.includes('quotes')),
    customers: useSource<Customer>('customers', need.includes('customers')),
    vehicles: useSource<Vehicle>('vehicles', need.includes('vehicles')),
  };
  const used = need.map((n) => q[n]);
  const error = used.some((x) => loadFailed(x));
  const loading = !error && used.some((x) => x.isLoading);
  const refetch = () => {
    used.forEach((x) => void x.refetch());
  };
  const retry = () => {
    used.forEach((x) => {
      if (loadFailed(x)) void x.refetch();
    });
  };
  if (loading || error || used.some((x) => !x.data)) {
    return { loading, error, retry, refetch, data: null as Ledger | null };
  }
  const partial = need
    .filter((n) => q[n].data && !q[n].data!.complete)
    .map((n) => `first ${q[n].data!.rows.length} of ${q[n].data!.count} ${NOUN[n]}`);
  const rows = <T,>(n: SourceName) => (q[n].data?.rows ?? []) as unknown as T[];
  const data: Ledger = {
    invoices: rows<Invoice>('invoices'),
    payments: rows<Payment>('payments'),
    expenses: rows<Expense>('expenses'),
    loads: rows<Load>('loads'),
    quotes: rows<Quote>('quotes'),
    customers: rows<Customer>('customers'),
    vehicles: rows<Vehicle>('vehicles'),
    partial,
    loadedAt: Math.min(...used.map((x) => x.dataUpdatedAt || Date.now())),
  };
  return { loading, error, retry, refetch, data };
}

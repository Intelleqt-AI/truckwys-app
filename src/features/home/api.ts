import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { focusManager, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';
import type { AllPages } from '@/lib/api/fetchAllPages';
import type { Customer, Expense, Invoice, Load, Payment, Quote, Vehicle } from '@/lib/ledger';
import { useLedger, type Ledger, type SourceName } from '@/lib/useLedger';
import { normalizeLoad, normalizeQuote } from '@/types/domain';
import { computeFunnel, computeHomeMoney, summariseFleet, summariseLoads } from './derive';
import { parseSignals, type HomeSignal } from './signals';

// Home's data. Money, loads, quotes and vehicles are the full ledgers
// (lib/useLedger.ts), the same lists and rules the Insights and Bookings screens
// use, so Home agrees with them. `dashboard/finance/` is no longer read: it
// missed paid invoices, so its revenue disagreed with the payments ledger.
//
// Each section reads only the lists it needs and fails on its own: a failure is
// an error with a Retry, never a zero. A failed background refresh keeps the
// last good figures on screen (see useHomeLedger) and the stale-data notice says so.

// ── Ledgers ─────────────────────────────────────────────────────────────────
type HomeLedger = ReturnType<typeof useLedger> & {
  /** The latest refresh failed; `data` is the last good load. */
  refreshFailed: boolean;
};

/**
 * `useLedger`, except that a failed background refresh does not throw away the
 * figures already loaded: lib/useLedger.ts reports any errored list as an error
 * with no data, so a dropped connection would turn good numbers into "Couldn't
 * load". Here the last good rows (still in the query cache) stay on screen and
 * `refreshFailed` is set; only a load with nothing to show is an error.
 */
function useHomeLedger(need: SourceName[]): HomeLedger {
  const qc = useQueryClient();
  const ledger = useLedger(need);
  if (ledger.data || !ledger.error) return { ...ledger, refreshFailed: false };

  const pages = need.map((n) => qc.getQueryData<AllPages<unknown>>([`ledger-${n}`]));
  if (need.length === 0 || pages.some((p) => !p)) return { ...ledger, refreshFailed: false };

  const rows = <T,>(n: SourceName) => (qc.getQueryData<AllPages<T>>([`ledger-${n}`])?.rows ?? []) as T[];
  const partial = need.flatMap((n, i) => {
    const p = pages[i];
    return p && !p.complete ? [`first ${p.rows.length} of ${p.count} ${n}`] : [];
  });
  const data: Ledger = {
    invoices: rows<Invoice>('invoices'),
    payments: rows<Payment>('payments'),
    expenses: rows<Expense>('expenses'),
    loads: rows<Load>('loads'),
    quotes: rows<Quote>('quotes'),
    customers: rows<Customer>('customers'),
    vehicles: rows<Vehicle>('vehicles'),
    partial,
    loadedAt: Math.min(...need.map((n) => qc.getQueryState([`ledger-${n}`])?.dataUpdatedAt || Date.now())),
  };
  return { ...ledger, data, error: false, refreshFailed: true };
}

/** Owed to you, revenue received, net margin and the monthly chart: invoices, payments and expenses. */
export function useHomeMoney() {
  const l = useHomeLedger(['invoices', 'payments', 'expenses']);
  const invoices = l.data?.invoices;
  const payments = l.data?.payments;
  const expenses = l.data?.expenses;
  const money = useMemo(
    () => (invoices && payments && expenses ? computeHomeMoney({ invoices, payments, expenses }) : null),
    [invoices, payments, expenses],
  );
  return { ...l, money, partial: l.data?.partial ?? [] };
}

/** Active loads (open and not left open), the 28-day grid, and the latest bookings. */
export function useHomeLoads() {
  const l = useHomeLedger(['loads']);
  const loads = l.data?.loads;
  const summary = useMemo(() => (loads ? summariseLoads(loads) : null), [loads]);
  const recent = useMemo(
    () => (loads ? loads.slice(0, 4).map((x) => normalizeLoad(x as unknown as Record<string, unknown>)) : []),
    [loads],
  );
  return { ...l, loads: loads ?? null, summary, recent };
}

/** The quote funnel and latest quotes. Needs the loads too: stale in-transit loads are not "on the road". */
export function useHomeQuotes() {
  const l = useHomeLedger(['quotes', 'loads']);
  const quotes = l.data?.quotes;
  const loads = l.data?.loads;
  const funnel = useMemo(() => (quotes && loads ? computeFunnel(quotes, loads) : null), [quotes, loads]);
  const recent = useMemo(
    () => (quotes ? quotes.slice(0, 4).map((q) => normalizeQuote(q as unknown as Record<string, unknown>)) : []),
    [quotes],
  );
  return { ...l, funnel, recent, total: quotes?.length ?? 0 };
}

/** Fleet ready and the idle-trucks row: every vehicle, and every load for who is on a job. */
export function useHomeFleet() {
  const l = useHomeLedger(['vehicles', 'loads']);
  const vehicles = l.data?.vehicles;
  const summary = useMemo(() => (vehicles ? summariseFleet(vehicles) : null), [vehicles]);
  return { ...l, vehicles: vehicles ?? null, summary };
}

// ── Signals ─────────────────────────────────────────────────────────────────
/**
 * The backend's attention signals. `dashboard/signals/` first, the older
 * `dashboard/insights/` as a fallback (as features/more/api.ts#useInsights does).
 * If both fail the error is thrown, so the block says "Couldn't load" instead of
 * "Nothing needs you right now". Keyed under 'overview' so every event that
 * refreshes Home refreshes this too (lib/queryInvalidation.ts).
 */
export function useHomeSignals() {
  return useQuery<HomeSignal[]>({
    queryKey: ['overview', 'signals'],
    queryFn: async () => {
      const raw = await fetchData('dashboard/signals/').catch(() => fetchData('dashboard/insights/'));
      return parseSignals(raw);
    },
  });
}

// ── Freshness and refresh ───────────────────────────────────────────────────
const HOME_KEYS: QueryKey[] = [
  ['ledger-invoices'],
  ['ledger-payments'],
  ['ledger-expenses'],
  ['ledger-loads'],
  ['ledger-quotes'],
  ['ledger-vehicles'],
  ['overview', 'signals'],
];

/**
 * How current the figures on screen are: the OLDEST load across everything Home
 * shows, whether a background refresh failed while older figures stay up, and
 * whether anything is being fetched. Feeds the stale-data notice.
 */
export function useHomeFreshness() {
  const qc = useQueryClient();
  const subscribe = useCallback((cb: () => void) => qc.getQueryCache().subscribe(cb), [qc]);
  // A string, so the snapshot is stable between unrelated cache events.
  const snapshot = useSyncExternalStore(subscribe, () => {
    let oldest = Infinity;
    let failed = false;
    let fetching = false;
    for (const key of HOME_KEYS) {
      const st = qc.getQueryState(key);
      if (!st) continue;
      if (st.dataUpdatedAt) oldest = Math.min(oldest, st.dataUpdatedAt);
      if (st.status === 'error' && st.dataUpdatedAt > 0) failed = true;
      if (st.fetchStatus === 'fetching') fetching = true;
    }
    return `${Number.isFinite(oldest) ? oldest : 0}|${failed ? 1 : 0}|${fetching ? 1 : 0}`;
  });
  const [updatedAt, failed, fetching] = snapshot.split('|');
  return { updatedAt: Number(updatedAt), refreshFailed: failed === '1', fetching: fetching === '1' };
}

/** How long Home's figures count as current; matches the ledgers' staleTime. */
export const STALE_MS = 5 * 60_000;

/**
 * Keeps Home's figures current on their own: when the oldest one turns stale
 * while Home is on screen, and when the user returns to Home with stale figures.
 * Only stale, mounted queries refetch, quietly (no spinner). Without this nothing
 * fires when staleTime runs out, so the "may be out of date" notice showed and the
 * user had to tap "Refresh now".
 */
export function useAutoRefreshHome(updatedAt: number) {
  const qc = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      const refresh = () => {
        if (!focusManager.isFocused()) return;
        HOME_KEYS.forEach((queryKey) => void qc.refetchQueries({ queryKey, type: 'active', stale: true }));
      };
      if (!updatedAt) return;
      const wait = updatedAt + STALE_MS - Date.now();
      if (wait <= 0) {
        refresh();
        return;
      }
      const id = setTimeout(refresh, wait + 500);
      return () => clearTimeout(id);
    }, [qc, updatedAt]),
  );
}

/** Refetches every query Home shows, once each (pull-to-refresh and "Refresh now"). */
export function useRefreshHome() {
  const qc = useQueryClient();
  return useCallback(
    () => Promise.all(HOME_KEYS.map((queryKey) => qc.refetchQueries({ queryKey, type: 'active' }))),
    [qc],
  );
}

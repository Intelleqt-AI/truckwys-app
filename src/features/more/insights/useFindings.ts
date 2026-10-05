import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';
import { useLedger } from '@/lib/useLedger';
import {
  computeFindings,
  summarise,
  type CashflowForecast,
  type Finding,
  type FindingInputs,
  type FindingsSummary,
} from './findings';

// Loads everything the findings feed needs: the invoice, payment, expense, load
// and quote ledgers in full (lib/useLedger.ts) and three small sources (company
// profile, live diesel, weekly cash forecast). The query keys for the three
// small ones are the app's existing ones, so they are shared with Quotes.
//
// The invoices are the feed: if they fail to load it is an error with a retry,
// never zeros. Every other source only switches off the findings that need it,
// and says so in `notes` (as the web does), so one slow list does not blank a
// feed that could still tell the owner who has not paid.

const STALE = 5 * 60_000;
const LEDGER_KEYS = ['invoices', 'payments', 'expenses', 'loads', 'quotes'] as const;

export interface FindingsResult {
  findings: Finding[];
  summary: FindingsSummary;
  /** Records exist, so an empty feed means "nothing needs you", not "no data yet". */
  hasRecords: boolean;
}

export interface UseFindings {
  loading: boolean;
  /** The invoices failed to load: show "Couldn't load" and `retry`. */
  error: boolean;
  retry: () => void;
  /** Refetches everything; resolves when done (for pull to refresh). */
  refetch: () => Promise<unknown>;
  result: FindingsResult | null;
  /** Sources that could not be checked right now, as sentences. */
  notes: string[];
}

export function useFindings(): UseFindings {
  const queryClient = useQueryClient();
  // Separate calls, so each source can fail on its own. They share the app's
  // `ledger-<name>` queries, so nothing is fetched twice.
  const invoices = useLedger(['invoices']);
  const costs = useLedger(['payments', 'expenses']);
  const loads = useLedger(['loads']);
  const quotes = useLedger(['quotes']);

  const company = useQuery<Record<string, unknown>>({
    queryKey: ['company-profile'],
    queryFn: () => fetchData('company/profile/'),
    staleTime: STALE,
    retry: 1,
  });
  const fuel = useQuery<Record<string, unknown>>({
    queryKey: ['fuel-prices'],
    queryFn: () => fetchData('fuel-prices/current/'),
    staleTime: STALE,
    retry: 1,
  });
  // A failed forecast is HTTP 503 with no summary: it lands in isError, and the
  // shortfall finding is skipped rather than guessed.
  const cashflow = useQuery<CashflowForecast>({
    queryKey: ['dashboard-cashflow'],
    queryFn: () => fetchData('dashboard/cashflow/') as Promise<CashflowForecast>,
    staleTime: STALE,
    retry: false,
  });

  const loading =
    invoices.loading ||
    (!invoices.error && (costs.loading || loads.loading || quotes.loading)) ||
    company.isLoading ||
    fuel.isLoading ||
    cashflow.isLoading;
  const inv = invoices.data;
  const costsData = costs.data;
  const loadsData = loads.data;
  const quotesData = quotes.data;
  const companyData = company.data;
  const fuelData = fuel.data;
  const cashData = cashflow.data;

  const result = useMemo<FindingsResult | null>(() => {
    if (!inv) return null;
    const now = new Date();
    const input: FindingInputs = {
      invoices: inv.invoices,
      // Margin needs payments and expenses together; without both the "costs
      // waiting for approval" finding would quote a margin built from half the
      // books, so it is switched off (empty expenses) rather than shown wrong.
      payments: costsData?.payments ?? [],
      expenses: costsData?.expenses ?? [],
      loads: loadsData?.loads ?? [],
      quotes: quotesData?.quotes ?? [],
      partial: [
        ...inv.partial,
        ...(costsData?.partial ?? []),
        ...(loadsData?.partial ?? []),
        ...(quotesData?.partial ?? []),
      ],
      fuel: fuelData ?? null,
      company: companyData ?? null,
      cashflow: cashData ?? null,
    };
    const findings = computeFindings(input, now);
    return {
      findings,
      summary: summarise(findings, input, now),
      hasRecords:
        inv.invoices.length + input.loads.length + input.expenses.length > 0,
    };
  }, [inv, costsData, loadsData, quotesData, fuelData, companyData, cashData]);

  const notes: string[] = [];
  const partial = result
    ? [
        ...(inv?.partial ?? []),
        ...(costsData?.partial ?? []),
        ...(loadsData?.partial ?? []),
        ...(quotesData?.partial ?? []),
      ]
    : [];
  if (partial.length) notes.push(`Based on the ${partial.join(', ')}.`);
  const unavailable = [
    costs.error ? 'costs' : null,
    loads.error ? 'loads' : null,
    quotes.error || fuel.isError ? 'quotes' : null,
    cashflow.isError ? 'the cash forecast' : null,
  ].filter((x): x is string => x !== null);
  if (unavailable.length) {
    notes.push(`Couldn't check ${unavailable.join(' or ')} right now, so those findings may be missing.`);
  }

  const refetch = useCallback(async () => {
    await Promise.all([
      ...LEDGER_KEYS.map((k) => queryClient.refetchQueries({ queryKey: [`ledger-${k}`] })),
      company.refetch(),
      fuel.refetch(),
      cashflow.refetch(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  const retry = useCallback(() => {
    invoices.retry();
    costs.retry();
    loads.retry();
    quotes.retry();
    if (fuel.isError) void fuel.refetch();
    if (company.isError) void company.refetch();
    if (cashflow.isError) void cashflow.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices.retry, costs.retry, loads.retry, quotes.retry, fuel.isError, company.isError, cashflow.isError]);

  return { loading, error: invoices.error, retry, refetch, result, notes };
}

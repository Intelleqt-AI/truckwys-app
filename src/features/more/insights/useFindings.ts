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
// small ones are the app's existing ones, so they are shared with Quotes and
// the Cash flow tab.
//
// A failed ledger is an error with a retry, never zeros. A failed small source
// only switches off the finding that needs it, and says so in `notes`.

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
  /** A ledger failed to load: show "Couldn't load" and `retry`. */
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
  const ledger = useLedger([...LEDGER_KEYS]);

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

  const loading = ledger.loading || company.isLoading || fuel.isLoading || cashflow.isLoading;
  const data = ledger.data;
  const companyData = company.data;
  const fuelData = fuel.data;
  const cashData = cashflow.data;

  const result = useMemo<FindingsResult | null>(() => {
    if (!data) return null;
    const now = new Date();
    const input: FindingInputs = {
      invoices: data.invoices,
      payments: data.payments,
      expenses: data.expenses,
      loads: data.loads,
      quotes: data.quotes,
      partial: data.partial,
      fuel: fuelData ?? null,
      company: companyData ?? null,
      cashflow: cashData ?? null,
    };
    const findings = computeFindings(input, now);
    return {
      findings,
      summary: summarise(findings, input, now),
      hasRecords: data.invoices.length + data.loads.length + data.expenses.length > 0,
    };
  }, [data, fuelData, companyData, cashData]);

  const notes: string[] = [];
  if (data && data.partial.length) notes.push(`Based on the ${data.partial.join(', ')}.`);
  const unavailable = [
    fuel.isError ? 'diesel prices' : null,
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
    ledger.retry();
    if (fuel.isError) void fuel.refetch();
    if (company.isError) void company.refetch();
    if (cashflow.isError) void cashflow.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger.retry, fuel.isError, company.isError, cashflow.isError]);

  return { loading, error: ledger.error, retry, refetch, result, notes };
}

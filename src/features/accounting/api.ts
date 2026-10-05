import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetchData, postData, putData } from '@/lib/api/client';
import {
  providerConfig,
  type Backfill,
  type Connection,
  type ContactConfirmBody,
  type ContactKind,
  type ContactMatch,
  type ContactSummary,
  type ContactsResponse,
  type LinkError,
  type Mapping,
  type MappingUpdate,
  type ProviderContact,
  type ProvidersResponse,
  type ProviderSlug,
  type Reconciliation,
  type SyncStatus,
} from './types';

// Accounting integrations calls and hooks. Port of the web's lib/accounting.ts.
// Errors arrive as {error, code}; lib/api/client lifts `error` into
// Error.message and keeps the body on `err.data`.

const BASE = 'integrations/accounting/';

export const ACCT_URL = {
  providers: `${BASE}providers/`,
  connect: (slug: ProviderSlug) => `${BASE}${slug}/connect/`,
  connection: `${BASE}connection/`,
  selectOrg: `${BASE}connection/select-org/`,
  disconnect: `${BASE}connection/disconnect/`,
  mapping: `${BASE}connection/mapping/`,
  refreshOptions: `${BASE}connection/refresh-options/`,
  contacts: `${BASE}connection/contacts/`,
  runMatching: `${BASE}connection/contacts/run-matching/`,
  confirmContact: (id: number) => `${BASE}connection/contacts/${id}/confirm/`,
  searchContacts: `${BASE}connection/contacts/search/`,
  backfill: `${BASE}connection/backfill/`,
  sync: `${BASE}connection/sync/`,
  retry: (linkId: number) => `${BASE}connection/sync/${linkId}/retry/`,
  syncNow: `${BASE}connection/sync-now/`,
  reconciliation: `${BASE}connection/reconciliation/`,
  runReconciliation: `${BASE}connection/reconciliation/run/`,
} as const;

export const ACCT_KEYS = {
  all: ['accounting'] as const,
  providers: ['accounting', 'providers'] as const,
  connection: ['accounting', 'connection'] as const,
  mapping: ['accounting', 'mapping'] as const,
  contacts: (status: string, kind: string) => ['accounting', 'contacts', status, kind] as const,
  contactsAll: ['accounting', 'contacts'] as const,
  backfill: ['accounting', 'backfill'] as const,
  sync: ['accounting', 'sync'] as const,
  reconciliation: ['accounting', 'reconciliation'] as const,
};

export const accountingApi = {
  connect: (slug: ProviderSlug) => postData<{ auth_url: string }>({ url: ACCT_URL.connect(slug), data: {} }),
  selectOrg: (tenantId: string) =>
    postData<Connection>({ url: ACCT_URL.selectOrg, data: { tenant_id: tenantId } }),
  disconnect: () => postData<{ disconnected: boolean }>({ url: ACCT_URL.disconnect, data: {} }),
  saveMapping: (data: MappingUpdate) => putData<Mapping>({ url: ACCT_URL.mapping, data }),
  refreshOptions: () => postData<Mapping>({ url: ACCT_URL.refreshOptions, data: {} }),
  runMatching: () => postData<{ summary: ContactSummary }>({ url: ACCT_URL.runMatching, data: {} }),
  confirmContact: (id: number, body: ContactConfirmBody) =>
    postData<ContactMatch>({ url: ACCT_URL.confirmContact(id), data: body }),
  /** `kind` keeps QuickBooks' separate customer and vendor lists apart. */
  searchContacts: (q: string, kind?: ContactKind) =>
    fetchData<{ results: ProviderContact[] }>(
      `${ACCT_URL.searchContacts}?q=${encodeURIComponent(q)}${kind ? `&kind=${kind}` : ''}`,
    ),
  startBackfill: (cutoverDate: string) =>
    postData<Backfill>({ url: ACCT_URL.backfill, data: { cutover_date: cutoverDate } }),
  retry: (linkId: number) => postData<LinkError>({ url: ACCT_URL.retry(linkId), data: {} }),
  syncNow: () => postData<{ queued: boolean }>({ url: ACCT_URL.syncNow, data: {} }),
  runReconciliation: () => postData<Reconciliation>({ url: ACCT_URL.runReconciliation, data: {} }),
};

// ---------------------------------------------------------------- hooks

/** Providers + the current connection (the provider cards). */
export function useAccountingProviders() {
  return useQuery<ProvidersResponse>({
    queryKey: ACCT_KEYS.providers,
    queryFn: () => fetchData<ProvidersResponse>(ACCT_URL.providers),
    staleTime: 30_000,
    retry: 1,
  });
}

/**
 * The company's accounting connection, or null. Fetched once and shared by
 * every screen that needs to know whether payments are managed in the
 * accounting system (invoice detail, Settings).
 */
export function useAccountingConnection(opts: { enabled?: boolean } = {}) {
  return useQuery<Connection | null>({
    queryKey: ACCT_KEYS.connection,
    queryFn: async () => (await fetchData<Connection | null>(ACCT_URL.connection)) ?? null,
    staleTime: 5 * 60_000,
    retry: 1,
    enabled: opts.enabled !== false,
  });
}

/**
 * Whether TruckWys may record payments on an invoice, and who does it
 * otherwise. The backend decides by date every time (core/accounting/guards.py):
 * an invoice issued before the cut-over date isn't part of the integration, so
 * its payments stay managed here.
 */
export function usePaymentsManaged(invoice?: { issue_date?: unknown } | null) {
  const { data } = useAccountingConnection();
  const issued = String(invoice?.issue_date ?? '').slice(0, 10);
  const beforeCutover = !!(data?.cutover_date && issued && issued < data.cutover_date);
  const managed = !!data?.payments_managed_externally && !beforeCutover;
  const provider = data ? providerConfig(data.provider) : null;
  return {
    managed,
    connection: data ?? null,
    provider,
    providerName: provider?.short ?? data?.provider_name ?? 'your accounting system',
  };
}

const POLL_BACKFILL_MS = 3_000;
const POLL_SYNC_MS = 10_000;

export function useMapping(enabled = true) {
  return useQuery<Mapping>({
    queryKey: ACCT_KEYS.mapping,
    queryFn: () => fetchData<Mapping>(ACCT_URL.mapping),
    enabled,
  });
}

export function useContacts(status: string, kind: string, enabled = true) {
  const params = new URLSearchParams();
  if (status && status !== 'ALL') params.set('status', status);
  if (kind && kind !== 'ALL') params.set('kind', kind);
  const qs = params.toString();
  return useQuery<ContactsResponse>({
    queryKey: ACCT_KEYS.contacts(status, kind),
    queryFn: () => fetchData<ContactsResponse>(`${ACCT_URL.contacts}${qs ? `?${qs}` : ''}`),
    enabled,
  });
}

/** The history send: the preview for a date, and its progress; polls while it runs. */
export function useBackfill(cutoverDate: string | null, enabled = true) {
  return useQuery<Backfill>({
    queryKey: [...ACCT_KEYS.backfill, cutoverDate ?? ''],
    queryFn: () =>
      fetchData<Backfill>(
        `${ACCT_URL.backfill}${cutoverDate ? `?cutover_date=${encodeURIComponent(cutoverDate)}` : ''}`,
      ),
    enabled,
    refetchInterval: (q) => (q.state.data?.state === 'RUNNING' ? POLL_BACKFILL_MS : false),
  });
}

/** Sync counts, recent events and failures; polls while anything is queued. */
export function useSyncStatus(enabled = true) {
  return useQuery<SyncStatus>({
    queryKey: ACCT_KEYS.sync,
    queryFn: () => fetchData<SyncStatus>(ACCT_URL.sync),
    enabled,
    refetchInterval: (q) => ((q.state.data?.counts?.queued ?? 0) > 0 ? POLL_SYNC_MS : false),
  });
}

export function useReconciliation(enabled = true) {
  return useQuery<Reconciliation>({
    queryKey: ACCT_KEYS.reconciliation,
    queryFn: () => fetchData<Reconciliation>(ACCT_URL.reconciliation),
    enabled,
    retry: 0,
  });
}

/** After any accounting write: refetch everything that reads the connection. */
export function invalidateAccounting(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ACCT_KEYS.all });
}

export function useInvalidateAccounting() {
  const qc = useQueryClient();
  return () => invalidateAccounting(qc);
}

/**
 * What needs someone's attention on a live connection: documents that failed
 * to send plus reconciliation differences, and the tab to open for them.
 */
export function useAccountingAttention(connection: Connection | null | undefined): {
  count: number;
  tab: 'sync' | 'reconciliation' | null;
} {
  const live = !!connection && connection.status === 'ACTIVE' && !!connection.readiness?.sync_enabled;
  const recon = useReconciliation(live);
  if (!live || !connection) return { count: 0, tab: null };
  const failing = (connection.counts?.errors ?? 0) + (connection.counts?.dead ?? 0);
  const diffs = recon.data?.run?.status === 'FAILED' ? 0 : (recon.data?.run?.difference_count ?? 0);
  return { count: failing + diffs, tab: failing > 0 ? 'sync' : diffs > 0 ? 'reconciliation' : null };
}

// ---------------------------------------------------------------- errors

interface ApiErrorShape {
  status?: number;
  message?: string;
  data?: {
    code?: string;
    error?: string;
    detail?: string;
    errors?: Record<string, string | string[]>;
    record_url?: string | null;
    provider_name?: string;
  };
}

export const apiStatus = (e: unknown): number | undefined => (e as ApiErrorShape | null)?.status;
export const apiCode = (e: unknown): string | undefined => (e as ApiErrorShape | null)?.data?.code;

/** The backend's sentence (error/detail), or a fallback. */
export function apiMessage(e: unknown, fallback: string): string {
  const err = e as ApiErrorShape | null;
  const body = err?.data;
  const msg = body?.error || body?.detail || (e instanceof Error ? e.message : '');
  return msg && !/^Request failed/.test(msg) && !/^Network error/i.test(msg) ? msg : fallback;
}

/** Per-field errors from a 400 `invalid_mapping` ({"tax_sales.STANDARD": "..."}). */
export function apiFieldErrors(e: unknown): Record<string, string> {
  const errs = (e as ApiErrorShape | null)?.data?.errors;
  if (!errs || typeof errs !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errs)) out[k] = Array.isArray(v) ? v.join(' ') : String(v);
  return out;
}

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetchData, patchData, postData } from '@/lib/api/client';
import type {
  AdvanceRow,
  Application,
  ApplicationPatch,
  CapitalStatus,
  FastPayInvoices,
  Offer,
  RequestResult,
} from './types';

/**
 * Fast Pay data hooks (react-query). One place for the URLs, query keys and
 * invalidation of the Fast Pay screen, the invoice panel and the advance
 * detail. Every figure comes from these responses; nothing here computes a fee
 * or an advance. Port of the web's lib/capital/api.ts (transporter side).
 *
 * Keys live under ['capital', ...], which lib/queryInvalidation already
 * refreshes on invoice, payment and advance events.
 */

const BASE = 'capital/';

export const CAP_URL = {
  status: `${BASE}status/`,
  application: `${BASE}application/`,
  applicationSubmit: `${BASE}application/submit/`,
  invoices: `${BASE}fast-pay/invoices/`,
  offer: (invoiceId: number | string) => `${BASE}fast-pay/invoices/${invoiceId}/offer/`,
  requests: `${BASE}fast-pay/requests/`,
  advances: `${BASE}fast-pay/advances/`,
  advance: (id: number | string) => `${BASE}fast-pay/advances/${id}/`,
  advanceCancel: (id: number | string) => `${BASE}fast-pay/advances/${id}/cancel/`,
} as const;

/**
 * Capital endpoints answer 403/404 by design (no access, not launched, the
 * backend not deployed yet): never retry a 4xx, so the screen shows its empty
 * or error state at once instead of a long skeleton. A 5xx or network error
 * gets one retry.
 */
export const capitalRetry = (count: number, error: unknown) => {
  const status = (error as { status?: number } | null)?.status;
  if (status != null && status < 500) return false;
  return count < 1;
};

const errData = (e: unknown) => (e as { data?: unknown } | null)?.data as Record<string, unknown> | undefined;

/** The structured `code` some capital errors carry ('demo', 'not_launched', 'not_fundable', 'capacity'). */
export const capitalErrorCode = (e: unknown): string | undefined => {
  const c = errData(e)?.code;
  return typeof c === 'string' ? c : undefined;
};

/** The offer a 400 `not_fundable` carries, if any. */
export const errorOffer = (e: unknown): Offer | undefined => {
  const o = errData(e)?.offer;
  return o && typeof o === 'object' ? (o as Offer) : undefined;
};

/** True when the screen should say Fast Pay isn't available (403/404), rather than that something failed. */
export const isUnavailable = (e: unknown): boolean => {
  const status = (e as { status?: number } | null)?.status;
  return status === 403 || status === 404;
};

/**
 * The server's own message when it sent one, else a plain fallback. Never the
 * bare HTTP status.
 */
export function serverMessage(e: unknown, fallback: string): string {
  const code = capitalErrorCode(e);
  if (code === 'demo') return 'This is a demo company, so nothing can be requested and no money moves.';
  if (code === 'not_launched') return 'Fast Pay is not live yet.';
  if (code === 'capacity') return 'Fast Pay funding is fully used right now. Try again later.';
  if (e instanceof Error && e.message && !/^Request failed|^Network error/.test(e.message)) return e.message;
  const status = (e as { status?: number } | null)?.status;
  if (status === 403) return "Your role can't do this.";
  return fallback;
}

export const capitalKeys = {
  all: ['capital'] as const,
  status: ['capital', 'status'] as const,
  application: ['capital', 'application'] as const,
  invoices: ['capital', 'fp-invoices'] as const,
  offer: (invoiceId: number | string) => ['capital', 'offer', String(invoiceId)] as const,
  advances: ['capital', 'advances'] as const,
  advance: (id: number | string) => ['capital', 'advance', String(id)] as const,
};

/** Status, line and application. Always answers on the backend; 403/404 means not available. */
export function useCapitalStatus(opts: { enabled?: boolean } = {}) {
  return useQuery<CapitalStatus>({
    queryKey: capitalKeys.status,
    queryFn: () => fetchData<CapitalStatus>(CAP_URL.status),
    retry: capitalRetry,
    staleTime: 60_000,
    enabled: opts.enabled !== false,
  });
}

export function useApplication(opts: { enabled?: boolean } = {}) {
  return useQuery<Application>({
    queryKey: capitalKeys.application,
    queryFn: () => fetchData<Application>(CAP_URL.application),
    retry: capitalRetry,
    enabled: opts.enabled !== false,
  });
}

export function useFastPayInvoices(opts: { enabled?: boolean } = {}) {
  return useQuery<FastPayInvoices>({
    queryKey: capitalKeys.invoices,
    queryFn: () => fetchData<FastPayInvoices>(CAP_URL.invoices),
    retry: capitalRetry,
    staleTime: 30_000,
    enabled: opts.enabled !== false,
  });
}

/**
 * The persisted offer for one invoice (valid 48 h). Fetched fresh each time the
 * request sheet opens, so the figures confirmed are the ones the server will use.
 */
export function useOffer(invoiceId: number | string | null | undefined) {
  return useQuery<Offer>({
    queryKey: capitalKeys.offer(invoiceId ?? ''),
    queryFn: () => fetchData<Offer>(CAP_URL.offer(invoiceId!)),
    enabled: invoiceId != null && invoiceId !== '',
    retry: capitalRetry,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useAdvances(opts: { enabled?: boolean } = {}) {
  return useQuery<AdvanceRow[]>({
    queryKey: capitalKeys.advances,
    queryFn: async () => {
      const d = await fetchData<AdvanceRow[] | { results?: AdvanceRow[] }>(CAP_URL.advances);
      return Array.isArray(d) ? d : (d?.results ?? []);
    },
    retry: capitalRetry,
    enabled: opts.enabled !== false,
  });
}

export function useAdvance(id: number | string | undefined) {
  return useQuery<AdvanceRow>({
    queryKey: capitalKeys.advance(id ?? ''),
    queryFn: () => fetchData<AdvanceRow>(CAP_URL.advance(id!)),
    enabled: !!id,
    retry: capitalRetry,
  });
}

/** After a request, a cancel or an application change: refresh every Fast Pay view. */
export function invalidateCapital(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: capitalKeys.all });
  void qc.invalidateQueries({ queryKey: ['invoice'] });
  void qc.invalidateQueries({ queryKey: ['invoices'] });
  void qc.invalidateQueries({ queryKey: ['capital-eligible'] });
}

export function useUpdateApplication() {
  const qc = useQueryClient();
  return useMutation<Application, Error, ApplicationPatch>({
    mutationFn: (data) => patchData<Application>({ url: CAP_URL.application, data }),
    onSuccess: (app) => {
      qc.setQueryData(capitalKeys.application, app);
      void qc.invalidateQueries({ queryKey: capitalKeys.status });
    },
  });
}

export function useSubmitApplication() {
  const qc = useQueryClient();
  return useMutation<Application, Error, { consents: string[] }>({
    mutationFn: (data) => postData<Application>({ url: CAP_URL.applicationSubmit, data }),
    onSuccess: (app) => {
      qc.setQueryData(capitalKeys.application, app);
      invalidateCapital(qc);
    },
  });
}

export function useRequestFastPay() {
  const qc = useQueryClient();
  return useMutation<RequestResult, Error, { invoice_id: number; offer_id?: number | null }>({
    mutationFn: ({ invoice_id, offer_id }) =>
      postData<RequestResult>({
        url: CAP_URL.requests,
        data: offer_id != null ? { invoice_id, offer_id } : { invoice_id },
      }),
    onSettled: () => invalidateCapital(qc),
  });
}

export function useCancelAdvance() {
  const qc = useQueryClient();
  return useMutation<AdvanceRow, Error, number | string>({
    mutationFn: (id) => postData<AdvanceRow>({ url: CAP_URL.advanceCancel(id), data: {} }),
    onSettled: () => invalidateCapital(qc),
  });
}

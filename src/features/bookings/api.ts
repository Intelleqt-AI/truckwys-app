import { useQuery } from '@tanstack/react-query';
import { fetchData, postData, patchData } from '@/lib/api/client';
import { asArray } from '@/lib/api/list';
import { normalizeQuote, normalizeLoad, type QuoteLite, type LoadLite } from '@/types/domain';

// ── Lists ──────────────────────────────────────────────────────────────────
export function useQuotes() {
  return useQuery<QuoteLite[]>({
    queryKey: ['quotes'],
    queryFn: async () => asArray(await fetchData('quotes/')).map(normalizeQuote),
  });
}

export function useLoads() {
  return useQuery<LoadLite[]>({
    queryKey: ['loads'],
    queryFn: async () => asArray(await fetchData('loads/')).map(normalizeLoad),
  });
}

// ── Details ──────────────────────────────────────────────────────────────────
export function useQuote(id: string | number, preview?: Record<string, unknown>) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['quote', id],
    queryFn: () => fetchData(`quotes/${id}/`),
    initialData: preview,
  });
}

export function useLoad(id: string | number, preview?: Record<string, unknown>) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['load', id],
    queryFn: () => fetchData(`loads/${id}/`),
    initialData: preview,
  });
}

// ── Mutations / actions ─────────────────────────────────────────────────────
export const updateLoadStatus = (id: string | number, status: string) =>
  patchData({ url: `loads/${id}/`, data: { status } });

export const sendQuote = (id: string | number) =>
  postData({ url: `quotes/${id}/send/`, data: {} });

export const createQuoteRequest = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'quotes/', data });

// AI estimate for the Create-Quote flow (same endpoint the web app calls).
export const analyzeQuote = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'quotes/analyze/', data });

export const suggestLocations = (q: string) =>
  fetchData<unknown>(`location/suggest/?q=${encodeURIComponent(q)}`);

export const convertLoadToInvoice = (id: string | number) =>
  postData({ url: `loads/${id}/convert-to-invoice/`, data: {} });

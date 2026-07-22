import { useQuery } from '@tanstack/react-query';
import { api, fetchData, postData, patchData, deleteData } from '@/lib/api/client';
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

// ── Reference data for the quote builder ────────────────────────────────────
export interface VehicleType {
  id: number | string;
  name: string;
  fuel_consumption_l_per_100km?: number;
  base_rate?: number;
  available_vehicle_count?: number;
  capacity?: number;
}

export function useVehicleTypes() {
  return useQuery<VehicleType[]>({
    queryKey: ['vehicle-types'],
    queryFn: async () => asArray<VehicleType>(await fetchData('vehicle-types/')),
  });
}

export function useCompanyProfileData() {
  return useQuery<Record<string, unknown>>({
    queryKey: ['company-profile'],
    queryFn: () => fetchData('company/profile/'),
    retry: false,
  });
}

export function useFuelPrice() {
  return useQuery<Record<string, unknown>>({
    queryKey: ['fuel-prices'],
    queryFn: () => fetchData('fuel-prices/current/'),
    retry: false,
    staleTime: 60 * 60 * 1000,
  });
}

// Win-model training status — drives the "still learning" banner.
export function useModelStats() {
  return useQuery<Record<string, unknown>>({
    queryKey: ['quote-model-stats'],
    queryFn: () => fetchData('quotes/model-stats/'),
    retry: false,
    staleTime: 30 * 60 * 1000,
  });
}

// ── Quote builder network calls ─────────────────────────────────────────────
export const suggestLocations = (q: string) =>
  fetchData<unknown>(`location/suggest/?q=${encodeURIComponent(q)}`);

export const calculateRoute = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'route/calculate/', data });

export const analyzeQuote = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'quotes/analyze/', data });

export const guardQuote = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'quotes/guard/', data });

export const benchmarkQuote = (origin: string, destination: string, vehicleType: string) =>
  fetchData<Record<string, unknown>>(
    `quotes/benchmark/?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
      destination,
    )}&vehicle_type=${encodeURIComponent(vehicleType.toLowerCase())}`,
  );

// ── AI quote (chat + voice) ─────────────────────────────────────────────────
export const aiChatQuote = (message: string, history: unknown[], currentFields: unknown) =>
  postData<Record<string, unknown>>({
    url: 'ai/chat-quote/',
    data: { message, history, current_fields: currentFields },
  });

export const aiVoiceQuote = (audio: { uri: string; name: string; type: string }) => {
  const form = new FormData();
  // React Native FormData file part.
  form.append('audio', audio as unknown as Blob);
  return postData<Record<string, unknown>>({
    url: 'ai/voice-quote/',
    data: form,
    config: { headers: { 'Content-Type': 'multipart/form-data' } },
  });
};

// ── Quote mutations / actions ───────────────────────────────────────────────
export const createQuote = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'quotes/', data });

export const patchQuote = (id: string | number, data: Record<string, unknown>) =>
  patchData<Record<string, unknown>>({ url: `quotes/${id}/`, data });

// Correct: DRF @action send_to_customer (returns email_sent, share_url).
export const sendQuote = (id: string | number) =>
  postData<Record<string, unknown>>({ url: `quotes/${id}/send_to_customer/`, data: {} });

export const updateQuoteStatus = (id: string | number, status: string) =>
  patchData({ url: `quotes/${id}/update_status/`, data: { status } });

export const recordQuoteOutcome = (id: string | number, data: Record<string, unknown>) =>
  postData({ url: `quotes/${id}/outcome/`, data });

export const convertQuoteToLoad = (id: string | number) =>
  postData({ url: `quotes/${id}/convert_to_load/`, data: {} });

export const deleteQuote = (id: string | number) => deleteData({ url: `quotes/${id}/` });

// Quote PDF is a GET that streams a PDF blob (web uses downloadBlob).
export const downloadQuotePdf = async (id: string | number): Promise<Blob> => {
  const res = await api.get(`quotes/${id}/generate_pdf/`, { responseType: 'blob' });
  return res.data as Blob;
};

// ── Load mutations / actions ────────────────────────────────────────────────
// Web patches the detail resource directly (there is no update_status action —
// POST there returns "method not allowed").
export const updateLoadStatus = (id: string | number, status: string) =>
  patchData({ url: `loads/${id}/`, data: { status } });

export const convertLoadToInvoice = (id: string | number) =>
  postData<Record<string, unknown>>({ url: `loads/${id}/convert_to_invoice/`, data: {} });

// Multipart POST — field name `pod_document` (matches the web upload).
export const uploadLoadPod = (id: string | number, file: { uri: string; name: string; type: string }) => {
  const form = new FormData();
  form.append('pod_document', file as unknown as Blob);
  return postData<Record<string, unknown>>({
    url: `loads/${id}/upload_pod/`,
    data: form,
    config: { headers: { 'Content-Type': 'multipart/form-data' } },
  });
};

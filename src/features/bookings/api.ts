import { useQuery } from '@tanstack/react-query';
import { api, fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import { asArray, num, str, pick } from '@/lib/api/list';
import { useInfiniteList } from '@/lib/api/useInfiniteList';
import { normalizeQuote, normalizeLoad } from '@/types/domain';

// ── Lists ──────────────────────────────────────────────────────────────────
export const useQuotes = () => useInfiniteList('quotes', 'quotes/', normalizeQuote);
export const useLoads = () => useInfiniteList('loads', 'loads/', normalizeLoad);

// Background-only: resolves which load (if any) a quote converted to.
// Neither `quotes/` nor `loads/` exposes a way to answer this in one request —
// the Quote payload carries no load_id (Load.quote is a FK the other way, not
// on Quote's serializer) and LoadViewSet has no ?quote= filter — so this pages
// through every load once, decoupled from the paginated (partially-loaded)
// Orders/History lists so the lookup stays correct regardless of how far the
// user has scrolled those.
//
// Only worth doing at all when a visible quote is ACCEPTED/APPROVED and
// doesn't already carry its own load_id — the → Booking button is the only
// consumer. `enabled` below skips the whole thing otherwise (most companies,
// most of the time), and when it does run, page 1's `count` lets every
// remaining page fire in parallel instead of chaining N sequential round
// trips — the previous `for(;;)` loop meant 500 loads = 25 requests back to
// back, each pulling the full load payload just to read two fields.
type PageEnvelope<T> = { count: number; next: string | null; results: T[] } | T[];

const MAX_LOOKUP_PAGES = 25; // 500 loads at DRF's PAGE_SIZE=20 — generous ceiling, not a real limit for any tenant seen so far.

interface LoadQuoteRef {
  id: string | number;
  quote: string | number | null;
}

function toRef(r: Record<string, unknown>): LoadQuoteRef {
  return {
    id: pick(r, ['id', 'pk']) as string | number,
    quote: (pick(r, ['quote']) as string | number) ?? null,
  };
}

/** Any visible quote that's accepted but doesn't already know its load id. */
export function needsLoadsLookup(quotes: { status: string; raw: Record<string, unknown> }[]): boolean {
  return quotes.some(
    (q) =>
      ['ACCEPTED', 'APPROVED'].includes(q.status) &&
      pick(q.raw, ['load_id', 'load', 'booking_id']) == null,
  );
}

export function useLoadsForConvertLookup(enabled: boolean) {
  return useQuery<Map<string, string | number>>({
    queryKey: ['loads-lookup'],
    enabled,
    // The mapping barely moves — a quote converts once — so there's no need
    // to re-walk the table on every 5-minute-stale remount.
    staleTime: 10 * 60 * 1000,
    queryFn: async ({ signal }) => {
      const first = await fetchData<PageEnvelope<Record<string, unknown>>>('loads/?page=1', signal);
      const refs = asArray<Record<string, unknown>>(first).map(toRef);

      if (!Array.isArray(first) && first.next) {
        const totalPages = Math.min(MAX_LOOKUP_PAGES, Math.ceil(first.count / 20));
        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) =>
            fetchData<PageEnvelope<Record<string, unknown>>>(`loads/?page=${i + 2}`, signal),
          ),
        );
        for (const page of rest) refs.push(...asArray<Record<string, unknown>>(page).map(toRef));
      }

      const out = new Map<string, string | number>();
      for (const r of refs) if (r.quote != null) out.set(String(r.quote), r.id);
      return out;
    },
  });
}

// ── Details ──────────────────────────────────────────────────────────────────
export function useQuote(id: string | number, preview?: Record<string, unknown>) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['quote', id],
    queryFn: () => fetchData(`quotes/${id}/`),
    // placeholderData, NOT initialData: the preview is the list row, which has
    // fewer fields and may be minutes old. initialData is written to the cache
    // and counts as a fresh fetch, so with the global 5-minute staleTime the
    // screen would show the stale row and never request the real record.
    placeholderData: preview,
  });
}

export function useLoad(id: string | number, preview?: Record<string, unknown>) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['load', id],
    queryFn: () => fetchData(`loads/${id}/`),
    // See useQuote — placeholderData so the real record is always fetched.
    placeholderData: preview,
  });
}

// ── Reference data for the quote builder ────────────────────────────────────
export interface VehicleType {
  id: number | string;
  name: string;
  description?: string;
  fuel_consumption_l_per_100km?: number;
  /** Decides which of the company's per-fuel-type default prices a quote uses. */
  fuel_type?: string;
  base_rate?: number;
  available_vehicle_count?: number;
  /** Reference tonnage for both the overload guard and the fuel formula's t_ref. */
  capacity?: number;
  /** Extra fuel burned per tonne over `capacity`, as a percent (e.g. 2 = +2%/tonne). */
  fuel_consumption_sensitivity_pct?: number;
  active?: boolean;
}

// The backend serializes every decimal field as a JSON string ("38.00", not
// 38) — DRF's COERCE_DECIMAL_TO_STRING default, which is unset in settings so
// its own default (true) applies. `useVehicleTypesList` (fleet/api.ts) and the
// inline vehicle-types query in more/SettingsScreen.tsx share this exact
// ['vehicle-types'] query key, so all three must normalize identically —
// whichever queryFn actually runs wins the shared cache entry for the other
// two. Import this into both rather than re-parsing locally.
export function normalizeVehicleType(r: Record<string, unknown>): VehicleType {
  return {
    id: (pick(r, ['id', 'pk']) as string | number) ?? '',
    name: str(pick(r, ['name'])),
    description: str(pick(r, ['description'])),
    fuel_consumption_l_per_100km: num(pick(r, ['fuel_consumption_l_per_100km'])),
    fuel_type: str(pick(r, ['fuel_type']), 'Diesel'),
    base_rate: num(pick(r, ['base_rate'])),
    available_vehicle_count:
      pick(r, ['available_vehicle_count']) != null
        ? num(pick(r, ['available_vehicle_count']))
        : undefined,
    capacity: num(pick(r, ['capacity'])),
    fuel_consumption_sensitivity_pct: num(pick(r, ['fuel_consumption_sensitivity_pct'])),
    // Absent (older records / no key at all) defaults to active, same as the
    // backend's own `active = models.BooleanField(default=True)`.
    active: pick(r, ['active']) !== false,
  };
}

export function useVehicleTypes() {
  return useQuery<VehicleType[]>({
    queryKey: ['vehicle-types'],
    queryFn: async () => asArray(await fetchData('vehicle-types/')).map(normalizeVehicleType),
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

// Recent/frequent picks, team-wide. With no query, returns frequent locations
// for an empty-field focus; with one, returns matches to merge alongside
// location/suggest/ (mirrors web's LocationInput.tsx).
export const fetchRecentLocations = (q?: string) =>
  fetchData<unknown>(`location/recent/${q ? `?q=${encodeURIComponent(q)}` : ''}`);

// Fire-and-forget: builds the recent-locations history, never blocks or
// surfaces an error to the location-picking flow.
export const recordLocationPick = (label: string, lat: number, lon: number) =>
  postData({ url: 'location/recent/', data: { location_text: label, lat, lon } }).catch(() => {});

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

/** One turn of the extraction conversation, as the backend expects it. */
export interface AiChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * `history` and `currentFields` are what let the model refine an answer instead
 * of re-reading each message cold — currentFields carries the form as it stands
 * (including the already-picked customer_name), so a follow-up like "make it
 * next Tuesday" keeps everything else.
 *
 * `pendingEntity` / `declinedEntities` drive the "that client doesn't exist —
 * create it?" exchange. Without them the backend asks the question and can
 * never receive the answer.
 */
export const aiChatQuote = (
  message: string,
  history: AiChatTurn[] = [],
  currentFields: unknown = {},
  pendingEntity: unknown = null,
  declinedEntities: string[] = [],
) =>
  postData<Record<string, unknown>>({
    url: 'ai/chat-quote/',
    data: {
      message,
      history,
      current_fields: currentFields,
      pending_entity: pendingEntity,
      declined_entities: declinedEntities,
    },
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

// Won/lost capture. PATCH, not POST — matches the web outcome modal.
export interface QuoteOutcome {
  outcome: 'accepted' | 'rejected';
  final_price?: number;
  rejection_reason?: string;
}

export const recordQuoteOutcome = (id: string | number, data: QuoteOutcome) =>
  patchData({ url: `quotes/${id}/outcome/`, data });

// Driver/vehicle are optional — converting with neither leaves the booking
// unassigned, to be picked up later from the load detail screen.
export const convertQuoteToLoad = (
  id: string | number,
  data: { driver_id?: string; vehicle_id?: string } = {},
) => postData({ url: `quotes/${id}/convert_to_load/`, data });

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

// Assigns (or clears) both at once — the endpoint takes null to unassign.
export const assignLoadDriver = (
  id: string | number,
  driver_id: number | null,
  vehicle_id: number | null,
) => postData({ url: `loads/${id}/assign_driver/`, data: { driver_id, vehicle_id } });

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

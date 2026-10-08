import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { api, fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import type { AllPages } from '@/lib/api/fetchAllPages';
import { asArray, num, str, pick } from '@/lib/api/list';
import { useInfiniteList } from '@/lib/api/useInfiniteList';
import { normalizeQuote, normalizeLoad, type LoadLite } from '@/types/domain';
import { roundTo } from '@/lib/formatters';
import { parseErrorBody, sendBlockMessage } from './quote/sendBlock';

// ── Lists ──────────────────────────────────────────────────────────────────
/**
 * Quotes, optionally narrowed by the server's own `status` filter. Besides the
 * stored statuses it understands BOOKED (converted into a load; legacy IT /
 * COMPLETED count too) and an ACCEPTED that means "won, still to book".
 * Expired is not a server status for Draft/Sent quotes that merely ran past
 * valid_until, so that view uses the unfiltered list and the date rule in
 * lib/quoteStage.ts.
 */
export const useQuotes = (status?: string) => {
  const qc = useQueryClient();
  const server = status && status !== 'ALL' && status !== 'EXPIRED' ? status : null;
  return useInfiniteList(
    ['quotes', server ?? 'ALL'],
    server ? `quotes/?status=${encodeURIComponent(server)}` : 'quotes/',
    normalizeQuote,
    {
      // The list endpoint costs a handful of queries per row on the server, so
      // the first page is kept small; more arrive on scroll.
      pageSize: 20,
      // Rows Home already downloaded stand in until the real page lands. They
      // are every quote, which is a superset of any server filter, and the
      // screen narrows by stage on the device anyway.
      seed: () => qc.getQueryData<AllPages<Record<string, unknown>>>(['ledger-quotes'])?.rows,
      keepPrevious: true,
    },
  );
};
/** The Orders tab's tiles, as the API sends them (core.services.load_list). */
export interface OrdersSummary {
  open_count: number;
  need_vehicle: number;
  need_vehicle_overdue: number;
  moving_no_vehicle: number;
  in_transit: number;
  in_transit_overdue: number;
  left_open: number;
  open_total_incl_vat: number;
  any_loads: boolean;
}
/** The History tab's tiles. */
export interface HistorySummary {
  history_count: number;
  delivered_not_invoiced: number;
  invoiced: number;
  invoiced_total_incl_vat: number;
  completed: number;
  completed_total_incl_vat: number;
  any_loads: boolean;
}

/**
 * One tab of loads, server-side: `?tab=orders|history` limits it to that tab's
 * statuses, `status` narrows to one, `q` searches customer, load, route, driver
 * and truck, History comes newest first, and page 1 carries the tab's tiles as
 * `summary`. Keyed under 'loads' so invalidating ['loads'] reaches every variant.
 */
export function useLoadsTab<S>(tab: 'orders' | 'history', status: string, q: string) {
  const params = new URLSearchParams({ tab });
  if (status !== 'ALL') params.set('status', status);
  if (q) params.set('q', q);
  return useInfiniteList<LoadLite, { summary?: S }>(
    ['loads', 'list', tab, status, q],
    `loads/?${params.toString()}`,
    normalizeLoad,
    // A new status or search keeps the current rows until its own land.
    { pageSize: 20, keepPrevious: true },
  );
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

/**
 * Has diesel gone up since this quote was priced? Only worth asking for a quote
 * that is still open (Draft or Sent). `has_alert` false is the normal answer;
 * a failed request is simply no alert, since this is advice, not a figure.
 */
export interface QuoteFuelAlert {
  has_alert: boolean;
  fuel_delta_zar?: number;
  estimated_cost_impact?: number;
  message?: string;
}

export function useQuoteFuelAlert(id: string | number, enabled: boolean) {
  return useQuery<QuoteFuelAlert | null>({
    queryKey: ['quote-fuel-alert', id],
    enabled: enabled && !!id,
    retry: false,
    queryFn: async () => {
      try {
        const res = await fetchData<QuoteFuelAlert>(`quotes/${id}/fuel-alert/`);
        return res?.has_alert ? res : null;
      } catch {
        return null;
      }
    },
  });
}

/**
 * The backend's costing for a saved quote today (POST quotes/cost-breakdown/
 * {quote_id}, newer backends): floor, margin_pct, the stored snapshot and the
 * send check. Null on an older backend (404) or any failure: the screen then
 * uses the quote's stored cost floor.
 */
export function useQuoteCosting(id: string | number, enabled: boolean) {
  return useQuery<Record<string, unknown> | null>({
    queryKey: ['quote-costing', id],
    enabled: enabled && !!id,
    retry: false,
    queryFn: async () => {
      try {
        const res = await postData<Record<string, unknown>>({
          url: 'quotes/cost-breakdown/',
          data: { quote_id: Number(id) },
          config: { timeout: 10000 },
        });
        return res && res.success === true ? res : null;
      } catch {
        return null;
      }
    },
  });
}

/**
 * A load row some list already downloaded (Home's ledger, or the Orders/History
 * pages), for a screen opened by id alone: the "View booking" link on a quote
 * knows the load's id but carries no row. Undefined when no list has it yet.
 */
function cachedLoadRow(qc: QueryClient, id: string | number): Record<string, unknown> | undefined {
  const same = (r: Record<string, unknown>) => String(pick(r, ['id', 'pk'])) === String(id);
  const ledger = qc.getQueryData<AllPages<Record<string, unknown>>>(['ledger-loads'])?.rows;
  const fromLedger = ledger?.find(same);
  if (fromLedger) return fromLedger;
  for (const [, data] of qc.getQueriesData<InfiniteData<unknown>>({ queryKey: ['loads'] })) {
    const hit = data?.pages?.flatMap((p) => asArray<Record<string, unknown>>(p)).find(same);
    if (hit) return hit;
  }
  return undefined;
}

export function useLoad(id: string | number, preview?: Record<string, unknown>) {
  const qc = useQueryClient();
  return useQuery<Record<string, unknown>>({
    queryKey: ['load', id],
    queryFn: () => fetchData(`loads/${id}/`),
    // See useQuote — placeholderData so the real record is always fetched.
    placeholderData: () => preview ?? cachedLoadRow(qc, id),
  });
}

/**
 * Write a load record a mutation just returned straight into the detail cache,
 * so the screen shows it on the first frame instead of waiting for a refetch.
 * Ignores anything that isn't an object with an id, so an unexpected response
 * shape can never replace a good cached record.
 */
export function seedLoad(qc: QueryClient, record: unknown, fallbackId?: string | number) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return;
  const r = record as Record<string, unknown>;
  const id = pick(r, ['id', 'pk']) ?? fallbackId;
  if (id == null || id === '') return;
  // A load record always carries a status; this keeps a non-load body (e.g. an
  // upload ack) from being cached as one.
  if (r.status == null) return;
  qc.setQueryData(['load', id], r);
  // The route param can be a string while the record's id is a number (or vice
  // versa) — seed both spellings so useLoad's key always matches.
  if (fallbackId != null && String(fallbackId) !== String(id)) qc.setQueryData(['load', fallbackId], r);
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
  /** Vehicles of this type the company owns, ANY status — the pool a truck
      suggestion can draw on (quote/suggestions.ts), as opposed to
      available_vehicle_count above (AVAILABLE only), which is what the
      picker filters by. undefined means the backend predates this field;
      see ownedCount in quote/suggestions.ts for how that degrades. */
  owned_vehicle_count?: number;
  /** Reference tonnage for both the overload guard and the fuel formula's t_ref. */
  capacity?: number;
  /** Extra fuel burned per tonne over `capacity`, as a percent (e.g. 2 = +2%/tonne). */
  fuel_consumption_sensitivity_pct?: number;
  active?: boolean;
  /** null = the shared platform default every company sees (backend's
      company=None catalogue row); a number = a row this company owns
      (custom, or a copy-on-write override of a shared default). undefined
      means the backend hasn't shipped this field yet — treated the same as
      company-owned, so a build reaching users before that backend deploy
      degrades to today's behaviour rather than disabling anything. */
  company?: number | null;
  /** True only for a company-owned row that shadows a shared default of the
      same name — the result of editing a shared type (backend's
      VehicleTypeViewSet.update copy-on-write). Settings offers "Reset"
      instead of "Delete" for these. Absent/undefined on a pre-shared-catalogue
      backend, same reasoning as `company` above. */
  overrides_shared_default?: boolean;
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
    owned_vehicle_count:
      pick(r, ['owned_vehicle_count']) != null ? num(pick(r, ['owned_vehicle_count'])) : undefined,
    capacity: num(pick(r, ['capacity'])),
    fuel_consumption_sensitivity_pct: num(pick(r, ['fuel_consumption_sensitivity_pct'])),
    // Absent (older records / no key at all) defaults to active, same as the
    // backend's own `active = models.BooleanField(default=True)`.
    active: pick(r, ['active']) !== false,
    // pick() treats null the same as absent (its `!= null` filter), which is
    // wrong here — company: null is the meaningful "shared platform default"
    // value, distinct from the key being missing entirely on a backend that
    // predates the shared catalogue. Read the raw property so that
    // distinction survives.
    company: 'company' in r ? (r.company as number | null) : undefined,
    overrides_shared_default: r.overrides_shared_default === true,
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

/**
 * Re-check the official fuel price now: POST fuel-prices/refresh/ (newer
 * backends, any user), else the older GET ?force=true.
 */
export async function refreshFuelPrices(): Promise<void> {
  try {
    await postData({ url: 'fuel-prices/refresh/', data: {} });
  } catch (e) {
    const status = Number((e as { status?: number }).status);
    if ([404, 405, 501].includes(status)) await fetchData('fuel-prices/current/?force=true');
    else throw e;
  }
}

export function useFuelPrice() {
  return useQuery<Record<string, unknown>>({
    queryKey: ['fuel-prices'],
    queryFn: () => fetchData('fuel-prices/current/'),
    retry: false,
    staleTime: 60 * 60 * 1000,
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
  postData({
    url: 'location/recent/',
    // LocationSearchHistory.lat/lon are DecimalField(max_digits=9,
    // decimal_places=6) — one decimal place tighter than the (12,7) quote
    // coordinate columns roundCoord targets, so round to this column's own
    // precision rather than reusing that helper.
    data: { location_text: label, lat: roundTo(lat, 6), lon: roundTo(lon, 6) },
  }).catch(() => {});

// X-TW-Quote-Rules: 1 opts into the QUOTE-RULES response shape (unknown
// fuel/tolls as null + tolls_unknown / distance_estimated flags). Without it
// the backend keeps the legacy shape for already-shipped builds. A plain
// header: OTA-safe, and older backends ignore it.
export const QUOTE_RULES_HEADER = { 'X-TW-Quote-Rules': '1' };
export const calculateRoute = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'route/calculate/', data, config: { headers: QUOTE_RULES_HEADER } });

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
) => postData<Record<string, unknown>>({ url: `quotes/${id}/convert_to_load/`, data });

export const deleteQuote = (id: string | number) => deleteData({ url: `quotes/${id}/` });

// Blob.text() isn't in React Native's Blob: read it with FileReader.
const blobText = (b: Blob): Promise<string> =>
  new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsText(b);
    } catch {
      resolve('');
    }
  });

// Quote PDF is a GET that streams a PDF blob (web uses downloadBlob).
//
// A refused PDF (a draft with a blocking warning, §11) answers 400 JSON, which
// with responseType 'blob' arrives as a Blob: read it and throw the block's
// own title rather than "Request failed (400)".
export const downloadQuotePdf = async (id: string | number): Promise<Blob> => {
  try {
    const res = await api.get(`quotes/${id}/generate_pdf/`, { responseType: 'blob' });
    return res.data as Blob;
  } catch (e) {
    const data = (e as { data?: unknown }).data;
    if (data && typeof Blob !== 'undefined' && data instanceof Blob) {
      const body = parseErrorBody(await blobText(data));
      const msg = sendBlockMessage(body);
      if (msg) {
        const err = new Error(msg) as Error & { status?: number; data?: unknown };
        err.status = (e as { status?: number }).status;
        err.data = body;
        throw err;
      }
    }
    throw e;
  }
};

// ── Load mutations / actions ────────────────────────────────────────────────
// Web patches the detail resource directly (there is no update_status action —
// POST there returns "method not allowed").
export const updateLoadStatus = (id: string | number, status: string) =>
  patchData<Record<string, unknown>>({ url: `loads/${id}/`, data: { status } });

// Assigns (or clears) both at once — the endpoint takes null to unassign.
export const assignLoadDriver = (
  id: string | number,
  driver_id: number | null,
  vehicle_id: number | null,
) => postData<Record<string, unknown>>({ url: `loads/${id}/assign_driver/`, data: { driver_id, vehicle_id } });

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

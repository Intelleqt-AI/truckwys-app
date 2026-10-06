import { useQuery, type QueryClient } from '@tanstack/react-query';
import { deleteData, fetchData, postData } from '@/lib/api/client';
import { asArray } from '@/lib/api/list';
import { invalidateFor } from '@/lib/queryInvalidation';

// Fleet tracking (Cartrack, CtrlFleet) and developer (API keys, webhooks) calls.
// Port of the web's IntegrationsSettings.tsx. Errors arrive as {error}; lib/api/client
// lifts it into Error.message, so call sites just show `e.message`.

/** The server's message when it sent one, else `fallback`. */
export const intError = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

export const INT_URL = {
  cartrackStatus: 'integrations/cartrack/status/',
  cartrackConnect: 'integrations/cartrack/connect/',
  ctrlfleetStatus: 'integrations/ctrlfleet/status/',
  ctrlfleetConnect: 'integrations/ctrlfleet/connect/',
  ctrlfleetDisconnect: 'integrations/ctrlfleet/disconnect/',
  ctrlfleetVehicles: 'integrations/ctrlfleet/vehicles/',
  ctrlfleetLink: 'integrations/ctrlfleet/link-vehicle/',
  ctrlfleetSyncVehicles: 'integrations/ctrlfleet/sync-vehicles/',
  ctrlfleetSyncPositions: 'integrations/ctrlfleet/sync-positions/',
  apiKeys: 'integrations/api-keys/',
  apiKey: (id: number) => `integrations/api-keys/${id}/`,
  webhooks: 'webhooks/',
  webhook: (id: number) => `webhooks/${id}/`,
  webhookTest: (id: number) => `webhooks/${id}/test/`,
} as const;

export const INT_KEYS = {
  all: ['integrations'] as const,
  cartrack: ['integrations', 'cartrack'] as const,
  ctrlfleet: ['integrations', 'ctrlfleet'] as const,
  ctrlfleetVehicles: ['integrations', 'ctrlfleet', 'vehicles'] as const,
  apiKeys: ['integrations', 'api-keys'] as const,
  webhooks: ['integrations', 'webhooks'] as const,
};

export interface CartrackStatus {
  configured: boolean;
  connected: boolean;
  base_url?: string;
  connected_at?: string;
  last_status_sync?: string;
}

export interface CtrlFleetStatus {
  configured: boolean;
  connected: boolean;
  connected_at?: string;
  last_vehicle_sync?: string;
  matched_vehicles?: number;
}

export interface CtrlFleetVehicle {
  licence_number: string | null;
  vehicle_code: string;
  type: string | null;
  device_name?: string | null;
  matched_vehicle_id: number | null;
  matched_vehicle_plate: string | null;
}

export interface TruckwysVehicle {
  id: number;
  plate: string;
  make?: string | null;
  model?: string | null;
  ctrlfleet_vehicle_code?: string | null;
}

export interface CtrlFleetVehiclesResponse {
  ctrlfleet_vehicles: CtrlFleetVehicle[];
  truckwys_vehicles: TruckwysVehicle[];
}

export interface SyncResult {
  matched?: number;
  total?: number;
  updated?: number;
  checked?: number;
}

export interface ApiKey {
  id: number;
  name: string;
  /** Masked by the server ("••••••••abcd") on every read except the create response. */
  key: string;
  created_at: string;
  last_used_at?: string | null;
}

export interface Webhook {
  id: number;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export const WEBHOOK_EVENTS = [
  'booking.created',
  'booking.updated',
  'booking.completed',
  'invoice.created',
  'invoice.paid',
  'payment.received',
] as const;

export const integrationsApi = {
  connectCartrack: (body: { username: string; password: string; base_url: string }) =>
    postData({ url: INT_URL.cartrackConnect, data: body }),
  connectCtrlFleet: (apiKey: string) =>
    postData<{ sync?: SyncResult }>({ url: INT_URL.ctrlfleetConnect, data: { api_key: apiKey } }),
  disconnectCtrlFleet: () => postData({ url: INT_URL.ctrlfleetDisconnect, data: {} }),
  syncCtrlFleetVehicles: () =>
    postData<{ sync?: SyncResult }>({ url: INT_URL.ctrlfleetSyncVehicles, data: {} }),
  syncCtrlFleetPositions: () =>
    postData<{ sync?: SyncResult }>({ url: INT_URL.ctrlfleetSyncPositions, data: {} }),
  /** A null code unlinks. */
  linkVehicle: (vehicleId: number, code: string | null) =>
    postData({ url: INT_URL.ctrlfleetLink, data: { vehicle_id: vehicleId, ctrlfleet_vehicle_code: code } }),
  createApiKey: (name: string) => postData<ApiKey>({ url: INT_URL.apiKeys, data: { name } }),
  revokeApiKey: (id: number) => deleteData({ url: INT_URL.apiKey(id) }),
  createWebhook: (url: string, events: string[]) =>
    postData({ url: INT_URL.webhooks, data: { url, events } }),
  testWebhook: (id: number) => postData({ url: INT_URL.webhookTest(id), data: {} }),
  deleteWebhook: (id: number) => deleteData({ url: INT_URL.webhook(id) }),
};

/** Re-read everything on the Integrations page. */
export const invalidateIntegrations = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: INT_KEYS.all });

/** A CtrlFleet link, unlink, sync or disconnect also changes the vehicle list. */
export const invalidateCtrlFleet = (qc: QueryClient) => {
  void qc.invalidateQueries({ queryKey: INT_KEYS.ctrlfleet });
  invalidateFor(qc, 'vehicle');
};

// ---------------------------------------------------------------- hooks

export function useCartrackStatus() {
  return useQuery<CartrackStatus>({
    queryKey: INT_KEYS.cartrack,
    // Like the web: a failed status call reads as "not connected" rather than an error card.
    queryFn: () =>
      fetchData<CartrackStatus>(INT_URL.cartrackStatus).catch(() => ({ configured: false, connected: false })),
    staleTime: 30_000,
  });
}

export function useCtrlFleetStatus() {
  return useQuery<CtrlFleetStatus>({
    queryKey: INT_KEYS.ctrlfleet,
    queryFn: () =>
      fetchData<CtrlFleetStatus>(INT_URL.ctrlfleetStatus).catch(() => ({ configured: false, connected: false })),
    staleTime: 30_000,
  });
}

/** CtrlFleet's roster plus our own vehicles, fetched live — only while the sheet is open. */
export function useCtrlFleetVehicles(enabled: boolean) {
  return useQuery<CtrlFleetVehiclesResponse>({
    queryKey: INT_KEYS.ctrlfleetVehicles,
    queryFn: async () => {
      const d = await fetchData<Partial<CtrlFleetVehiclesResponse>>(INT_URL.ctrlfleetVehicles);
      return { ctrlfleet_vehicles: d.ctrlfleet_vehicles ?? [], truckwys_vehicles: d.truckwys_vehicles ?? [] };
    },
    enabled,
    retry: 1,
  });
}

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: INT_KEYS.apiKeys,
    queryFn: async () => asArray<ApiKey>(await fetchData(INT_URL.apiKeys)),
    staleTime: 30_000,
  });
}

export function useWebhooks() {
  return useQuery<Webhook[]>({
    queryKey: INT_KEYS.webhooks,
    queryFn: async () => asArray<Webhook>(await fetchData(INT_URL.webhooks)),
    staleTime: 30_000,
  });
}

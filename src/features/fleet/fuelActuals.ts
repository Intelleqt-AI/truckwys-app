import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetchData, postData } from '@/lib/api/client';
import type { FuelActuals, VehicleTypeFuel } from '@/features/bookings/quote/fleetFuel';

// Measured fuel use per truck from Cartrack (FLEET-ACTUALS-CLIENT-SPEC.md):
// the data behind Settings › Vehicle types and a truck's "Fuel use" card.
// Display rules live in features/bookings/quote/fleetFuel.ts (byte-identical to
// the web's lib/fleetFuel.ts).

export const FUEL_ACTUALS_KEY = ['fleet-fuel-actuals'] as const;

/** GET fleet/fuel-actuals/, polled every 20 s while a refresh is queued (web useFleetFuel). */
export function useFleetFuel() {
  return useQuery<FuelActuals | null>({
    queryKey: FUEL_ACTUALS_KEY,
    queryFn: async () => (await fetchData<FuelActuals>('fleet/fuel-actuals/')) ?? null,
    // An older backend (or a role that can't read it) just has no fuel-use detail.
    retry: false,
    refetchInterval: (query) => (query.state.data?.refresh_queued ? 20_000 : false),
  });
}

/** Patch the cached fuel actuals in place (a queued refresh, a changed burn mode). */
export function patchFuelActuals(qc: QueryClient, fn: (d: FuelActuals) => FuelActuals) {
  qc.setQueryData<FuelActuals | null>(FUEL_ACTUALS_KEY, (d) => (d ? fn(d) : d));
}

const errorStatus = (e: unknown) => Number((e as { status?: number } | null)?.status);
const errorData = (e: unknown) => (e as { data?: Record<string, unknown> } | null)?.data ?? {};

export interface RefreshResult {
  queued: boolean;
  next_at: string | null;
}

/**
 * "Refresh now" (admin): POST fleet/fuel-actuals/refresh/ queues a job (202).
 * A 429 `refresh_cooldown` is not a failure: one refresh per 15 minutes, and
 * the answer says when the next one can run.
 */
export async function refreshFleetFuel(): Promise<RefreshResult> {
  try {
    const r = await postData<{ next_at?: string | null }>({ url: 'fleet/fuel-actuals/refresh/', data: {} });
    return { queued: true, next_at: r?.next_at ?? null };
  } catch (e) {
    if (errorStatus(e) === 429) {
      const d = errorData(e);
      return { queued: d.queued === true, next_at: typeof d.next_at === 'string' ? d.next_at : null };
    }
    throw e;
  }
}

/** Which figure a type's quotes price on: the measured one, or the typed one. */
export const setBurnMode = (typeId: number | string, mode: 'MEASURED' | 'CONFIGURED') =>
  postData<VehicleTypeFuel>({ url: `fleet/fuel-actuals/vehicle-types/${typeId}/burn-mode/`, data: { mode } });

/** The caller's own cache handle, for screens that only need to patch a row. */
export function useReplaceFuelRow() {
  const qc = useQueryClient();
  return (row: VehicleTypeFuel) =>
    patchFuelActuals(qc, (d) => ({
      ...d,
      vehicle_types: d.vehicle_types.map((x) => (String(x.id) === String(row.id) ? row : x)),
    }));
}

import { useQuery } from '@tanstack/react-query';
import { fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import { asArray } from '@/lib/api/list';
import { fetchAllRows } from '@/lib/api/fetchAllPages';
import { useInfiniteList } from '@/lib/api/useInfiniteList';
import {
  normalizeVehicle,
  normalizeDriver,
  type VehicleLite,
  type DriverLite,
  type BulkDeleteResult,
} from '@/types/domain';
import { normalizeVehicleType } from '@/features/bookings/api';

export function useVehicles() {
  return useQuery<VehicleLite[]>({
    queryKey: ['vehicles'],
    queryFn: async () => (await fetchAllRows('vehicles/')).map(normalizeVehicle),
  });
}

export function useDrivers() {
  return useQuery<DriverLite[]>({
    queryKey: ['drivers'],
    queryFn: async () => (await fetchAllRows('drivers/')).map(normalizeDriver),
  });
}

/** The Vehicles tab's tiles (`vehicles/?view=fleet`, core.services.vehicle_list), over the searched trucks. */
export interface FleetSummary {
  total: number;
  job: number;
  free: number;
  shop: number;
  out_of_service: number;
  /** Marked in use, yet no current order names the truck. */
  job_no_order: number;
  /** Marked available, yet on a current order. */
  free_on_order: number;
  /** In the workshop, yet on a current order. */
  shop_on_order: number;
  /** Available, with open orders that have all been left open. */
  free_holding: number;
  delivered: { revenue: number; loads: number; no_vehicle_revenue: number; no_vehicle_loads: number };
}

/** The tile a Vehicles filter chip sends as `?tile=`. */
export type VehicleTile = 'job' | 'free' | 'shop' | 'mismatch';

/**
 * Trucks one page at a time, the way the Vehicles tab shows them: biggest
 * delivered revenue first, searched by the server, optionally narrowed to a
 * tile. Each row carries its open order (`active_load`), `holding_open` and
 * delivered work, so the tab never loads every load for "Doing now"; page 1
 * carries the tiles as `summary`.
 */
export function useVehiclesFleet(tile: VehicleTile | null, search: string) {
  const params = new URLSearchParams({ view: 'fleet', sort: 'revenue' });
  if (tile) params.set('tile', tile);
  if (search) params.set('search', search);
  return useInfiniteList<VehicleLite, { summary?: FleetSummary }>(
    ['vehicles', 'fleet', tile ?? 'all', search],
    `vehicles/?${params.toString()}`,
    normalizeVehicle,
    { pageSize: 20, keepPrevious: true },
  );
}

/** The Drivers tab's tiles (`drivers/?view=fleet`, core.services.driver_list), over the searched drivers (the status chip does not narrow them). */
export interface DriversSummary {
  /** ALL, ACTIVE, INACTIVE, ON_LEAVE. */
  status_counts: Record<string, number>;
  expired_count: number;
  expired_names: string[];
  next_renewal: { name: string; date: string } | null;
  renew_soon: number;
  delivered_loads: number;
  no_driver_loads: number;
}

/** Drivers one page at a time, status and search done by the server; each row carries `open_load_number`. */
export function useDriversFleet(status: string, search: string) {
  const params = new URLSearchParams({ view: 'fleet' });
  if (status !== 'ALL') params.set('status', status);
  if (search) params.set('search', search);
  return useInfiniteList<DriverLite, { summary?: DriversSummary }>(
    ['drivers', 'fleet', status, search],
    `drivers/?${params.toString()}`,
    normalizeDriver,
    { pageSize: 20, keepPrevious: true },
  );
}

export function useVehicle(id: string | number, preview?: Record<string, unknown>, enabled = true) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['vehicle', id],
    queryFn: () => fetchData(`vehicles/${id}/`),
    initialData: preview,
    // Matches useDriver's gate — AddVehicleScreen calls this unconditionally
    // (create or edit) and must not fire `GET vehicles//` when there's no id.
    enabled: enabled && !!id,
  });
}

// Loads for one vehicle — powers the Financial Profile tab (web derives the
// revenue/utilisation numbers from this list; no dedicated financial endpoint).
export function useVehicleLoads(id: string | number) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: ['vehicle-loads', id],
    queryFn: async () => asArray(await fetchData(`loads/?vehicle=${id}&page_size=50`)),
    enabled: !!id,
  });
}

export function useDriver(id: string | number, preview?: Record<string, unknown>, enabled = true) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['driver', id],
    queryFn: () => fetchData(`drivers/${id}/`),
    initialData: preview,
    enabled: enabled && !!id,
  });
}

// Loads for one driver — powers the driver-detail Recent loads block.
export function useDriverLoads(id: string | number) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: ['driver-loads', id],
    queryFn: async () => asArray(await fetchData(`loads/?driver=${id}&page_size=50`)),
    enabled: !!id,
  });
}

/** capacity is in tons here — the Vehicle form displays tons and sends kg. */
export interface VehicleTypeOption {
  id: number | string;
  name: string;
  capacity?: number;
}

export function useVehicleTypesList() {
  return useQuery<VehicleTypeOption[]>({
    queryKey: ['vehicle-types'],
    // Shares its query key with bookings/api.ts's useVehicleTypes and
    // SettingsScreen's own vehicle-types query — see normalizeVehicleType's
    // comment. Must use the same normalizer, or whichever of the three
    // queryFns actually fetches leaves the other two reading raw decimal
    // strings ("14.00") out of the shared cache entry.
    queryFn: async () => asArray(await fetchData('vehicle-types/')).map(normalizeVehicleType),
  });
}

export const VEHICLE_STATUSES = [
  'AVAILABLE',
  'IN_USE',
  'MAINTENANCE',
  'OUT_OF_SERVICE',
  'INACTIVE',
] as const;

export const DRIVER_STATUSES = ['ACTIVE', 'INACTIVE', 'ON_LEAVE'] as const;

export const createVehicle = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'vehicles/', data });

export const updateVehicle = (id: string | number, data: Record<string, unknown>) =>
  patchData({ url: `vehicles/${id}/`, data });

export const deleteVehicle = (id: string | number) => deleteData({ url: `vehicles/${id}/` });

// Partial success on purpose: vehicles are PROTECTed by their trips, so some
// of a selection will often be undeletable — see core/views_bulk_delete.py.
export const bulkDeleteVehicles = (ids: (number | string)[]) =>
  postData<BulkDeleteResult>({ url: 'vehicles/bulk-delete/', data: { ids } });

export const createUser = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'users/', data });

export const updateUser = (id: string | number, data: Record<string, unknown>) =>
  patchData({ url: `users/${id}/`, data });

export const createDriver = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'drivers/', data });

export const updateDriver = (id: string | number, data: Record<string, unknown>) =>
  patchData({ url: `drivers/${id}/`, data });

export const deleteDriver = (id: string | number) => deleteData({ url: `drivers/${id}/` });

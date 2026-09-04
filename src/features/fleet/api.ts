import { useQuery } from '@tanstack/react-query';
import { fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import { asArray } from '@/lib/api/list';
import {
  normalizeVehicle,
  normalizeDriver,
  type VehicleLite,
  type DriverLite,
} from '@/types/domain';
import { normalizeVehicleType } from '@/features/bookings/api';

export function useVehicles() {
  return useQuery<VehicleLite[]>({
    queryKey: ['vehicles'],
    queryFn: async () => asArray(await fetchData('vehicles/')).map(normalizeVehicle),
  });
}

export function useDrivers() {
  return useQuery<DriverLite[]>({
    queryKey: ['drivers'],
    queryFn: async () => asArray(await fetchData('drivers/')).map(normalizeDriver),
  });
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

export const createUser = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'users/', data });

export const updateUser = (id: string | number, data: Record<string, unknown>) =>
  patchData({ url: `users/${id}/`, data });

export const createDriver = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'drivers/', data });

export const updateDriver = (id: string | number, data: Record<string, unknown>) =>
  patchData({ url: `drivers/${id}/`, data });

export const deleteDriver = (id: string | number) => deleteData({ url: `drivers/${id}/` });

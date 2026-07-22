import { useQuery } from '@tanstack/react-query';
import { fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import { asArray } from '@/lib/api/list';
import {
  normalizeVehicle,
  normalizeDriver,
  type VehicleLite,
  type DriverLite,
} from '@/types/domain';

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

export function useVehicle(id: string | number, preview?: Record<string, unknown>) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['vehicle', id],
    queryFn: () => fetchData(`vehicles/${id}/`),
    initialData: preview,
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

export function useVehicleTypesList() {
  return useQuery<{ id: number | string; name: string }[]>({
    queryKey: ['vehicle-types'],
    queryFn: async () => asArray<{ id: number | string; name: string }>(await fetchData('vehicle-types/')),
  });
}

export const VEHICLE_STATUSES = [
  'AVAILABLE',
  'IN_USE',
  'MAINTENANCE',
  'OUT_OF_SERVICE',
  'INACTIVE',
] as const;

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

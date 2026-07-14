import { useQuery } from '@tanstack/react-query';
import { fetchData, patchData, deleteData } from '@/lib/api/client';
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

export function useDriver(id: string | number, preview?: Record<string, unknown>) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['driver', id],
    queryFn: () => fetchData(`drivers/${id}/`),
    initialData: preview,
  });
}

export const VEHICLE_STATUSES = [
  'AVAILABLE',
  'IN_USE',
  'MAINTENANCE',
  'OUT_OF_SERVICE',
  'INACTIVE',
] as const;

export const updateVehicle = (id: string | number, data: Record<string, unknown>) =>
  patchData({ url: `vehicles/${id}/`, data });

export const deleteVehicle = (id: string | number) => deleteData({ url: `vehicles/${id}/` });

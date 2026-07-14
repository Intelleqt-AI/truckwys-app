import { useQuery } from '@tanstack/react-query';
import { fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import { asArray } from '@/lib/api/list';
import { normalizeCustomer, type CustomerLite } from '@/types/domain';

export function useCustomers() {
  return useQuery<CustomerLite[]>({
    queryKey: ['customers'],
    queryFn: async () => asArray(await fetchData('customers/')).map(normalizeCustomer),
  });
}

export function useCustomer(id: string | number, preview?: Record<string, unknown>) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['customer', id],
    queryFn: () => fetchData(`customers/${id}/`),
    initialData: preview,
  });
}

export function useCustomerRisk(id: string | number) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['customer-risk', id],
    queryFn: () => fetchData(`customers/${id}/risk-profile/`),
    retry: false,
  });
}

export const createCustomer = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'customers/', data });

export const updateCustomer = (id: string | number, data: Record<string, unknown>) =>
  patchData({ url: `customers/${id}/`, data });

export const deleteCustomer = (id: string | number) => deleteData({ url: `customers/${id}/` });

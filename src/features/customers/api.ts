import { useQuery } from '@tanstack/react-query';
import { fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import { asArray } from '@/lib/api/list';
import { fetchAllRows } from '@/lib/api/fetchAllPages';
import { useInfiniteList } from '@/lib/api/useInfiniteList';
import { normalizeCustomer, type CustomerLite, type BulkDeleteResult } from '@/types/domain';

export function useCustomers() {
  return useQuery<CustomerLite[]>({
    queryKey: ['customers'],
    queryFn: async () => (await fetchAllRows('customers/')).map(normalizeCustomer),
  });
}

/** The Customers screen's sort menu (the API's `?sort=`). */
export type CustomerSort = 'name_asc' | 'owed' | 'overdue' | 'newest';

/** Page-wide figures the Customers list sends with page 1. */
export interface CustomerFlags {
  /** Overdue across every customer of the company (incl. VAT). */
  total_overdue: number;
  any_partly_late: boolean;
  any_inactive: boolean;
}

/**
 * Customers one page at a time, searched (name, company, email, phone, city)
 * and sorted by the server. Each row carries what that customer owes
 * (`owed_amount`, `overdue_amount`, `oldest_overdue_due`), so the screen never
 * loads the invoice ledger. Keyed under 'customers' so customer, invoice and
 * payment events refresh it.
 */
export function useCustomersList(sort: CustomerSort, search: string) {
  const params = new URLSearchParams({ sort });
  if (search) params.set('search', search);
  return useInfiniteList<CustomerLite, { flags?: CustomerFlags }>(
    ['customers', 'list', sort, search],
    `customers/?${params.toString()}`,
    normalizeCustomer,
    { pageSize: 20, keepPrevious: true },
  );
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

// Quotes for one customer — powers the customer-detail Quotes block.
export function useCustomerQuotes(id: string | number) {
  return useQuery<Record<string, unknown>[]>({
    queryKey: ['customer-quotes', id],
    queryFn: async () => asArray(await fetchData(`quotes/?customer=${id}&page_size=50`)),
    enabled: !!id,
  });
}

export const createCustomer = (data: Record<string, unknown>) =>
  postData<Record<string, unknown>>({ url: 'customers/', data });

export const updateCustomer = (id: string | number, data: Record<string, unknown>) =>
  patchData({ url: `customers/${id}/`, data });

export const deleteCustomer = (id: string | number) => deleteData({ url: `customers/${id}/` });

// Partial success on purpose: customers are PROTECTed by their quotes,
// invoices and loads, so in any real fleet some of a selection will be
// undeletable — see core/views_bulk_delete.py on the backend.
export const bulkDeleteCustomers = (ids: (number | string)[]) =>
  postData<BulkDeleteResult>({ url: 'customers/bulk-delete/', data: { ids } });

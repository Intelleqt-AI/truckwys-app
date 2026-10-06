import { useQuery } from '@tanstack/react-query';
import { useInfiniteList } from '@/lib/api/useInfiniteList';
import { fetchData, postData, patchData, deleteData } from '@/lib/api/client';
import { fetchAllRows } from '@/lib/api/fetchAllPages';
import { DEFAULT_TAX_CODES } from './tax';
import type {
  CreditNote,
  CreditNoteCreateInput,
  FinanceSettings,
  FinanceSettingsInput,
  Payment,
  PaymentUpdateInput,
  Supplier,
  SupplierInput,
  TaxCode,
  TaxCodesResponse,
} from './types';

// Endpoints added by the backend "Foundation" release. Queries are keyed so
// lib/queryInvalidation.ts refreshes them: `credit-notes`, `credit-note`,
// `suppliers`, `finance-settings`, `tax-codes`.

// ── Tax codes ───────────────────────────────────────────────────────────────

const FALLBACK_TAX_CODES: TaxCodesResponse = { codes: DEFAULT_TAX_CODES, default_tax_code: 'STANDARD' };

/**
 * The tax codes this company may use, with rates. A company that isn't
 * VAT-registered is only offered NO_VAT. Falls back to the standard South
 * African list when the call fails, so a line can still be priced.
 */
export function useTaxCodes() {
  return useQuery<TaxCodesResponse>({
    queryKey: ['tax-codes'],
    queryFn: async () => {
      try {
        const res = await fetchData<Partial<TaxCodesResponse>>('invoices/tax-codes/');
        return res?.codes?.length
          ? { codes: res.codes, default_tax_code: (res.default_tax_code ?? 'STANDARD') as TaxCode }
          : FALLBACK_TAX_CODES;
      } catch {
        return FALLBACK_TAX_CODES;
      }
    },
    staleTime: 60 * 60_000,
  });
}

// ── Credit notes ────────────────────────────────────────────────────────────

export function useCreditNotes(filters?: { invoice?: number | string; customer?: number | string }) {
  const params = new URLSearchParams();
  if (filters?.invoice) params.set('invoice', String(filters.invoice));
  if (filters?.customer) params.set('customer', String(filters.customer));
  const qs = params.toString();
  return useQuery<CreditNote[]>({
    queryKey: ['credit-notes', qs],
    queryFn: () => fetchAllRows<CreditNote>(`credit-notes/${qs ? `?${qs}` : ''}`),
  });
}

const asCreditNote = (raw: Record<string, unknown>) => raw as unknown as CreditNote;

/**
 * Credit notes, newest first, status and search (number, invoice, customer,
 * reason) done by the server. Page 1 also carries `status_counts` (ALL, ISSUED,
 * VOID over every credit note) and `issued_total` (over the filtered ones).
 */
export function useCreditNotesList(status: string, search: string) {
  const params = new URLSearchParams();
  if (status !== 'ALL') params.set('status', status);
  if (search) params.set('search', search);
  const qs = params.toString();
  return useInfiniteList<CreditNote, { status_counts?: Record<string, number>; issued_total?: number }>(
    ['credit-notes', 'list', status, search],
    `credit-notes/${qs ? `?${qs}` : ''}`,
    asCreditNote,
    { pageSize: 20, keepPrevious: true },
  );
}

export function useCreditNote(id: string | number, enabled = true) {
  return useQuery<CreditNote>({
    queryKey: ['credit-note', id],
    queryFn: () => fetchData<CreditNote>(`credit-notes/${id}/`),
    enabled: enabled && !!id,
  });
}

export const createCreditNote = (data: CreditNoteCreateInput) =>
  postData<CreditNote>({ url: 'credit-notes/', data });

export const voidCreditNote = (id: string | number, reason: string) =>
  postData<CreditNote>({ url: `credit-notes/${id}/void/`, data: { reason } });

// ── Invoice actions ─────────────────────────────────────────────────────────

/** Void an issued invoice. The server refuses one with payments, credit notes or a Fast Pay advance. */
export const voidInvoice = (id: string | number, reason: string) =>
  postData<Record<string, unknown>>({ url: `invoices/${id}/void/`, data: { reason } });

/** Delete a draft. Anything already issued answers 400 `invoice_locked`: void it instead. */
export const deleteInvoice = (id: string | number) => deleteData({ url: `invoices/${id}/` });

// ── Payments ────────────────────────────────────────────────────────────────

/** Edit a payment recorded in TruckWys. Synced payments (Xero, QuickBooks) can't be changed here. */
export const updatePayment = (id: string | number, data: PaymentUpdateInput) =>
  patchData<Payment>({ url: `payments/${id}/`, data });

/** Delete a payment recorded in TruckWys; the invoice is re-derived. */
export const deletePayment = (id: string | number) => deleteData({ url: `payments/${id}/` });

// ── Suppliers ───────────────────────────────────────────────────────────────

export function useSuppliers() {
  return useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => fetchAllRows<Supplier>('suppliers/'),
  });
}

const asSupplier = (raw: Record<string, unknown>) => raw as unknown as Supplier;

/**
 * Suppliers by name, with the server doing the search (name, VAT or
 * registration number, email) and the active filter. Page 1 carries `counts`
 * (ACTIVE, INACTIVE, ALL) over every supplier of the company.
 */
export function useSuppliersList(active: 'ALL' | 'ACTIVE' | 'INACTIVE', search: string) {
  const params = new URLSearchParams();
  if (active !== 'ALL') params.set('is_active', active === 'ACTIVE' ? 'true' : 'false');
  if (search) params.set('search', search);
  const qs = params.toString();
  return useInfiniteList<Supplier, { counts?: Record<string, number> }>(
    ['suppliers', 'list', active, search],
    `suppliers/${qs ? `?${qs}` : ''}`,
    asSupplier,
    { pageSize: 20, keepPrevious: true },
  );
}

export const createSupplier = (data: Partial<SupplierInput> & { name: string }) =>
  postData<Supplier>({ url: 'suppliers/', data });

export const updateSupplier = (id: string | number, data: Partial<SupplierInput>) =>
  patchData<Supplier>({ url: `suppliers/${id}/`, data });

/** A supplier with expenses answers 400: deactivate it instead. */
export const deleteSupplier = (id: string | number) => deleteData({ url: `suppliers/${id}/` });

// ── Invoice numbering ───────────────────────────────────────────────────────

export function useFinanceSettings() {
  return useQuery<FinanceSettings>({
    queryKey: ['finance-settings'],
    queryFn: () => fetchData<FinanceSettings>('finance/settings/'),
  });
}

/** Admin only. The server refuses a next number at or below one already issued. */
export const updateFinanceSettings = (data: FinanceSettingsInput) =>
  patchData<FinanceSettings>({ url: 'finance/settings/', data });

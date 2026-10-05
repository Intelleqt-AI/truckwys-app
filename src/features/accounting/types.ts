/**
 * Accounting integrations (Xero, QuickBooks Online; Sage is listed as coming
 * soon): types and provider display config. Port of the web's
 * lib/accounting.ts. Provider-neutral: the provider only appears in URLs (its
 * slug) and in PROVIDERS below.
 *
 * Base path: api/v1/integrations/accounting/. Reads are open to any company
 * user; writes are company-admin only (403 with the backend's sentence).
 */
import type { AccountingSync, DocumentSyncStatus } from '@/lib/finance/types';

export type { AccountingSync, DocumentSyncStatus };

// ---------------------------------------------------------------- providers

export type ProviderCode = 'XERO' | 'QBO' | 'SAGE';
export type ProviderSlug = 'xero' | 'quickbooks' | 'sage';

export interface ProviderConfig {
  code: ProviderCode;
  slug: ProviderSlug;
  /** Full product name, for headings and cards. */
  name: string;
  /** Short name for buttons and badges ("Record in Xero", "From QuickBooks"). */
  short: string;
  /** Lettermark for the provider tile, used where there is no logo (Sage). */
  initials: string;
  /** Tile colours for that lettermark. */
  mark: { bg: string; fg: string };
  /** One line under the card title. */
  blurb: string;
  /** What the provider calls one set of books. */
  orgWord: 'organisation' | 'company';
  /** Account codes people recognise (Xero "200") or internal ids we shouldn't show (QuickBooks). */
  showAccountCodes: boolean;
  /** Revenue types map to accounts (Xero) or products/services (QuickBooks items). */
  revenueTarget: 'account' | 'item';
  /** Tracking row labels; `vehicleCat`/`branchCatId` pin the category id when the provider has fixed ones. */
  tracking: { vehicle: string; branchCat: string; branch: string; vehicleCat?: string; branchCatId?: string };
}

const XERO_TRACKING = { vehicle: 'Vehicle category', branchCat: 'Branch category', branch: 'Branch' };

/** Display config keyed by provider code. The server says which are available. */
export const PROVIDERS: Record<ProviderCode, ProviderConfig> = {
  XERO: {
    code: 'XERO',
    slug: 'xero',
    name: 'Xero',
    short: 'Xero',
    initials: 'X',
    mark: { bg: '#13B5EA', fg: '#FFFFFF' },
    blurb: 'Invoices, credit notes and bills go to Xero; payments come back.',
    orgWord: 'organisation',
    revenueTarget: 'account',
    showAccountCodes: true,
    tracking: XERO_TRACKING,
  },
  QBO: {
    code: 'QBO',
    slug: 'quickbooks',
    name: 'QuickBooks Online',
    short: 'QuickBooks',
    initials: 'qb',
    mark: { bg: '#2CA01C', fg: '#FFFFFF' },
    blurb: 'Invoices, credit notes and bills go to QuickBooks; payments come back.',
    orgWord: 'company',
    revenueTarget: 'item',
    showAccountCodes: false,
    tracking: {
      vehicle: 'Vehicle (Class)',
      branchCat: 'Branch (Location)',
      branch: 'Location',
      vehicleCat: 'class',
      branchCatId: 'location',
    },
  },
  SAGE: {
    code: 'SAGE',
    slug: 'sage',
    name: 'Sage Business Cloud Accounting',
    short: 'Sage',
    initials: 'S',
    mark: { bg: '#00D639', fg: '#000000' },
    blurb: 'Invoices, credit notes and bills go to Sage; payments come back.',
    orgWord: 'organisation',
    revenueTarget: 'account',
    showAccountCodes: true,
    tracking: XERO_TRACKING,
  },
};

export const PROVIDER_ORDER: ProviderCode[] = ['XERO', 'QBO', 'SAGE'];

export const providerConfig = (code: string | null | undefined): ProviderConfig =>
  PROVIDERS[(code ?? '').toUpperCase() as ProviderCode] ?? PROVIDERS.XERO;

export const providerBySlug = (slug: string | null | undefined): ProviderConfig | null =>
  Object.values(PROVIDERS).find((p) => p.slug === (slug ?? '').toLowerCase()) ?? null;

// ---------------------------------------------------------------- types

/** Money as the API sends it: a 2-dp string ("1234.50"). */
export type Money = string;

export type ConnectionStatus = 'PENDING_ORG' | 'ACTIVE' | 'NEEDS_REAUTH' | 'DISABLED';
export type BackfillState = 'NOT_STARTED' | 'RUNNING' | 'DONE' | 'FAILED';

export interface ProviderInfo {
  provider: ProviderCode;
  slug: ProviderSlug;
  name: string;
  availability: 'available' | 'coming_soon';
  configured: boolean;
}

export interface PendingTenant {
  tenant_id: string;
  name: string;
  currency: string;
}

export interface Readiness {
  mapping_complete: boolean;
  missing_mappings: string[];
  contacts_to_confirm: number;
  backfill_state: BackfillState;
  sync_enabled: boolean;
  blocking_reasons: string[];
}

export interface SyncCounts {
  queued: number;
  synced: number;
  errors: number;
  dead: number;
}

export interface Connection {
  id: number;
  provider: ProviderCode;
  provider_name: string;
  status: ConnectionStatus;
  status_reason: string;
  tenant_id: string;
  tenant_name: string;
  base_currency: string;
  pending_tenants?: PendingTenant[];
  connected_at: string | null;
  connected_by: string;
  last_payment_sync_at: string | null;
  last_reconciled_at: string | null;
  cutover_date: string | null;
  payments_managed_externally: boolean;
  readiness: Readiness;
  counts: SyncCounts;
  web_url: string | null;
}

export interface ProvidersResponse {
  providers: ProviderInfo[];
  connection: Connection | null;
}

// Mapping
export interface AccountRow {
  key: string;
  label: string;
  account_code: string | null;
}
export interface TaxRow {
  key: string;
  label: string;
  rate: Money;
  tax_code: string | null;
}
export interface TrackingMapping {
  vehicle_category_id: string | null;
  branch_category_id: string | null;
  branch_option: string;
}
export interface ProviderAccount {
  code: string;
  name: string;
  type: string;
  class: string;
  is_bank: boolean;
}
export interface ProviderTaxRate {
  code: string;
  name: string;
  rate: Money;
  revenue: boolean;
  expenses: boolean;
}
export interface TrackingCategory {
  id: string;
  name: string;
  options: { id: string; name: string }[];
}

export type MappingSection = 'revenue_types' | 'expense_categories' | 'tax_sales' | 'tax_purchases';

export interface Mapping {
  revenue_types: AccountRow[];
  expense_categories: AccountRow[];
  tax_sales: TaxRow[];
  tax_purchases: TaxRow[];
  receipts_account: string | null;
  tracking: TrackingMapping;
  options: {
    accounts: ProviderAccount[];
    tax_rates: ProviderTaxRate[];
    tracking_categories: TrackingCategory[];
    fetched_at: string | null;
  };
  suggestions: Partial<Record<MappingSection, Record<string, string>>>;
  complete: boolean;
  missing: string[];
}

export interface MappingUpdate {
  revenue_types?: Record<string, string | null>;
  expense_categories?: Record<string, string | null>;
  tax_sales?: Record<string, string | null>;
  tax_purchases?: Record<string, string | null>;
  receipts_account?: string | null;
  tracking?: TrackingMapping;
}

// Contacts
export type ContactStatus = 'SUGGESTED' | 'MATCHED' | 'UNMATCHED' | 'CREATE' | 'SKIPPED';
export type ContactKind = 'CUSTOMER' | 'SUPPLIER';
export type MatchMethod = 'external_id' | 'vat' | 'registration' | 'email' | 'name' | 'created' | 'manual';

export interface ProviderContact {
  external_id: string;
  name: string;
  vat: string;
  email: string;
}
export interface ContactCandidate extends ProviderContact {
  method: MatchMethod | string;
}

export interface ContactMatch {
  id: number;
  kind: ContactKind;
  local_id: number;
  local_name: string;
  local_vat: string;
  local_registration: string;
  local_email: string;
  status: ContactStatus;
  method: MatchMethod | null;
  external_id: string | null;
  external_name: string | null;
  candidates: ContactCandidate[];
}

export type ContactSummary = Partial<Record<ContactStatus, number>>;

export interface ContactsResponse {
  results: ContactMatch[];
  summary: ContactSummary;
}

export type ContactConfirmBody = { external_id: string } | { action: 'create' } | { action: 'skip' };

// Backfill
export type StepState = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'SKIPPED';
export interface BackfillStep {
  key: string;
  label: string;
  state: StepState;
  count: number;
  error: string;
}
export interface BackfillPreview {
  invoices: number;
  credit_notes: number;
  bills: number;
  historic_receipts: number;
  contacts_unconfirmed: number;
}
export interface Backfill {
  state: BackfillState;
  cutover_date: string | null;
  started_at: string | null;
  finished_at: string | null;
  steps: BackfillStep[];
  preview: BackfillPreview | null;
}

// Sync
export interface SyncEvent {
  id: number;
  created_at: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  action: string;
  object_type: string;
  local_id: number | null;
  label: string;
  message: string;
}
export type LinkObjectType = 'INVOICE' | 'CREDIT_NOTE' | 'BILL' | 'CONTACT_CUSTOMER' | 'CONTACT_SUPPLIER';
export interface LinkError {
  id: number;
  object_type: LinkObjectType | string;
  local_id: number | null;
  label: string;
  status: 'ERROR' | 'DEAD' | 'BLOCKED' | string;
  last_error: string;
  attempts: number;
  next_attempt_at: string | null;
  local_url: string | null;
}
export interface SyncStatus {
  counts: SyncCounts;
  last_payment_sync_at: string | null;
  recent: SyncEvent[];
  errors: LinkError[];
}

// Reconciliation
export type ReconScope = 'INVOICE' | 'CUSTOMER' | 'MONTH';
export interface ReconRun {
  id: number;
  ran_at: string;
  status: 'OK' | 'DIFFERENCES' | 'FAILED';
  error: string;
  checked: { invoices?: number; customers?: number; months?: number };
  difference_count: number;
}
export interface ReconDifference {
  id: number;
  scope: ReconScope;
  key: string;
  label: string;
  field: string;
  truckwys: string;
  provider: string;
  difference: string;
  local_url: string | null;
  provider_url: string | null;
}
export interface Reconciliation {
  run: ReconRun | null;
  differences: ReconDifference[];
}

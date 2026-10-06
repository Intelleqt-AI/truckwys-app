/**
 * Fast Pay (capital) API shapes for the transporter, from the backend contract
 * (core/capital/present.py, core/views_fastpay.py). The server is the only
 * source of every figure: the app formats these values and never derives fees
 * or advances itself. Money is rand (JSON numbers, 2 decimals); dates are ISO
 * strings. Port of the web's lib/capital/types.ts (the capital desk, for funder
 * staff, is not part of the app).
 */

export type ReasonDirection = '+' | '-' | '!';

/** Transporter-safe wording. */
export interface Reason {
  code: string;
  direction: ReasonDirection;
  text: string;
}

export type Decision = 'FUND' | 'PART_FUND' | 'QUEUE' | 'REFER' | 'DECLINE';

export type VerificationTier = 'V0' | 'V1' | 'V2' | 'V3';

export type AdvanceStatus =
  | 'QUEUED'
  | 'REQUESTED'
  | 'SCORING'
  | 'APPROVED'
  | 'DENIED'
  | 'DISBURSED'
  | 'SETTLED'
  | 'CANCELLED'
  | 'BOUGHT_BACK'
  | 'WRITTEN_OFF'
  | 'ELIGIBLE';

export interface OfferAdvanceRef {
  id: number;
  status: AdvanceStatus;
  status_label: string;
}

/** One invoice's Fast Pay evaluation. */
export interface Offer {
  /** Persisted assessment id; null for list previews. */
  offer_id: number | null;
  invoice_id: number;
  invoice_number: string;
  customer_name: string;
  issue_date: string | null;
  due_date: string | null;
  invoice_total: number;
  invoice_balance: number;
  decision: Decision;
  eligible: boolean;
  advance_rate_pct: number;
  eligible_amount: number;
  /** Advanced now. */
  fundable_amount: number;
  /** Part-fund remainder waiting for capacity. */
  queued_amount: number;
  fee_pct: number;
  /** Excl. VAT. */
  fee_amount: number;
  /** VAT on the platform-fee part only. */
  fee_vat_amount: number;
  /** What the transporter receives now. */
  net_payout: number;
  /** Paid to the transporter when the customer pays, less deductions. */
  holdback_amount: number;
  expected_payment_date: string | null;
  verification_tier: VerificationTier;
  reasons: Reason[];
  explanation: string;
  /** The figures hold until then (48 hours). */
  valid_until: string | null;
  advance: OfferAdvanceRef | null;
  demo: boolean;
}

export interface TimelineEntry {
  at: string;
  label: string;
}

export interface AdvanceRow {
  id: number;
  reference: string;
  invoice_id: number;
  invoice_number: string;
  customer_name: string;
  status: AdvanceStatus;
  status_label: string;
  amount: number;
  fee_amount: number;
  fee_vat_amount: number;
  net_amount: number;
  holdback_amount: number;
  topup_pending: number;
  queue_position: number | null;
  requested_at: string | null;
  approved_at: string | null;
  disbursed_at: string | null;
  settled_at: string | null;
  queued_at: string | null;
  denial_reason: string | null;
  reasons: Reason[];
  timeline: TimelineEntry[];
  can_cancel: boolean;
}

// ---- Transporter: status and application -------------------------------

export type ApplicationStatus = 'NOT_STARTED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface ConsentRecord {
  purpose: string;
  text_version: string;
  granted_at: string;
}

export interface RequiredConsent {
  purpose: string;
  title: string;
  text: string;
}

export interface Application {
  status: ApplicationStatus;
  juristic_person: boolean | null;
  declared_annual_turnover: number | null;
  git_insurer: string | null;
  git_insurance_expiry: string | null;
  consents: ConsentRecord[];
  required_consents: RequiredConsent[];
  /** Plain-language checklist of what is still needed. */
  missing: string[];
  submitted_at: string | null;
}

export type ApplicationPatch = Partial<
  Pick<Application, 'juristic_person' | 'declared_annual_turnover' | 'git_insurer' | 'git_insurance_expiry'>
>;

export interface CreditLine {
  limit: number;
  used: number;
  available: number;
}

export interface CapitalStatus {
  launched: boolean;
  can_request: boolean;
  demo: boolean;
  /** A: the funder approves each advance. B: the funder's policy decides. */
  mode: 'A' | 'B';
  application: Application;
  line: CreditLine | null;
  provider_label: string;
}

export interface FastPayInvoices {
  offers: Offer[];
  ineligible: Offer[];
  totals: { eligible_count: number; fundable_total: number; net_total: number };
}

export interface RequestResult {
  advance: AdvanceRow;
  offer: Offer;
}

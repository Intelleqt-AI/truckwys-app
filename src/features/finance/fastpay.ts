import { useQuery } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';

// Fast Pay is not live (lib/features.ts CAPITAL_LAUNCHED), so nothing in the
// app applies for it; the Capital screen only shows the receivables Fast Pay
// would work on and the invoice checks that would hold invoices back.
//
// Eligibility data from capital/eligible/, shared under one query key.
//
// Eligibility is decided ENTIRELY server-side by the Fast Pay engine
// (core/capital/engine.py), exposed by capital/eligible/ with the same decision
// a request would get: invoice status, proof of delivery, age, disputes, debtor
// identity, the transporter's application and line. Do not recompute any of
// that on the device: it would silently drift from the funder's policy.
//
// In particular do NOT use the invoice's own `early_pay_eligible` column. It's
// a stored boolean that the main invoice-creation path sets to True
// unconditionally and never recomputes, which is why the badge used to appear
// on every invoice. It knows nothing about POD, disputes, facility headroom,
// invoice age, or customer risk.

export interface EligibleInvoice {
  id: number | string;
  invoice_number?: string;
  customer?: string;
  customer_id?: number;
  customer_risk_pct?: number | null;
  customer_risk_band?: string | null;
  /** Always false now; the debtor score sizes an advance, not this flag. */
  risk_blocked?: boolean;
  /** FUND | PART_FUND | QUEUE | REFER from the Fast Pay engine. */
  decision?: string;
  /** Risk-adjusted gross cap. */
  fundable_amount_zar?: number;
  /** Part of the advance queued until funding capacity frees up. */
  queued_amount_zar?: number;
  /** What actually lands in the bank, after the fee. */
  net_payout_zar?: number;
  amount?: number;
  total_amount?: number;
  fee_rate_pct?: number;
  fee_amount_zar?: number;
  fee_vat_zar?: number;
  holdback_zar?: number;
  expected_payment_date?: string | null;
  /** Transporter-facing reasons: {code, direction '+'|'-'|'!', text}. */
  reasons?: { code: string; direction: '+' | '-' | '!'; text: string }[];
  /** The engine's invoice grade (e.g. "I-A"), no longer EXCELLENT/GOOD/... */
  risk_tier?: string;
  tier?: string;
  age_days?: number;
  due_date?: string | null;
  route?: string | null;
}

export interface IneligibleInvoice {
  id: number | string;
  invoice_number?: string;
  customer?: string;
  amount?: number;
  /** Backend-authored explanation — display verbatim, don't re-word it. */
  reason?: string;
  /** Code of the first blocker (e.g. "E-POD-V0"), or "NOT_ELIGIBLE". */
  rule?: string;
  all_reasons?: string[];
}

export interface CapitalEligible {
  eligible_count: number;
  total_face_value_zar: number;
  total_net_payout_zar: number;
  invoices: EligibleInvoice[];
  ineligible_count: number;
  ineligible_invoices: IneligibleInvoice[];
}

const EMPTY: CapitalEligible = {
  eligible_count: 0,
  total_face_value_zar: 0,
  total_net_payout_zar: 0,
  invoices: [],
  ineligible_count: 0,
  ineligible_invoices: [],
};

export function useCapitalEligible() {
  return useQuery<CapitalEligible>({
    queryKey: ['capital-eligible'],
    // A company with no facility is a normal state, not an error — fail soft to
    // an empty payload so the invoice screen still renders.
    queryFn: async () => {
      try {
        const res = await fetchData<Partial<CapitalEligible>>('capital/eligible/');
        return { ...EMPTY, ...res };
      } catch {
        return EMPTY;
      }
    },
  });
}

/**
 * Blocker codes (backend core/capital/reasons.py) that describe the account,
 * not the invoice: they are true of every invoice until the transporter is set
 * up for Fast Pay, so they say nothing about any one invoice and are not listed.
 */
const ACCOUNT_LEVEL_RULES = new Set([
  'NO_FACILITY',
  'E-NO-LINE',
  'E-NO-FUNDER',
  'E-FUNDER-PAUSED',
  'E-APPLICATION',
  'E-CONSENT',
  'E-GIT',
  'E-TRANSPORTER-HOLD',
  'E-TRANSPORTER-E',
  'E-DEMO',
]);

export function isAccountLevel(inv: IneligibleInvoice): boolean {
  return !!inv.rule && ACCOUNT_LEVEL_RULES.has(inv.rule);
}

/**
 * The checks that belong to the invoice itself. Facility-dependent results
 * (limit exceeded, score threshold) mean nothing before launch, so those are
 * not listed. `codes` are matched against the row's `rule` (the first blocker);
 * `text` against the transporter-facing wording in `all_reasons`, since the
 * endpoint sends codes for the first blocker only.
 */
export const INVOICE_CHECKS: {
  key: string;
  label: string;
  codes: string[];
  text: RegExp;
}[] = [
  {
    key: 'pod',
    label: 'No proof of delivery on file',
    codes: ['E-POD-V0'],
    text: /proof of delivery/i,
  },
  {
    key: 'delivered',
    label: 'Not linked to a delivered load',
    codes: ['E-NO-LOAD', 'E-NOT-DELIVERED'],
    text: /delivered load|not marked delivered/i,
  },
  {
    key: 'age',
    label: 'Too old to fund',
    codes: ['E-INVOICE-AGE', 'E-DELIVERY-AGE'],
    text: /older than \d+ days|days after delivery/i,
  },
  {
    key: 'dispute',
    label: 'Disputed or has a credit note',
    codes: ['E-DISPUTE'],
    text: /dispute or credit note/i,
  },
  {
    key: 'customer',
    label: 'Customer details or status',
    codes: [
      'E-DEBTOR-UNIDENTIFIED',
      'E-DEBTOR-GOVERNMENT',
      'E-DEBTOR-FOREIGN',
      'E-DEBTOR-HOLD',
      'E-DEBTOR-CESSION',
      'E-DEBTOR-E',
      'E-CROSS-AGEING',
    ],
    text: /registration or VAT number|government customers|outside South Africa|this customer/i,
  },
];

/** Which invoice checks an ineligible invoice fails (keys of INVOICE_CHECKS). */
export function checksFor(inv: IneligibleInvoice): string[] {
  const reasons = inv.all_reasons?.length ? inv.all_reasons : [inv.reason ?? ''];
  return INVOICE_CHECKS.filter(
    (c) => (inv.rule && c.codes.includes(inv.rule)) || reasons.some((r) => c.text.test(r)),
  ).map((c) => c.key);
}

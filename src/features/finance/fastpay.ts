import { useQuery } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';

// Fast Pay is not live (lib/features.ts CAPITAL_LAUNCHED), so nothing in the
// app applies for it; the Capital screen only shows the receivables Fast Pay
// would work on and the invoice checks that would hold invoices back.
//
// Eligibility data from capital/eligible/, shared under one query key.
//
// Eligibility is decided ENTIRELY server-side by RiskEngine, wrapped by
// capital/eligible/, which also requires status in SENT/VIEWED/OVERDUE, no
// already-active advance, an ACTIVE facility, and applies the customer-risk
// block. Do not recompute any of that on the device: it would silently drift
// from the lender's rules.
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
  risk_blocked?: boolean;
  /** Risk-adjusted gross cap. */
  fundable_amount_zar?: number;
  /** What actually lands in the bank, after the fee. */
  net_payout_zar?: number;
  amount?: number;
  total_amount?: number;
  fee_rate_pct?: number;
  fee_amount_zar?: number;
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
 * The checks that belong to the invoice itself. Facility-dependent results
 * (limit exceeded, score threshold) mean nothing before launch, and "No active
 * facility on file" is true of every invoice, so those are not listed. Matches
 * the web's CapitalPrelaunch.
 */
export const INVOICE_CHECKS: { key: string; label: string; match: (reason: string) => boolean }[] = [
  { key: 'pod', label: 'No proof of delivery on file', match: (r) => /proof of delivery/i.test(r) },
  { key: 'age', label: 'Older than 90 days', match: (r) => /^invoice age/i.test(r) },
  { key: 'dispute', label: 'Customer is disputing the invoice', match: (r) => /dispute/i.test(r) },
  {
    key: 'inactive',
    label: 'Customer account is not active',
    match: (r) => /customer account is not active/i.test(r),
  },
];

/** Which invoice checks an ineligible invoice fails (keys of INVOICE_CHECKS). */
export function checksFor(inv: IneligibleInvoice): string[] {
  const reasons = inv.all_reasons?.length ? inv.all_reasons : [inv.reason ?? ''];
  return INVOICE_CHECKS.filter((c) => reasons.some((r) => c.match(r))).map((c) => c.key);
}

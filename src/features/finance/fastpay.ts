import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchData } from '@/lib/api/client';

// Fast Pay eligibility, shared by the invoice detail screen and the Capital
// screen so the two can never disagree — the web app uses one query key across
// its three Fast Pay surfaces for the same reason.
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

/** Ids are compared as strings: the backend sends numbers, routes carry strings. */
export const findEligible = (list: EligibleInvoice[], id: string | number) =>
  list.find((e) => String(e.id) === String(id));

export const findIneligible = (list: IneligibleInvoice[], id: string | number) =>
  list.find((e) => String(e.id) === String(id));

// Applications happen on Merchant Capital's own site, so there's nothing on our
// backend to record that one was started. Web keeps the same list in
// localStorage under this key; mobile mirrors it in AsyncStorage. Device-local
// by nature — it won't follow the user to another handset.
const APPLIED_KEY = 'mc_applied_invoice_ids';

export const MERCHANT_CAPITAL_URL =
  'https://getstarted.merchantcapital.co.za?actiontype=C_C&channel=Part_Trad&who=IA_SP';

export async function loadAppliedIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(APPLIED_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

export async function saveAppliedId(id: string | number): Promise<Set<string>> {
  const next = await loadAppliedIds();
  next.add(String(id));
  try {
    await AsyncStorage.setItem(APPLIED_KEY, JSON.stringify([...next]));
  } catch {
    // Losing the flag only means the button reads "Apply" again — never block.
  }
  return next;
}

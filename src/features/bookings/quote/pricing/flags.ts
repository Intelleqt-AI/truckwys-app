// The costing flags the pricing analysis takes at the top level of its request
// (the web builder's `costingFlags`): the same trip, truck and cost flags the
// builder priced on, so the server's floor is the builder's. The shared
// flags come from analysisPayload(); the rest are the way-home legs and the
// border estimates the route gave. Null/absent figures are left out, as on
// the web, so the server never reads "unknown" as 0.

const FROM_ANALYSIS_PAYLOAD = [
  'tolls_unknown',
  'tolls_confirmed_none',
  'distance_estimated',
  'distance_confirmed',
  'use_official_fuel',
  'border_costs_unknown',
  'border_cost_is_override',
  'toll_cost_one_way',
] as const;

export interface PricingFlagExtras {
  /** A per-quote or market fuel price (R/L); null for the company's own / official one. */
  fuelPriceOverride: number | null;
  /** One-way trips where the empty return applies: whether it is in the floor. Null otherwise. */
  includeEmptyReturn: boolean | null;
  tollReturn: number | null;
  tollEmptyReturn: number | null;
  borderEmptyReturn: number | null;
  borderEstimate: number | null;
  borderEstimateEmptyReturn: number | null;
  abnormalLoad: boolean;
}

export function pricingFlags(
  base: Record<string, unknown>,
  x: PricingFlagExtras,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of FROM_ANALYSIS_PAYLOAD) {
    const v = base[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (x.fuelPriceOverride != null && x.fuelPriceOverride > 0) out.fuel_price_override = x.fuelPriceOverride;
  if (x.includeEmptyReturn != null) out.include_empty_return = x.includeEmptyReturn;
  if (typeof out.toll_cost_one_way === 'number') out.toll_cost_one_way = r2(out.toll_cost_one_way);
  if (x.tollReturn != null) out.toll_cost_return = x.tollReturn;
  if (x.tollEmptyReturn != null) out.toll_cost_empty_return = x.tollEmptyReturn;
  if (x.borderEmptyReturn != null) out.cross_border_cost_empty_return = x.borderEmptyReturn;
  if (x.borderEstimate) out.cross_border_estimate_zar = x.borderEstimate;
  if (x.borderEstimateEmptyReturn) out.cross_border_estimate_empty_return_zar = x.borderEstimateEmptyReturn;
  out.abnormal_load = x.abnormalLoad;
  return out;
}

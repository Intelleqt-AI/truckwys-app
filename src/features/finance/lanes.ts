import { useQuery } from '@tanstack/react-query';
import { fetchData } from '@/lib/api/client';
import { plural } from '@/lib/ledger';

// Lane margin from the backend (reports/margin-by-lane/): invoiced revenue
// excl. VAT net of credit notes, less load- and trip-linked expenses excl. VAT.
// Where a load has no expense the backend's cost model fills in and says so
// (cost_basis); those figures are shown as estimates, never like recorded ones.
// Port of the web's components/reports/LaneMargin.tsx.
//
// The response is `{lanes, summary}`, not a bare list: reading it with asArray
// (as the app used to) yields nothing, which is why lane margins never showed.

export type LaneBasis = 'actual' | 'estimate' | 'mixed';

export interface LaneRow {
  lane: string;
  loads: number;
  revenue_excl_vat: number;
  revenue_basis: LaneBasis;
  loads_invoiced: number;
  loads_uninvoiced: number;
  cost: number | null;
  margin: number | null;
  margin_pct: number | null;
  actual_cost: number | null;
  estimated_cost: number | null;
  cost_basis: LaneBasis;
  loads_actual_cost: number;
  loads_estimated_cost: number;
  loads_no_cost: number;
  revenue_per_km: number | null;
}

export interface LaneResponse {
  lanes: LaneRow[];
  summary: {
    lane_count: number;
    total_revenue_excl_vat: number;
    revenue_basis: LaneBasis;
    cost_basis: LaneBasis;
    loads_actual_cost: number;
    loads_estimated_cost: number;
    loads_no_cost: number;
    best_lane: { lane: string; margin_pct: number } | null;
    worst_lane: { lane: string; margin_pct: number } | null;
  };
}

/** Every lane (up to 100), best-selling first. Keyed so lib/queryInvalidation refreshes it. */
export function useLaneMargin() {
  return useQuery<LaneResponse>({
    queryKey: ['reports-lanes'],
    queryFn: () => fetchData<LaneResponse>('reports/margin-by-lane/?limit=100'),
    staleTime: 5 * 60_000,
  });
}

export const EST_COST =
  'Estimated cost: no expense is linked to these loads yet, so TruckWys modelled the cost from distance, fuel price and your vehicle costs. Link expenses to loads to replace it with actuals.';
export const EST_REV =
  'Estimated revenue: these loads are not invoiced yet, so the agreed load price (excl. VAT) is used.';

/** "Actual", "Estimate", or "Mixed: 3 of 5 loads costed from expenses". */
export function costBasisText(r: Pick<LaneRow, 'cost_basis' | 'loads_actual_cost' | 'loads_estimated_cost'>): string {
  if (r.cost_basis === 'actual') return 'Actual';
  if (r.cost_basis === 'estimate') return 'Estimate';
  const n = r.loads_actual_cost + r.loads_estimated_cost;
  return `Mixed: ${r.loads_actual_cost} of ${plural(n, 'load')} costed from expenses`;
}

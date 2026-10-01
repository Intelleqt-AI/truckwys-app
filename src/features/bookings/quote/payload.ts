import { num, pick } from '@/lib/api/list';
import type { CostBreakdown } from './costs';
import type { GeoPoint } from '@/lib/routeGeometry';
import { extractCode, roundCoord, round2, type Loc, type StopEntry } from './types';

// Moved out of CreateQuoteScreen.tsx's buildPayload (Phase 0 extraction) —
// same object literal, same key order, no behaviour change. This is the DRF
// contract: key order and field set must stay byte-identical to what the
// backend already accepts.

export interface BuildQuotePayloadInput {
  customerId: string;
  pickup: Loc | null;
  delivery: Loc | null;
  pickupDate: string;
  deliveryDate: string;
  cargo: string;
  weight: string;
  weightKg: number;
  vehicleType: string;
  costs: CostBreakdown;
  serviceCharge: number;
  notes: string;
  company: Record<string, unknown> | undefined;
  validUntil: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  winProb: number;
  stops: StopEntry[];
  routeGeometry: GeoPoint[];
  /** The R/km the base rate was priced at (blank or zero saves nothing). */
  baseRateNum: number;
  /** The market price check applied to this quote, if any. */
  aiApplied: { logId: number | null; key: string; winProbability: number | null } | null;
  /**
   * route_snapshot to save (an object; the API caps it at 200 KB and rejects
   * anything else). Null leaves whatever is already stored alone: a PATCH
   * replaces the field wholesale.
   */
  routeSnapshot: Record<string, unknown> | null;
}

export function buildQuotePayload(
  {
    customerId,
    pickup,
    delivery,
    pickupDate,
    deliveryDate,
    cargo,
    weight,
    weightKg,
    vehicleType,
    costs,
    serviceCharge,
    notes,
    company,
    validUntil,
    tripType,
    winProb,
    stops,
    routeGeometry,
    baseRateNum,
    aiApplied,
    routeSnapshot,
  }: BuildQuotePayloadInput,
  status: 'DRAFT' | 'SENT',
) {
  return {
    customer: Number(customerId),
    pickup_location: pickup?.label,
    delivery_location: delivery?.label,
    pickup_date: pickupDate || null,
    delivery_date: deliveryDate || null,
    origin: extractCode(pickup?.label ?? ''),
    destination: extractCode(delivery?.label ?? ''),
    pickup_lat: pickup ? roundCoord(pickup.lat) : undefined,
    pickup_lng: pickup ? roundCoord(pickup.lon) : undefined,
    delivery_lat: delivery ? roundCoord(delivery.lat) : undefined,
    delivery_lng: delivery ? roundCoord(delivery.lon) : undefined,
    // Only stops with a resolved location count — same rule the live route-calc
    // call already applies. Previously these were used for pricing only, then
    // discarded: never saved, so Quote Detail / the quotes list / a converted
    // Load could never show them.
    stops: stops
      .filter((s) => s.loc)
      .map((s) => ({ location: s.loc!.label, lat: roundCoord(s.loc!.lat), lon: roundCoord(s.loc!.lon) })),
    // Previously computed for live pricing only, then discarded: never saved,
    // so Quote Detail / a converted Load could never show the real road path.
    route_geometry: routeGeometry.map((p) => ({ lat: roundCoord(p.lat), lon: roundCoord(p.lon) })),
    cargo_description: cargo || `${weight}t ${vehicleType}`.trim(),
    // All of the below are DecimalField(max_digits=10, decimal_places=2) on
    // the backend. weightTons * 1000, and every cost.ts figure derived from
    // it, is plain JS float arithmetic — round2 keeps the float noise (e.g.
    // 16100.000000000002) from blowing past max_digits/decimal_places and
    // getting the save rejected. See round2's own comment in ./types.
    weight: round2(weightKg),
    distance: round2(costs.distance),
    estimated_duration_minutes: costs.duration,
    vehicle_type: vehicleType,
    base_rate: round2(costs.baseCost),
    fuel_surcharge: round2(costs.fuelCost),
    toll_charges: round2(costs.tollCost),
    driver_allowance: round2(costs.driver),
    additional_charges: round2(costs.crossBorderCost + serviceCharge),
    total_amount: round2(costs.total),
    // An applied market price has no markup and no known margin, so it sends
    // none: the stored value is kept (0 on create) rather than a made-up one.
    ...(aiApplied === null ? { margin_percentage: costs.marginPct } : {}),
    notes,
    status,
    confidence: 'MEDIUM',
    sla_hours: num(pick(company ?? {}, ['default_sla_hours'])) || 48,
    valid_until: validUntil,
    trip_type: tripType,
    // The win chance shown for an applied market price, else the analysis's.
    win_probability:
      aiApplied?.winProbability != null
        ? Math.round(aiApplied.winProbability * 100)
        : winProb
          ? Math.round(winProb * 100)
          : null,
    // The per-km rate the base was priced at (a Quote field since 2026-09).
    base_rate_per_km: baseRateNum > 0 ? round2(baseRateNum) : null,
    ...(routeSnapshot ? { route_snapshot: routeSnapshot } : {}),
  };
}

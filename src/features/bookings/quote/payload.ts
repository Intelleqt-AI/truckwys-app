import { num, pick } from '@/lib/api/list';
import type { CostBreakdown } from './costs';
import type { GeoPoint } from '@/lib/routeGeometry';
import { extractCode, roundCoord, round2, type Loc, type StopEntry } from './types';

// The quote save payload (DRF contract). Additive keys only: `is_international`
// (left out when the route/points don't say either way) and the §9 pricing
// snapshot (fuel_price_used … empty_return_included), which older backends
// ignore.

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
  /**
   * The costs to snapshot (QUOTE-RULES §9), or null to send none (an edited
   * quote whose route hasn't been worked out again keeps its stored snapshot).
   * Newer backends price and snapshot the quote themselves from its fields and
   * `costing_inputs`; the copy in route_snapshot serves older backends and
   * reopening.
   */
  pricing: CostBreakdown | null;
  /** quote_costing COSTING_INPUT_KEYS: what the quote fields alone don't say. */
  costingInputs: Record<string, number | boolean> | null;
  /**
   * The trip leaves South Africa (zero-rated for VAT). Null when neither the
   * route nor a point's country says either way: nothing is sent, so a stored
   * value is kept.
   */
  international: boolean | null;
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
    pricing,
    costingInputs,
    international,
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
    // International transport is zero-rated: the customer is shown VAT 0% and
    // the delivery invoice follows. Only the builder can set it.
    ...(international != null ? { is_international: international } : {}),
    driver_allowance: round2(costs.driver),
    additional_charges: round2(costs.crossBorderCost + serviceCharge),
    total_amount: round2(costs.total),
    // One margin definition: (price − cost floor) / price. Sent only when the
    // floor is known, so a save never wipes a stored figure with a guess.
    ...(costs.costing.margin_pct !== null
      ? { margin_percentage: Math.max(-999.99, Math.min(999.99, round2(costs.costing.margin_pct))) }
      : {}),
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
    ...(routeSnapshot
      ? { route_snapshot: pricing ? { ...routeSnapshot, ...pricingSnapshot(pricing, routeSnapshot) } : routeSnapshot }
      : {}),
    ...(costingInputs ? { costing_inputs: costingInputs } : {}),
  };
}

/** §9 snapshot fields, as the backend names them (it sets its own columns). */
export function pricingSnapshot(c: CostBreakdown, routeSnapshot: Record<string, unknown> | null) {
  const source = c.fuelFromMarketCheck ? 'override' : c.fuelSource === 'missing' ? null : c.fuelSource;
  return {
    fuel_price_used: c.fuelPrice > 0 ? round4(c.fuelPrice) : null,
    fuel_price_source: source,
    fuel_zone: c.fuelZone,
    fuel_effective_from: c.diesel.official_effective_from,
    fuel_official_at_pricing: c.diesel.official_price,
    fuel_litres: round4(c.fuelLitresTotal),
    priced_at: (routeSnapshot?.priced_at as string | undefined) ?? new Date().toISOString(),
    vehicle_type_id: c.truckId ?? null,
    empty_return_included: c.emptyReturnIncluded,
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

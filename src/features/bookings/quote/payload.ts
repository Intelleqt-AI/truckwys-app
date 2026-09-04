import { num, pick } from '@/lib/api/list';
import type { CostBreakdown } from './costs';
import type { GeoPoint } from '@/lib/routeGeometry';
import { extractCode, roundCoord, type Loc, type StopEntry } from './types';

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
    cargo_description: cargo || `${weight}t ${vehicleType}`,
    weight: weightKg,
    distance: costs.distance,
    estimated_duration_minutes: costs.duration,
    vehicle_type: vehicleType,
    base_rate: costs.baseCost,
    fuel_surcharge: costs.fuelCost,
    toll_charges: costs.tollCost,
    driver_allowance: costs.driver,
    additional_charges: costs.crossBorderCost + serviceCharge,
    total_amount: costs.total,
    margin_percentage: costs.marginPct,
    notes,
    status,
    confidence: 'MEDIUM',
    sla_hours: num(pick(company ?? {}, ['default_sla_hours'])) || 48,
    valid_until: validUntil,
    trip_type: tripType,
    win_probability: winProb ? Math.round(winProb * 100) : null,
  };
}

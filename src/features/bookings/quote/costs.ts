import { num, str, pick, asArray } from '@/lib/api/list';
import type { VehicleType } from '../api';
import { FUEL_FALLBACK, FUEL_PRICE_FIELD_BY_TYPE, capacityTons } from './types';

/**
 * With no vehicle type picked there is no reference tonnage to scale fuel
 * from, and a flat figure would price a 5t load and a 30t load identically.
 * So infer the truck the load will run on from the load itself: of the types
 * that can legally carry this weight, the one that burns LEAST at it
 * (mirrors web's QuoteBuilder.tsx inferredVT).
 *
 * Picking the smallest type that fits (the obvious rule) is wrong: base
 * consumption isn't ordered by capacity — a 17t reefer can burn more than a
 * 20t flatbed (it runs a fridge), so a lighter load would come out pricier
 * than a heavier one. Choosing the minimum burn can't reverse: as weight
 * rises each candidate burns more and the candidate set only shrinks, so the
 * result is non-decreasing by construction.
 *
 * Nothing big enough (an abnormal load) extrapolates the largest type rather
 * than dropping to the flat rate, so heavier still means dearer.
 *
 * Exported standalone (rather than inlined in computeCosts) so it's
 * unit-testable on its own.
 */
export function inferFuelBasis(types: VehicleType[], tonnes: number): VehicleType | null {
  if (!(tonnes > 0)) return null;
  // Matches web's allVehicleTypes: de-duplicated by name, first occurrence
  // wins. The backend's visible_vehicle_types_queryset already guarantees one
  // row per name per company, so this is currently a no-op — kept anyway for
  // the same reason as the fuel-price/capacity choices above: parity with web
  // shouldn't depend on a backend guarantee holding forever.
  const seen = new Set<string>();
  const deduped = types.filter((v) => (seen.has(v.name) ? false : (seen.add(v.name), true)));
  const rated = deduped
    .map((vt) => ({ vt, cap: capacityTons(vt.capacity) }))
    .filter((x): x is { vt: VehicleType; cap: number } => x.cap != null);
  if (!rated.length) return null;
  const burn = (x: { vt: VehicleType; cap: number }) =>
    (Number(x.vt.fuel_consumption_l_per_100km) || 32) *
    Math.pow(1 + (Number(x.vt.fuel_consumption_sensitivity_pct) || 2) / 100, tonnes - x.cap);
  const canCarry = rated.filter((x) => x.cap >= tonnes);
  if (!canCarry.length) {
    // Biggest truck, extrapolated up rather than falling back to the flat rate.
    return rated.sort((a, b) => b.cap - a.cap)[0]!.vt;
  }
  return canCarry.sort((a, b) => burn(a) - burn(b))[0]!.vt;
}

// ── Cost breakdown ───────────────────────────────────────────────────────
// Hoisted out of CreateQuoteScreen.tsx's `costs` useMemo (Phase 0 extraction)
// into a pure function — same computation, same comments, no behaviour
// change. The screen still wraps this in useMemo with the same dep list.

export interface ComputeCostsInput {
  currentRoute: Record<string, unknown>;
  routeData: Record<string, unknown> | null;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  vtypes: VehicleType[] | undefined;
  vehicleType: string;
  company: Record<string, unknown> | undefined;
  weightKg: number;
  baseRateNum: number;
  tollEdited: boolean;
  tollOverrideNum: number;
  driverNum: number;
  serviceCharge: number;
}

export interface CostBreakdown {
  distance: number;
  legs: number;
  chargeDistance: number;
  consumption: number;
  fuelCost: number;
  tollCost: number;
  /** What the toll would be from the route, ignoring any override — kept
      alongside tollCost (which does apply the override) so the UI can offer
      a way back to it (Phase 5). */
  tollCalculated: number;
  tollBreakdownOneWay: number;
  tollBreakdown: Record<string, unknown>[];
  /** The selected route reported an itemised toll of exactly zero — it
      genuinely has no plazas, as opposed to no route data having arrived
      yet (in which case there's nothing to report either way). */
  tollFree: boolean;
  crossBorderCost: number;
  /** The three server bucket totals, one way — used as the breakdown modal's
      fallback rows on a route response cached before cross_border_breakdown
      shipped. */
  borderFees: number;
  weighbridgeFees: number;
  nonSaTolls: number;
  /** cross_border_breakdown, one way, as the server sent it — each border
      crossing, the amortised SA permit, each country's weighbridge and tolls.
      Empty (not missing) when the route has no cross-border cost or predates
      the field; the modal falls back to the three buckets above in that case. */
  crossBorderBreakdown: Record<string, unknown>[];
  baseCost: number;
  driver: number;
  total: number;
  directCost: number;
  marginPct: number;
  duration: number;
  fuelUsage: number;
  fuelPrice: number;
  /** Name of the vehicle type the fuel figure is actually based on — the
      selected type, or (with none picked) the one inferFuelBasis chose from
      the fleet. null when neither applies. */
  fuelBasisName: string | null;
  /** True when fuelBasisName came from inferFuelBasis rather than an actual
      selection, so the UI can caption the fuel figure as an estimate. */
  fuelBasisInferred: boolean;
  /** fuelBasisVt's own configured L/100km, before the weight adjustment below
      is applied — the "Its rated burn" row in FuelBreakdownModal. */
  fuelBasisConsumption: number;
  /** capacityTons(fuelBasisVt?.capacity) — 0 when the basis type (selected or
      inferred) has no usable rated capacity, which is the ONLY thing that
      licenses showing a weight-adjusted fuel figure (mirrors web's
      fuelRefCapacityTons). Distinct from fuelBasisName: a type can be picked
      or inferred yet still have nothing to scale from, in which case the
      modal must show its "no rated capacity" copy rather than a weight-effect
      row for an adjustment that never actually ran (consumption falls back to
      the flat consumptionRef below in that case). */
  fuelBasisCapacityTons: number;
  /** fuelBasisVt's fuel_consumption_sensitivity_pct as a fraction (e.g. 0.02
      for 2%), or the same 2% default `consumption` itself falls back to —
      the "Weight effect" row in FuelBreakdownModal. */
  fuelSensitivity: number;
  /** ` · coastal` / ` · inland` when the price being charged is diesel (the
      only fuel gazetted per zone), else ''. Computed once here rather than in
      each display site so the fuel row and the modal can't disagree. */
  fuelZoneNote: string;
}

export function computeCosts({
  currentRoute,
  routeData,
  tripType,
  vtypes,
  vehicleType,
  company,
  weightKg,
  baseRateNum,
  tollEdited,
  tollOverrideNum,
  driverNum,
  serviceCharge,
}: ComputeCostsInput): CostBreakdown {
  const distance =
    num(pick(currentRoute, ['distance_km'])) || num(pick(routeData ?? {}, ['distance_km']));
  const legs = tripType === 'ROUND_TRIP' ? 2 : 1;
  const chargeDistance = distance * legs;

  const selectedVt = (vtypes ?? []).find((v) => v.name === vehicleType);
  // An explicit choice always wins; with none, infer a reference truck from
  // the load itself (see inferFuelBasis above) rather than pricing every
  // weight identically.
  const inferredVt = selectedVt ? null : inferFuelBasis(vtypes ?? [], weightKg / 1000);
  const fuelBasisVt = selectedVt ?? inferredVt;

  // A heavier load genuinely burns more fuel — consumptionRef (the basis
  // type's configured L/100km) is scaled by how far this quote's own weight
  // sits from the type's reference tonnage (its "capacity"), compounding at
  // `sensitivity`%/tonne (mirrors web's QuoteBuilder.tsx). Skipped entirely
  // (falls back to the flat rate) when there is no reference tonnage to scale
  // from — guessing one would be worse than no adjustment at all.
  const consumptionRef =
    Number(fuelBasisVt?.fuel_consumption_l_per_100km) || FUEL_FALLBACK[vehicleType] || 32;
  const refCapacityTons = capacityTons(fuelBasisVt?.capacity) ?? 0;
  const sensitivity = (Number(fuelBasisVt?.fuel_consumption_sensitivity_pct) || 2) / 100;
  const consumption =
    refCapacityTons > 0
      ? consumptionRef * Math.pow(1 + sensitivity, weightKg / 1000 - refCapacityTons)
      : consumptionRef;
  // Price the fuel this vehicle type actually burns, at the company's default
  // for that fuel — it used to always use the live national DIESEL price no
  // matter what was selected. Falls back to the diesel default when the
  // company hasn't set a price for that fuel, then to a literal.
  //
  // Deliberately keyed off selectedVt, NOT fuelBasisVt — web computes
  // consumption off fuelBasisVt (selected-or-inferred) but still prices it at
  // whatever fuel type is actually SELECTED, so an inferred (not chosen)
  // truck's fuel type never affects which company price applies; with no
  // type picked this always falls through to 'Diesel'. That's an
  // inconsistency in web's own logic (consumption and price use different
  // bases), but bit-for-bit parity with web is the point here — web is the
  // pricing source of truth, so this app must land on the exact same number.
  // If this gets fixed, it must happen on web first.
  const fuelField =
    FUEL_PRICE_FIELD_BY_TYPE[str(selectedVt?.fuel_type, 'Diesel')] ?? 'fuel_price_per_litre';
  const fuelPrice =
    num(pick(company ?? {}, [fuelField])) ||
    num(pick(company ?? {}, ['fuel_price_per_litre'])) ||
    21.7;
  const fuelCost = Math.round((chargeDistance * consumption * fuelPrice) / 100);
  // Diesel is gazetted at two prices, coastal and inland, ~R0.87/L apart —
  // say which one this figure is so it can be checked against a real
  // fuel-card statement. Only diesel has that split, so the note is omitted
  // for every other fuel type.
  const fuelZoneNote =
    fuelField === 'fuel_price_per_litre'
      ? str(pick(company ?? {}, ['fuel_zone'])) === 'COASTAL'
        ? ' · coastal'
        : ' · inland'
      : '';

  // A route that matched no plazas reports toll_cost_zar: 0 and means it —
  // the backend has deliberately no "found 0 → estimate" fallback (e.g.
  // Pretoria↔Johannesburg = R0). So take the first *defined* value rather
  // than the first truthy one; `||` used to read an authoritative zero as
  // "missing" and invent a distance × rate toll that doesn't exist.
  //
  // When the route has no toll_cost_zar field at all (genuinely missing, not
  // an authoritative zero), estimate it the same way web does: distance ×
  // the company's default toll rate per km, falling back to a literal.
  const rawToll =
    pick(currentRoute, ['toll_cost_zar']) ?? pick(routeData ?? {}, ['toll_cost_zar']);
  const tollFree = rawToll != null && num(rawToll) === 0;
  const tollRate = num(pick(company ?? {}, ['default_toll_rate_per_km'])) || 0.95;
  const routeTollOneWay = rawToll != null ? num(rawToll) : distance * tollRate;
  const tollCost = tollEdited ? tollOverrideNum : Math.round(routeTollOneWay * legs);
  const tollBreakdown = (
    asArray(pick(currentRoute, ['toll_breakdown'])).length
      ? asArray(pick(currentRoute, ['toll_breakdown']))
      : asArray(pick(routeData ?? {}, ['toll_breakdown']))
  ) as Record<string, unknown>[];

  const add = (pick(routeData ?? {}, ['additional_costs']) ?? {}) as Record<string, unknown>;
  const borderFees = num(pick(add, ['border_fees']));
  const weighbridgeFees = num(pick(add, ['weighbridge_fees']));
  const nonSaTolls = num(pick(add, ['non_sa_tolls']));
  // The server's own sum stays the source of truth for the total — it's the
  // same three buckets the breakdown itemises, not derived from the item
  // list, so a bucket the server doesn't itemise yet can never desync the
  // price shown from the price charged.
  const crossBorderCost = Math.round((borderFees + weighbridgeFees + nonSaTolls) * legs);
  // cross_border_breakdown is a sibling of additional_costs, not a key inside
  // it — that dict is summed server-side, so a list in there breaks the whole
  // route calculation. Absent on route responses cached before this shipped.
  const crossBorderBreakdown = asArray(
    pick(routeData ?? {}, ['cross_border_breakdown']),
  ) as Record<string, unknown>[];

  const baseCost = Math.round(chargeDistance * baseRateNum);
  const driver = driverNum;

  const total = baseCost + fuelCost + tollCost + crossBorderCost + driver + serviceCharge;
  const directCost = total - serviceCharge;
  const marginPct = total > 0 ? Math.round(((total - directCost) / total) * 100) : 0;
  const duration =
    num(pick(currentRoute, ['duration_minutes'])) || num(pick(currentRoute, ['duration_min']));

  return {
    distance,
    legs,
    chargeDistance,
    consumption,
    fuelCost,
    tollCost,
    tollCalculated: Math.round(routeTollOneWay * legs),
    tollBreakdownOneWay: Math.round(routeTollOneWay),
    tollBreakdown,
    tollFree,
    crossBorderCost,
    borderFees,
    weighbridgeFees,
    nonSaTolls,
    crossBorderBreakdown,
    baseCost,
    driver,
    total,
    directCost,
    marginPct,
    duration,
    fuelUsage: Math.round((chargeDistance * consumption) / 100),
    fuelPrice,
    fuelBasisName: fuelBasisVt?.name ?? null,
    fuelBasisInferred: !selectedVt && !!inferredVt,
    fuelBasisConsumption: consumptionRef,
    fuelBasisCapacityTons: refCapacityTons,
    fuelSensitivity: sensitivity,
    fuelZoneNote,
  };
}

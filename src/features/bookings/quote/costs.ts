import { num, str, pick, asArray } from '@/lib/api/list';
import type { VehicleType } from '../api';
import { FUEL_FALLBACK, FUEL_PRICE_FIELD_BY_TYPE } from './types';

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
  baseCost: number;
  driver: number;
  total: number;
  directCost: number;
  marginPct: number;
  duration: number;
  fuelUsage: number;
  fuelPrice: number;
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
  // A heavier load genuinely burns more fuel — consumptionRef (the type's
  // configured L/100km) is scaled by how far this quote's own weight sits
  // from the type's reference tonnage (its "capacity"), compounding at
  // `sensitivity`%/tonne (mirrors web's QuoteBuilder.tsx). Skipped entirely
  // (falls back to the flat rate, pre-fix behavior) when the type has no
  // capacity set — guessing a reference tonnage would be worse than no
  // adjustment at all.
  const consumptionRef =
    Number(selectedVt?.fuel_consumption_l_per_100km) || FUEL_FALLBACK[vehicleType] || 32;
  const refCapacityTons = Number(selectedVt?.capacity) || 0;
  const sensitivity = (Number(selectedVt?.fuel_consumption_sensitivity_pct) || 2) / 100;
  const consumption =
    refCapacityTons > 0
      ? consumptionRef * Math.pow(1 + sensitivity, weightKg / 1000 - refCapacityTons)
      : consumptionRef;
  // Price the fuel this vehicle type actually burns, at the company's default
  // for that fuel — it used to always use the live national DIESEL price no
  // matter what was selected. Falls back to the diesel default when the
  // company hasn't set a price for that fuel, then to a literal.
  const fuelField =
    FUEL_PRICE_FIELD_BY_TYPE[str(selectedVt?.fuel_type, 'Diesel')] ?? 'fuel_price_per_litre';
  const fuelPrice =
    num(pick(company ?? {}, [fuelField])) ||
    num(pick(company ?? {}, ['fuel_price_per_litre'])) ||
    21.7;
  const fuelCost = Math.round((chargeDistance * consumption * fuelPrice) / 100);

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
  const crossBorderCost = Math.round(
    (num(pick(add, ['border_fees'])) +
      num(pick(add, ['weighbridge_fees'])) +
      num(pick(add, ['non_sa_tolls']))) *
      legs,
  );

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
    baseCost,
    driver,
    total,
    directCost,
    marginPct,
    duration,
    fuelUsage: Math.round((chargeDistance * consumption) / 100),
    fuelPrice,
  };
}

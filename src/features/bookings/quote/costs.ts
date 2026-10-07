import { num, str, pick, asArray } from '@/lib/api/list';
import type { VehicleType } from '../api';
import { FUEL_PRICE_FIELD_BY_TYPE } from './types';
import {
  computeCosting,
  dieselInputFromApi,
  operatingCostPerKm,
  type Costing,
  type CostingInputs,
  type CostingLine,
  type DieselResolution,
  type DieselSource,
  type QuoteWarning,
} from './rules';

// ── Cost breakdown for the quote builder ────────────────────────────────────
// A thin adapter between the screen's state and the rules in ./rules.ts
// (QUOTE-RULES.md, a port of the backend's quote_costing.compute()).
//
// The PRICE is what the client is charged: haulage (rate/km × loaded km) plus
// the pass-through lines (fuel, tolls, border, driver nights) and any price
// adjustment. The COST FLOOR is the rules' sum of cost lines (fuel, operating
// cost, tolls, driver nights, border and, for a long one-way trip, the empty
// return). Margin = (price − floor) / price.

export interface ComputeCostsInput {
  currentRoute: Record<string, unknown>;
  routeData: Record<string, unknown> | null;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  vtypes: VehicleType[] | undefined;
  /** The truck the quote is priced on (chosen, else the suggested one). */
  vehicleType: string;
  company: Record<string, unknown> | undefined;
  weightKg: number;
  baseRateNum: number;
  tollEdited: boolean;
  tollOverrideNum: number;
  /** User-typed driver cost; null = the suggested nights × allowance. */
  driverOverride: number | null;
  serviceCharge: number;
  /** Response of GET fuel-prices/current/. */
  liveFuel?: Record<string, unknown> | null;
  /** A per-quote fuel price applied from the market price check. */
  aiFuelPrice?: number | null;
  /** "Use official price" on this quote while the company is on its own price. */
  useOfficialDiesel?: boolean;
  /** A market toll total applied from the price check, per one-way leg. */
  aiTollOneWay?: number | null;
  returnLoadBooked: boolean;
  tollsConfirmedNone: boolean;
  distanceConfirmed: boolean;
  /**
   * The backend's resolved inputs from POST quotes/cost-breakdown/ (newer
   * backends): the approved driver allowance, the fleet's operating cost for
   * this truck class, the diesel resolution and the company settings. Null on
   * an older backend: everything is resolved here instead.
   */
  serverInputs?: CostingInputs | null;
  now?: Date;
}

export interface CostBreakdown {
  /** One-way km. */
  distance: number;
  legs: number;
  /** Loaded km charged (one way × legs). */
  chargeDistance: number;
  duration: number;
  distanceEstimated: boolean;

  truckName: string | null;
  truckId: number | string | null;
  /** Loaded burn for this load, L/100km (unrounded); 0 when unknown. */
  consumption: number;
  /** Unrounded litres on the loaded legs. */
  fuelLitres: number;
  /** Unrounded litres incl. an empty return. */
  fuelLitresTotal: number;
  /** Whole litres on the loaded legs, display and analysis only. */
  fuelUsage: number;
  /** R/L this quote is priced on; 0 when unknown. */
  fuelPrice: number;
  fuelSource: DieselSource;
  fuelCost: number;
  fuelKnown: boolean;
  fuelType: string;
  fuelZone: 'INLAND' | 'COASTAL' | null;
  diesel: DieselResolution;
  fuelFromMarketCheck: boolean;
  /** The price without a market override (own / official). */
  fuelCompanyPrice: number;

  tollCost: number;
  tollKnown: boolean;
  /** The route's own toll figure for the loaded legs (0 when unknown). */
  tollCalculated: number;
  tollBreakdownOneWay: number;
  tollBreakdown: Record<string, unknown>[];
  tollFree: boolean;
  tollsUnavailable: boolean;
  tollsEstimated: boolean;
  tollFromMarketCheck: boolean;

  crossBorderCost: number;
  borderFees: number;
  weighbridgeFees: number;
  nonSaTolls: number;
  crossBorderBreakdown: Record<string, unknown>[];

  baseCost: number;
  driver: number;
  driverKnown: boolean;
  driverSuggested: number | null;
  nights: number | null;
  allowancePerNight: number | null;

  emptyReturnEligible: boolean;
  emptyReturnIncluded: boolean;
  emptyReturnTotal: number | null;

  /** What the client is charged, excl. VAT. */
  total: number;
  /** Price lines without the price adjustment. */
  directCost: number;
  /** Cost floor; null when a cost line is unknown. */
  floor: number | null;
  /** Whole-percent margin on the floor; null when the floor is unknown. */
  marginPct: number | null;
  /** floor / (1 − company target); null without a target. */
  targetPrice: number | null;
  costLines: CostingLine[];
  costing: Costing;
  costingInputs: CostingInputs;
  warnings: QuoteWarning[];
  /** At least one warning blocks sending. */
  blocked: boolean;
}

const nullIfNotPositive = (v: unknown) => {
  const n = num(v);
  return n > 0 ? n : null;
};

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
  driverOverride,
  serviceCharge,
  liveFuel,
  aiFuelPrice,
  useOfficialDiesel,
  aiTollOneWay,
  returnLoadBooked,
  tollsConfirmedNone,
  distanceConfirmed,
  serverInputs,
  now,
}: ComputeCostsInput): CostBreakdown {
  const rd = routeData ?? {};
  const hasRoute = !!routeData;
  const distance = num(pick(currentRoute, ['distance_km'])) || num(pick(rd, ['distance_km']));
  const legs = tripType === 'ROUND_TRIP' ? 2 : 1;
  const duration =
    num(pick(currentRoute, ['duration_minutes'])) ||
    num(pick(currentRoute, ['duration_min'])) ||
    num(pick(rd, ['duration_minutes']));
  const distanceEstimated = rd.distance_estimated === true || str(pick(rd, ['source'])) === 'estimated';

  const truck = (vtypes ?? []).find((v) => v.name === vehicleType) ?? null;

  // Fuel price (§1). Diesel by the rules; another fuel type is priced on the
  // company's own price for it when set (never a literal fallback).
  const fuelType = str(truck?.fuel_type, 'Diesel');
  const fuelField = FUEL_PRICE_FIELD_BY_TYPE[fuelType] ?? 'fuel_price_per_litre';
  const isDiesel = fuelField === 'fuel_price_per_litre';
  const otherFuelPrice = isDiesel ? null : nullIfNotPositive(pick(company ?? {}, [fuelField]));
  const fuelFromMarketCheck = aiFuelPrice != null && aiFuelPrice > 0;
  const dieselInput = dieselInputFromApi(company, liveFuel, {
    now,
    useOfficial: !!useOfficialDiesel,
    overridePrice: fuelFromMarketCheck ? (aiFuelPrice as number) : otherFuelPrice,
  });
  const companyDiesel = dieselInputFromApi(company, liveFuel, { now });

  // Tolls (§6): the route's figure per direction; a failed lookup is unknown,
  // never R 0. A typed total wins, then a market figure from the price check.
  // The selected route's own flags first: an alternative can fail its lookup
  // while the best route's didn't (and vice versa).
  const routeHasToll = 'toll_cost_zar' in currentRoute;
  const rawToll = routeHasToll ? currentRoute.toll_cost_zar : pick(rd, ['toll_cost_zar']);
  const flag = (k: string) => (k in currentRoute ? currentRoute[k] : rd[k]) === true;
  const lookupFailed =
    hasRoute && (flag('tolls_unknown') || flag('tolls_unavailable') || rawToll == null);
  const tollsEstimated =
    (pick(currentRoute, ['tolls_estimated']) ?? pick(rd, ['tolls_estimated'])) === true;
  const routeTollOneWay = hasRoute && !lookupFailed ? num(rawToll) : null;
  const tollFromMarketCheck = !tollEdited && aiTollOneWay != null && aiTollOneWay >= 0;
  const tollOneWay = tollEdited
    ? tollOverrideNum / legs
    : tollFromMarketCheck
      ? (aiTollOneWay as number)
      : routeTollOneWay;
  const tollBreakdown = (
    asArray(pick(currentRoute, ['toll_breakdown'])).length
      ? asArray(pick(currentRoute, ['toll_breakdown']))
      : asArray(pick(rd, ['toll_breakdown']))
  ) as Record<string, unknown>[];

  const add = (pick(rd, ['additional_costs']) ?? {}) as Record<string, unknown>;
  const borderFees = num(pick(add, ['border_fees']));
  const weighbridgeFees = num(pick(add, ['weighbridge_fees']));
  const nonSaTolls = num(pick(add, ['non_sa_tolls']));
  const crossBorderBreakdown = asArray(pick(rd, ['cross_border_breakdown'])) as Record<string, unknown>[];
  const borderTotal = (borderFees + weighbridgeFees + nonSaTolls) * legs;

  const op = operatingCostPerKm(company, truck, vtypes);
  const c = company ?? {};
  const includeDefault = pick(c, ['include_empty_return_default']);
  const localInputs: CostingInputs = {
    trip_type: tripType,
    distance_km: hasRoute && distance > 0 ? distance : null,
    distance_estimated: distanceEstimated,
    distance_confirmed: distanceConfirmed,
    duration_minutes: duration > 0 ? duration : null,
    load_kg: weightKg > 0 ? weightKg : null,
    vehicle: truck
      ? {
          id: truck.id,
          name: truck.name,
          capacity: truck.capacity,
          rated_burn_l_per_100km: truck.fuel_consumption_l_per_100km,
        }
      : null,
    diesel: dieselInput,
    operating_cost_per_km: op.perKm,
    operating_cost_source: op.source,
    tolls: {
      one_way: tollOneWay,
      empty_return: null,
      lookup_failed: !tollEdited && !tollFromMarketCheck && lookupFailed,
      confirmed_none: tollsConfirmedNone,
    },
    driver: {
      allowance_per_night: nullIfNotPositive(pick(c, ['driver_allowance_per_night'])),
      nights: null,
      amount: driverOverride,
    },
    hours_per_day: null,
    border_cost: borderTotal,
    include_empty_return: returnLoadBooked ? false : null,
    settings: {
      include_empty_return_default: typeof includeDefault === 'boolean' ? includeDefault : null,
      empty_return_min_km: nullIfNotPositive(pick(c, ['empty_return_min_km'])),
    },
    minimum_charge: nullIfNotPositive(pick(c, ['minimum_charge'])),
    target_margin_pct: nullIfNotPositive(pick(c, ['margin_target_pct'])),
    price: null,
  };
  const inputsBase = withServerInputs(localInputs, serverInputs ?? null, truck?.id ?? null);

  // The price lines come from the same rule outputs, so the fuel, tolls and
  // driver figures on the price are exactly the cost lines' figures.
  const pre = computeCosting(inputsBase);
  const line = (k: string) => pre.lines.find((l) => l.key === k && l.leg === 'loaded');
  const fuelCost = line('fuel')?.amount ?? 0;
  const tollCost = line('tolls')?.amount ?? 0;
  const driverLine = line('driver');
  const driver = driverLine?.amount ?? 0;
  const crossBorderCost = line('border')?.amount ?? 0;
  const loadedKm = pre.trip.km_loaded ?? 0;
  const baseCost = Math.round(loadedKm * baseRateNum * 100) / 100;
  const directCost = baseCost + fuelCost + tollCost + crossBorderCost + driver;
  const total = Math.round((directCost + serviceCharge) * 100) / 100;

  const costingInputs: CostingInputs = { ...inputsBase, price: total > 0 ? total : null };
  const costing = computeCosting(costingInputs);
  // Before there's a route nothing is priced yet: route gaps are not warnings.
  const warnings = hasRoute
    ? costing.warnings
    : costing.warnings.filter((w) => !['distance_missing', 'tolls_unknown', 'driver_nights_unknown'].includes(w.code));
  const emptyLines = costing.lines.filter((l) => l.leg === 'empty_return');
  const emptyReturnTotal = emptyLines.length
    ? emptyLines.every((l) => l.amount !== null)
      ? Math.round(emptyLines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100
      : null
    : null;

  return {
    distance,
    legs,
    chargeDistance: loadedKm,
    duration,
    distanceEstimated,
    truckName: truck?.name ?? null,
    truckId: truck?.id ?? null,
    consumption: costing.vehicle?.burn_loaded_l_per_100km ?? 0,
    fuelLitres: costing.litres.loaded ?? 0,
    fuelLitresTotal: costing.litres.total ?? 0,
    fuelUsage: Math.round(costing.litres.loaded ?? 0),
    fuelPrice: costing.diesel.price ?? 0,
    fuelSource: costing.diesel.source,
    fuelCost,
    fuelKnown: line('fuel')?.amount != null,
    fuelType,
    fuelZone: isDiesel ? costing.diesel.zone : null,
    diesel: costing.diesel,
    fuelFromMarketCheck,
    fuelCompanyPrice: (isDiesel ? (companyDiesel.mode === 'OWN' ? companyDiesel.own_price : companyDiesel.official_price) : otherFuelPrice) ?? 0,
    tollCost,
    tollKnown: line('tolls')?.amount != null,
    tollCalculated: routeTollOneWay !== null ? Math.round(routeTollOneWay * legs * 100) / 100 : 0,
    tollBreakdownOneWay: routeTollOneWay ?? 0,
    tollBreakdown,
    tollFree: routeTollOneWay === 0,
    tollsUnavailable: lookupFailed,
    tollsEstimated,
    tollFromMarketCheck,
    crossBorderCost,
    borderFees,
    weighbridgeFees,
    nonSaTolls,
    crossBorderBreakdown,
    baseCost,
    driver,
    driverKnown: driverLine?.amount != null,
    driverSuggested: (driverLine?.suggested as number | null | undefined) ?? null,
    nights: (driverLine?.nights as number | null | undefined) ?? null,
    allowancePerNight: (driverLine?.rate_per_night as number | null | undefined) ?? null,
    emptyReturnEligible: costing.trip.empty_return_default || costing.trip.empty_return_included || (returnLoadBooked && tripType === 'ONE_WAY'),
    emptyReturnIncluded: costing.trip.empty_return_included,
    emptyReturnTotal,
    total,
    directCost,
    floor: costing.floor,
    marginPct: costing.margin_pct === null ? null : Math.round(costing.margin_pct),
    targetPrice: costing.target_price,
    costLines: costing.lines,
    costing,
    costingInputs,
    warnings,
    blocked: warnings.some((w) => w.severity === 'block'),
  };
}

/**
 * Local inputs with what only the server knows taken from its resolution.
 * The person's own choices (use official, a market price, tolls, driver
 * amount, trip shape) always stay local.
 */
function withServerInputs(
  local: CostingInputs,
  server: CostingInputs | null,
  truckId: number | string | null,
): CostingInputs {
  if (!server) return local;
  const sameTruck = server.vehicle != null && truckId != null && String(server.vehicle.id) === String(truckId);
  return {
    ...local,
    diesel: server.diesel
      ? {
          ...server.diesel,
          use_official: local.diesel?.use_official ?? false,
          override_price: local.diesel?.override_price ?? null,
        }
      : local.diesel,
    ...(sameTruck
      ? {
          operating_cost_per_km: server.operating_cost_per_km ?? local.operating_cost_per_km,
          operating_cost_source: server.operating_cost_source ?? local.operating_cost_source,
        }
      : {}),
    driver: {
      ...local.driver,
      allowance_per_night: server.driver?.allowance_per_night ?? local.driver?.allowance_per_night ?? null,
    },
    hours_per_day: server.hours_per_day ?? local.hours_per_day,
    settings: server.settings ?? local.settings,
    minimum_charge: server.minimum_charge !== undefined ? server.minimum_charge : local.minimum_charge,
    target_margin_pct: server.target_margin_pct ?? local.target_margin_pct,
  };
}

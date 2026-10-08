import { num, str, pick, asArray } from '@/lib/api/list';
import type { VehicleType } from '../api';
import {
  computeCosting,
  fuelFamily,
  fuelInputFromApi,
  resolveDieselInput,
  operatingCostPerKm,
  phoneWarning,
  withServerInputs,
  borderCostsUnknownFromRoute,
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
  /**
   * Price at the rules' default (ceil of max(rate price, target price)) until
   * the person sets a rate, a price or a market figure; the base rate is then
   * whatever the default leaves after the costs passed on.
   */
  useDefaultPrice?: boolean;
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
  /** The trip crosses a border: with no border cost the floor is incomplete. */
  international?: boolean;
  /** Border, permit and non-SA toll costs typed for all legs. */
  borderOverride?: number | null;
  /** The clearing agent's fee typed on this quote (replaces the agent estimate). */
  agentFeeOverride?: number | null;

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
  /** Nights away but no allowance rate anywhere: priced at R 0, shown as unknown. */
  driverMissing: boolean;
  /** International trip with no border cost worked out (blocks). */
  borderMissing: boolean;
  /** Operating cost line flagged for a check (e.g. overlapping costs). */
  operatingCheck: boolean;
  /** The way home on its own route (newer backends): plazas and border lines. */
  returnTollBreakdown: Record<string, unknown>[];
  returnTollCost: number | null;
  returnBorderBreakdown: Record<string, unknown>[];
  /** Tolls are costed incl. VAT (a company that isn't VAT registered). */
  tollsInclVat: boolean;
  /** SANRAL class the tolls are priced on, when the route says. */
  tollClass: number | null;
  /** The clearing agent's estimate on this route (rand), when there is one. */
  agentEstimate: number | null;
  /** Target-margin price with the other empty-return answer (one-way, 300 km+). */
  altReturnTargetPrice: number | null;
  /** The price is the rules' default price (nobody set a rate or price). */
  priceIsDefault: boolean;
  defaultPrice: number | null;
  /** The base rate per km the price works out to. */
  ratePerKmShown: number;
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
  useDefaultPrice,
  tollEdited,
  tollOverrideNum,
  driverOverride,
  serviceCharge,
  liveFuel,
  aiFuelPrice,
  useOfficialDiesel,
  aiTollOneWay,
  returnLoadBooked,
  international,
  borderOverride,
  agentFeeOverride,
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

  // Fuel price (§1), by the truck's fuel: diesel and petrol (petrol and
  // hybrid trucks) are Official / My own price by one rule; electric is the
  // company's own price per kWh. Missing blocks (never a literal fallback).
  // On an older backend petrol is the company's own price only.
  const fuelType = str(truck?.fuel_type, 'Diesel');
  const family = fuelFamily(fuelType);
  const fuelFromMarketCheck = aiFuelPrice != null && aiFuelPrice > 0;
  const dieselInput: CostingInputs['diesel'] = fuelInputFromApi(company, liveFuel, fuelType, {
    now,
    useOfficial: !!useOfficialDiesel,
    overridePrice: fuelFromMarketCheck ? (aiFuelPrice as number) : null,
  });
  // The company's price for this fuel without this quote's choices.
  const companyFuel = resolveDieselInput(fuelInputFromApi(company, liveFuel, fuelType, { now }));

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

  // The way home on its own route (newer backends, when asked): its own
  // plazas, tolls and exit-only border charges. Absent → the outbound leg is
  // the stand-in, as before.
  const ret = (rd.return_leg && typeof rd.return_leg === 'object' ? rd.return_leg : null) as Record<
    string,
    unknown
  > | null;
  const retOk = !!ret && ret.available === true;
  const retToll =
    retOk && ret!.tolls_unknown !== true && typeof ret!.toll_cost_zar === 'number' ? (ret!.toll_cost_zar as number) : null;
  const retTollBreakdown = retOk ? (asArray(ret!.toll_breakdown) as Record<string, unknown>[]) : [];
  const ownRouteTolls = !tollEdited && !tollFromMarketCheck;

  const add = (pick(rd, ['additional_costs']) ?? {}) as Record<string, unknown>;
  const crossBorderBreakdown = asArray(pick(rd, ['cross_border_breakdown'])) as Record<string, unknown>[];
  const retBreakdown = retOk ? (asArray(ret!.cross_border_breakdown) as Record<string, unknown>[]) : [];
  // An agent's fee typed on this quote replaces the "agent estimate" line(s).
  const agentSum = (items: Record<string, unknown>[]) =>
    items.filter((i) => /agent/i.test(str(i.code))).reduce((sum, i) => sum + num(i.amount), 0);
  const agentDelta = (items: Record<string, unknown>[]) =>
    agentFeeOverride != null && agentSum(items) > 0 ? agentFeeOverride - agentSum(items) : 0;
  const borderFees = num(pick(add, ['border_fees'])) + agentDelta(crossBorderBreakdown);
  const weighbridgeFees = num(pick(add, ['weighbridge_fees']));
  const nonSaTolls = num(pick(add, ['non_sa_tolls']));
  const outBorder = borderFees + weighbridgeFees + nonSaTolls;
  const retAdd = (retOk && ret!.additional_costs && typeof ret!.additional_costs === 'object'
    ? ret!.additional_costs
    : null) as Record<string, unknown> | null;
  const retBorder = retAdd
    ? num(retAdd.border_fees) + num(retAdd.weighbridge_fees) + num(retAdd.non_sa_tolls) + agentDelta(retBreakdown)
    : null;
  const borderTotal = legs === 2 && retBorder !== null ? outBorder + retBorder : outBorder * legs;
  const borderEstimate = num(pick(rd, ['border_estimate_zar'])) || null;

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
      empty_return: ownRouteTolls && tripType === 'ONE_WAY' ? retToll : null,
      return_leg: ownRouteTolls && tripType === 'ROUND_TRIP' ? retToll : null,
      lookup_failed: !tollEdited && !tollFromMarketCheck && lookupFailed,
      confirmed_none: tollsConfirmedNone,
    },
    driver: {
      allowance_per_night: nullIfNotPositive(pick(c, ['driver_allowance_per_night'])),
      nights: null,
      amount: driverOverride,
    },
    hours_per_day: null,
    border_cost: borderOverride != null && borderOverride >= 0 ? borderOverride : borderTotal,
    border_cost_empty_return: tripType === 'ONE_WAY' && borderOverride == null ? retBorder : null,
    border_estimate: borderOverride == null ? borderEstimate : null,
    international: !!international,
    // Parts of the route with no border figures on file (newer backends);
    // a border figure the person typed covers them.
    border_costs_unknown: borderCostsUnknownFromRoute(routeData),
    border_cost_is_override: borderOverride != null && borderOverride >= 0,
    include_empty_return: returnLoadBooked ? false : null,
    settings: {
      include_empty_return_default: typeof includeDefault === 'boolean' ? includeDefault : null,
      // 0 means 0 (always include); only an unset value takes the default.
      empty_return_min_km: c.empty_return_min_km != null && c.empty_return_min_km !== '' ? num(c.empty_return_min_km) : null,
    },
    minimum_charge: nullIfNotPositive(pick(c, ['minimum_charge'])),
    default_price_per_km: nullIfNotPositive(pick(c, ['default_base_rate_per_km'])),
    // Backend target_margin(): the company target (default 10), clamped 1–40.
    target_margin_pct: Math.min(Math.max(nullIfNotPositive(pick(c, ['margin_target_pct'])) ?? 10, 1), 40),
    price: null,
  };
  const inputsBase = withServerInputs(localInputs, serverInputs ?? null, truck?.id ?? null, family);

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
  const passedOn = fuelCost + tollCost + crossBorderCost + driver;
  // Already rounded up like the choices by the rules.
  const defaultPrice = pre.default_price;
  const priceIsDefault = !!useDefaultPrice && defaultPrice !== null && loadedKm > 0;
  const baseCost = priceIsDefault
    ? Math.round((defaultPrice - passedOn) * 100) / 100
    : Math.round(loadedKm * baseRateNum * 100) / 100;
  const directCost = baseCost + passedOn;
  const total = Math.round((directCost + serviceCharge) * 100) / 100;

  const costingInputs: CostingInputs = { ...inputsBase, price: total > 0 ? total : null };
  const costing = computeCosting(costingInputs);
  // Before there's a route nothing is priced yet: route gaps are not warnings.
  const target = costing.target_margin_pct;
  // A known R 0 toll is "No toll plazas on this route" on the Tolls line, not
  // a warning: only tolls_unknown warns.
  const warnings = (
    hasRoute
      ? costing.warnings
      : costing.warnings.filter((w) => !['distance_missing', 'tolls_unknown', 'driver_nights_unknown'].includes(w.code))
  ).map((w) => phoneWarning(w, costing, target));
  // The trip date is after the newest published SA toll schedule.
  const tsw = (rd.toll_schedule_warning ?? null) as Record<string, unknown> | null;
  if (hasRoute && tsw && typeof tsw === 'object') {
    warnings.push({
      code: str(tsw.code) || 'toll_tariffs_not_published',
      severity: 'warn',
      title: 'Toll tariffs for this date are not published yet',
      detail: str(tsw.message),
      impact_zar: null,
      actions: [],
    });
  }
  const emptyLines = costing.lines.filter((l) => l.leg === 'empty_return');
  const emptyReturnTotal = emptyLines.length
    ? emptyLines.every((l) => l.amount !== null)
      ? Math.round(emptyLines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100
      : null
    : null;

  // The other answer to "does the truck come back empty?", priced at the
  // target margin, for the Empty | Loaded toggle.
  // The other answer to "does the truck come back empty?" at its default
  // price: the rules' alternative_with_return_load, or (with a return load
  // booked) the empty-return price.
  const altReturnPrice = costing.alternative_with_return_load
    ? costing.alternative_with_return_load.default_price
    : tripType === 'ONE_WAY' && returnLoadBooked
      ? computeCosting({ ...costingInputs, include_empty_return: null }).default_price
      : null;

  return {
    altReturnTargetPrice: altReturnPrice,
    returnTollBreakdown: retTollBreakdown,
    returnTollCost: retToll,
    returnBorderBreakdown: retBreakdown,
    tollsInclVat: rd.toll_cost_includes_vat === true,
    tollClass: typeof rd.toll_sanral_class === 'number' ? (rd.toll_sanral_class as number) : null,
    agentEstimate: agentSum(crossBorderBreakdown) > 0 ? agentSum(crossBorderBreakdown) : null,
    priceIsDefault,
    defaultPrice,
    ratePerKmShown: loadedKm > 0 ? baseCost / loadedKm : baseRateNum,
    driverMissing: driverLine?.source === 'missing',
    borderMissing: costing.lines.some((l) => l.key === 'border' && l.amount === null),
    operatingCheck: costing.lines.some((l) => l.key === 'operating' && l.status === 'check'),
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
    fuelZone: family === 'electric' ? null : costing.diesel.zone,
    diesel: costing.diesel,
    fuelFromMarketCheck,
    fuelCompanyPrice: companyFuel.price ?? 0,
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

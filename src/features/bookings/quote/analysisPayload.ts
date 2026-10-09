// The quote rules' inputs that /quotes/analyze/ and /quotes/ai-price-analysis/
// take with every request (QUOTE-RULES §8): the same trip, truck and cost
// flags the builder priced on, so the server's floor is the builder's.
// Pure, no imports: runs under `node --test`.

export interface AnalysisPayloadInput {
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  legs: number;
  oneWayKm: number;
  durationMinutes: number;
  truckId: number | string | null;
  returnLoadBooked: boolean;
  tollKnown: boolean;
  tollCost: number;
  tollsConfirmedNone: boolean;
  driverEdited: boolean;
  international: boolean;
  borderCost: number;
  distanceEstimated: boolean;
  distanceConfirmed: boolean;
  useOfficialFuel: boolean;
  /** Route parts with no border figures (null when all known / old backend). */
  borderCostsUnknown?: unknown;
  /** The border figure was typed by the person. */
  borderCostIsOverride?: boolean;
}

export function analysisPayload(i: AnalysisPayloadInput): Record<string, unknown> {
  return {
    trip_type: i.tripType,
    legs: i.legs,
    one_way_distance_km: i.oneWayKm > 0 ? i.oneWayKm : null,
    duration_minutes: i.durationMinutes > 0 ? i.durationMinutes : null,
    vehicle_type_id: i.truckId,
    // null = the company's empty-return rule; false = return load booked.
    include_empty_return: i.returnLoadBooked ? false : null,
    tolls_unknown: !i.tollKnown,
    tolls_confirmed_none: i.tollsConfirmedNone,
    toll_cost_one_way: i.tollKnown && i.legs > 0 ? i.tollCost / i.legs : null,
    driver_cost_is_override: i.driverEdited,
    is_international: i.international,
    international: i.international,
    cross_border_cost: i.borderCost,
    border_cost: i.borderCost,
    distance_estimated: i.distanceEstimated,
    distance_confirmed: i.distanceConfirmed,
    use_official_fuel: i.useOfficialFuel,
    ...(i.borderCostsUnknown ? { border_costs_unknown: i.borderCostsUnknown } : {}),
    border_cost_is_override: !!i.borderCostIsOverride,
  };
}

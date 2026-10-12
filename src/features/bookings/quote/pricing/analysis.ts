// Pricing analysis: the typed contract for POST quotes/pricing-analysis/ and
// the one adapter that turns whatever the server sends into these shapes
// (port of the web's components/pricing/types.ts + evaluate.ts, one file so
// `node --test` can load it: no imports at all).
//
// The endpoint is deterministic (no LLM, no web) and consumes the builder's
// own computed costs; nothing here recomputes a route, fuel or toll figure.
// Every screen reads the adapted shape only, so a key rename on the server is
// a one-line change in `adaptAnalysis`.
//
// One margin definition everywhere: margin = price − full cost floor;
// margin % = margin / price (excl. VAT).

export type SourceKind = 'official' | 'calculated' | 'company_actuals' | 'estimate' | 'user';
export type ChoiceKey = 'safe' | 'balanced' | 'stretch';
export type Band = 'likely' | 'even' | 'less_likely';
export type MarketTier = 'platform' | 'company' | 'estimate';
export type Position = 'below' | 'within' | 'above';

export interface LineSource {
  kind: SourceKind;
  label: string;
  url: string | null;
  asOf: string | null;
}
export interface FloorLine {
  key: string;
  label: string;
  amount: number;
  source: LineSource;
  basis: string | null;
  editable: boolean;
  details: { label: string; value: string }[];
  /** driver_allowance only: approved rate × nights. */
  suggested: number | null;
  /** driver_allowance only: nights away. */
  nights: number | null;
  /** A figure the floor still needs (driver allowance, or border costs on an international trip). */
  needsInput: boolean;
  /** A figure worth checking: R0 tolls (none found for the route, which may be missing data). */
  check: boolean;
}
export interface CostFloor {
  total: number;
  perKm: number | null;
  includeReturn: boolean;
  perKmLabel: string | null;
  kmDriven: number | null;
  distanceKm: number | null;
  returnLegAmount: number | null;
  floorWithReturn: number | null;
  returnAvailable: boolean;
  lines: FloorLine[];
  fixedCostPerKm: {
    value: number;
    source: 'company_actuals' | 'vehicle_default';
    trips: number | null;
    window: string | null;
  } | null;
}
export interface Market {
  available: boolean;
  p25: number | null;
  median: number | null;
  p75: number | null;
  n: number;
  tier: MarketTier | null;
  tierLabel: string | null;
  isEstimate: boolean;
  yourPosition: Position | null;
  /** Round trip priced from one-way quotes ×2 (`legs_scaled` / `basis: "one_way_x2"`). */
  oneWayX2: boolean;
  basisLabel: string | null;
  vehicleSpecific: boolean;
  vehicleName: string | null;
}
export type Likelihood =
  | { level: 'model'; pct: number }
  /** band null: not enough data to judge. */
  | { level: 'rules'; band: Band | null; label: string; outsideModelRange: boolean };
export interface Choice {
  key: ChoiceKey;
  label: string;
  price: number;
  margin: number;
  marginPct: number;
  recommended: boolean;
  summary: string | null;
  likelihood: Likelihood | null;
  /** Margin % if the truck comes back empty (when the floor excludes the return). */
  marginPctIfEmptyReturn: number | null;
}
export interface CurvePoint {
  price: number;
  pct: number;
  expectedProfit: number | null;
}
export interface LikelihoodInfo {
  level: 'model' | 'rules';
  model: {
    version: string;
    scope: string | null;
    nClosed: number;
    basisLabel: string;
    range: [number, number];
    curve: CurvePoint[];
    best: { price: number; pct: number | null; expectedProfit: number | null } | null;
  } | null;
  rules: { likelyMax: number | null; evenMax: number | null; basis: string[] } | null;
  reason: string | null;
  short: string | null;
  /** The display-ready panel subtitle, rendered as received. */
  headline: string | null;
}
export interface LaneQuote {
  id: number | null;
  number: string | null;
  date: string | null;
  price: number;
  outcome: string;
}
export interface CustomerEvidence {
  id: number | null;
  name: string | null;
  acceptance: { won: number; decided: number; ratePct: number | null; scope: 'lane' | 'all' } | null;
  /** This customer on this lane only (null when they have no decided quotes here). */
  laneAcceptance: { won: number; decided: number; ratePct: number | null } | null;
  recentLaneQuotes: LaneQuote[];
  paymentRisk: {
    band: 'low' | 'medium' | 'high' | 'unknown';
    label: string;
    basis: string | null;
    attention: boolean;
  } | null;
}
export interface PricingAnalysis {
  version: string;
  computedMs: number | null;
  missing: string[];
  targetMarginPct: number | null;
  costFloor: CostFloor | null;
  market: Market | null;
  choices: Choice[];
  likelihood: LikelihoodInfo | null;
  customer: CustomerEvidence | null;
  reasoning: string[];
  reasoningItems: { code: string; text: string }[];
  warnings: { code: string; message: string }[];
  /** Decision-changing notices for the top of the panel (payment risk, lane under cost …). */
  attention: { code: string; level: string; message: string }[];
  recommendation: { key: string | null; reason: string | null; short: string | null } | null;
  /** The server's own reading of the price that was sent (authoritative at that price). */
  yourPrice: {
    price: number;
    margin: number | null;
    marginPct: number | null;
    belowFloor: boolean;
    likelihood: Likelihood | null;
  } | null;
  /** True when the server sends the display strings (headline …). */
  r5: boolean;
  /** Progress to a real win model: won/lost closed quotes and what is needed. */
  modelProgress: { won: number | null; lost: number | null; wonNeeded: number; lostNeeded: number } | null;
  targetMarginSource: string | null;
  floorWithReturn: number | null;
  /** "On this lane 60% of your trips found a return load (3 of 5)." Context only. */
  returnLoadHistory: string | null;
}

/** What the builder sends. `buildRequest` is the one place that maps the
 *  builder's values onto the endpoint's field names. */
export interface PricingInputs {
  quoteId: number | null;
  customerId: number | null;
  origin: string;
  destination: string;
  originLabel: string;
  destinationLabel: string;
  distanceKm: number;
  oneWayDistanceKm: number;
  legs: number;
  tripType: string;
  /** One-way driving minutes. */
  durationMinutes: number | null;
  vehicleTypeId: number | null;
  vehicleType: string | null;
  weightKg: number | null;
  fuelType: string | null;
  fuelZone: string | null;
  fuelCost: number;
  fuelLitres: number | null;
  fuelPricePerL: number | null;
  fuelConsumption: number | null;
  /** Where the R/L came from: own | official | override. */
  fuelPriceSource?: string | null;
  /** The empty return the builder includes (one-way, long enough), or null. */
  emptyReturnCost?: number | null;
  /** quote_costing flags (tolls_unknown, distance_estimated, …), sent as is. */
  costingFlags?: Record<string, unknown>;
  tollCost: number;
  routePlazas: { plaza: string; route?: string; tariff: number }[];
  countryCodes: string[] | null;
  crossBorderCost: number;
  isInternational: boolean;
  pickupDate: string | null;
  /** Only when the user typed one; otherwise the approved figure applies. */
  driverAllowance: number | null;
  includeReturn: boolean | null;
  yourPrice: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildRequest(i: PricingInputs): Record<string, unknown> {
  return {
    quote_id: i.quoteId,
    customer_id: i.customerId,
    origin: i.origin,
    destination: i.destination,
    pickup_location: i.originLabel,
    delivery_location: i.destinationLabel,
    distance_km: round2(i.distanceKm),
    one_way_distance_km: round2(i.oneWayDistanceKm),
    legs: i.legs,
    trip_type: i.tripType,
    duration_minutes: i.durationMinutes != null ? Math.round(i.durationMinutes) : null,
    vehicle_type: i.vehicleType || null,
    vehicle_type_id: i.vehicleTypeId,
    weight: i.weightKg,
    fuel_cost: round2(i.fuelCost),
    fuel_usage_litres: i.fuelLitres != null ? round2(i.fuelLitres) : null,
    fuel_price_used: i.fuelPricePerL,
    fuel_consumption_l_per_100km: i.fuelConsumption != null ? round2(i.fuelConsumption) : null,
    fuel_type: i.fuelType,
    fuel_zone: i.fuelZone,
    ...(i.fuelPriceSource ? { fuel_price_source: i.fuelPriceSource } : {}),
    ...(i.emptyReturnCost != null ? { empty_return_cost: round2(i.emptyReturnCost) } : {}),
    toll_cost: round2(i.tollCost),
    route: { toll_breakdown: i.routePlazas, cross_border: i.isInternational, country_codes: i.countryCodes },
    cross_border_cost: round2(i.crossBorderCost),
    // Only a figure the user typed is theirs; otherwise the floor uses the
    // approved allowance × nights.
    ...(i.driverAllowance != null ? { driver_cost: round2(i.driverAllowance), driver_cost_is_override: true } : {}),
    ...(i.includeReturn != null ? { include_return: i.includeReturn } : {}),
    your_price: i.yourPrice != null ? round2(i.yourPrice) : null,
    pickup_date: i.pickupDate || null,
    ...(i.costingFlags ?? {}),
  };
}

// ---------------------------------------------------------------- adapter

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Only https links to a real host are ever rendered. */
export const safeUrl = (v: unknown): string | null => {
  const s = str(v);
  return s && /^https:\/\/[^\s/?#:]+(?:[:/?#]\S*)?$/i.test(s) ? s : null;
};

const SOURCE_KINDS: SourceKind[] = ['official', 'calculated', 'company_actuals', 'estimate', 'user'];
const BANDS: Band[] = ['likely', 'even', 'less_likely'];
/** The band words, the same as the quote detail's (lib/pricing). */
export const BAND_LABEL: Record<Band, string> = {
  likely: 'Likely',
  even: 'Even chance',
  less_likely: 'Less likely',
};
const NO_BAND = 'Not enough data yet';

/** The server's return-load sentence, or null. */
export function returnHistoryOf(h: unknown): string | null {
  const t = obj(h)?.text;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

function adaptLikelihood(v: unknown): Likelihood | null {
  const o = obj(v);
  if (!o) return null;
  if (o.level === 'model') {
    const pct = num(o.pct);
    return pct == null ? null : { level: 'model', pct: Math.max(0, Math.min(100, pct)) };
  }
  if (o.level !== 'rules') return null;
  const band = BANDS.includes(o.band as Band) ? (o.band as Band) : null;
  return {
    level: 'rules',
    band,
    label: band ? BAND_LABEL[band] : NO_BAND,
    outsideModelRange: o.outside_model_range === true,
  };
}

export function adaptAnalysis(raw: unknown): PricingAnalysis | null {
  const r = obj(raw);
  if (!r || r.success === false) return null;

  const cf = obj(r.cost_floor);
  const fx = obj(cf?.fixed_cost_per_km);
  const costFloor: CostFloor | null =
    cf && num(cf.total) != null
      ? {
          total: num(cf.total)!,
          perKm: num(cf.per_km),
          includeReturn: cf.include_return === true,
          perKmLabel: str(cf.per_km_label),
          kmDriven: num(cf.km_driven),
          distanceKm: num(cf.distance_km),
          returnLegAmount: num(cf.return_leg_amount),
          floorWithReturn: num(cf.floor_with_return),
          returnAvailable: cf.return_available !== false,
          lines: arr(cf.lines)
            .map(obj)
            .filter((l): l is Obj => !!l)
            .map((l) => {
              const s = obj(l.source) || {};
              return {
                key: String(l.key ?? ''),
                label: str(l.label) || String(l.key ?? ''),
                amount: num(l.amount) ?? 0,
                source: {
                  kind: SOURCE_KINDS.includes(s.kind as SourceKind) ? (s.kind as SourceKind) : 'estimate',
                  label: str(s.label) || '',
                  url: safeUrl(s.url),
                  asOf: str(s.as_of),
                },
                basis: str(l.basis),
                editable: l.editable === true,
                details: arr(l.details)
                  .map(obj)
                  .filter((d): d is Obj => !!d)
                  .map((d) => ({ label: String(d.label ?? ''), value: String(d.value ?? '') })),
                suggested: num(l.suggested),
                nights: num(l.nights),
                // Backend flag when it lands; until then: nights away, no approved rate, nothing typed.
                needsInput:
                  l.status === 'needs_input' ||
                  (l.key === 'driver_allowance' &&
                    (num(l.nights) ?? 0) >= 1 &&
                    num(l.suggested) == null &&
                    obj(l.source)?.kind !== 'user'),
                check: l.status === 'check',
              };
            }),
          fixedCostPerKm:
            fx && num(fx.value) != null
              ? {
                  value: num(fx.value)!,
                  source: fx.source === 'company_actuals' ? 'company_actuals' : 'vehicle_default',
                  trips: num(fx.trips),
                  window: str(fx.window),
                }
              : null,
        }
      : null;

  const m = obj(r.market);
  const tier = (['platform', 'company', 'estimate'] as const).find((t) => t === m?.tier) ?? null;
  const market: Market | null = m
    ? {
        available: m.available === true && m.tier !== 'none' && num(m.median) != null,
        p25: num(m.p25),
        median: num(m.median),
        p75: num(m.p75),
        n: num(m.n) ?? 0,
        tier,
        tierLabel: str(m.tier_label),
        // Belt and braces: an estimate tier is always an estimate, whatever the flag says.
        isEstimate: m.is_estimate === true || tier === 'estimate',
        yourPosition: (['below', 'within', 'above'] as const).find((p) => p === m.your_position) ?? null,
        oneWayX2: m.legs_scaled === true || m.basis === 'one_way_x2',
        basisLabel: str(m.basis_label) ?? str(m.basis_short),
        vehicleSpecific: m.vehicle_specific === true,
        vehicleName:
          str(m.vehicle_type) ??
          str(m.vehicle_type_name) ??
          (str(m.tier_label)?.match(/·\s*([^·]+?)\s+only\b/)?.[1] ?? null),
      }
    : null;

  const recObj = obj(r.recommendation);
  const choices: Choice[] = arr(r.choices)
    .map(obj)
    .filter((c): c is Obj => !!c)
    .map((c) => ({
      key: c.key as ChoiceKey,
      label: str(c.label) || String(c.key),
      price: num(c.price) ?? 0,
      margin: num(c.margin) ?? 0,
      marginPct: num(c.margin_pct) ?? 0,
      // No evidence → the server sends recommendation null: then nothing is "Recommended".
      recommended:
        c.recommended === true && !(recObj === null && 'recommendation' in r) && !(recObj && recObj.key === null),
      summary: str(c.summary),
      likelihood: adaptLikelihood(c.likelihood),
      marginPctIfEmptyReturn: num(c.margin_pct_if_empty_return),
    }))
    .filter((c) => ['safe', 'balanced', 'stretch'].includes(c.key) && c.price > 0);

  const lk = obj(r.likelihood);
  const lm = obj(lk?.model);
  const lr = obj(lk?.rules);
  const th = obj(lr?.thresholds);
  const range = arr(lm?.range).map(num);
  const curve = arr(lm?.curve)
    .map(obj)
    .filter((p): p is Obj => !!p)
    .map((p) => ({ price: num(p.price), pct: num(p.pct), expectedProfit: num(p.expected_profit) }))
    .filter((p): p is CurvePoint => p.price != null && p.pct != null)
    .sort((a, b) => a.price - b.price);
  const first = curve[0];
  const last = curve[curve.length - 1];
  const best = obj(lm?.best);
  const model =
    lm && first && last && curve.length >= 2
      ? {
          version: str(lm.version) || '',
          scope: str(lm.scope),
          nClosed: num(lm.n_closed) ?? 0,
          basisLabel: str(lm.basis_label) || '',
          range: (range.length === 2 && range[0] != null && range[1] != null
            ? [range[0], range[1]]
            : [first.price, last.price]) as [number, number],
          curve,
          best:
            best && num(best.price) != null
              ? { price: num(best.price)!, pct: num(best.pct), expectedProfit: num(best.expected_profit) }
              : null,
        }
      : null;
  const likelihood: LikelihoodInfo | null = lk
    ? {
        // Model level only counts when there really is a curve to read.
        level: lk.level === 'model' && model ? 'model' : 'rules',
        model,
        rules: lr
          ? {
              likelyMax: num(th?.likely_max),
              evenMax: num(th?.even_max),
              basis: arr(lr.basis)
                .map(str)
                .filter((s): s is string => !!s),
            }
          : null,
        reason: str(lk.reason),
        short: str(lk.short),
        headline: str(lk.headline),
      }
    : null;

  const cu = obj(r.customer);
  const acc = obj(cu?.acceptance);
  const pr = obj(cu?.payment_risk);
  const la = obj(cu?.lane_acceptance);
  const customer: CustomerEvidence | null = cu
    ? {
        id: num(cu.id),
        name: str(cu.name),
        acceptance:
          acc && num(acc.decided) != null
            ? {
                won: num(acc.won) ?? 0,
                decided: num(acc.decided) ?? 0,
                ratePct: num(acc.rate_pct),
                scope: acc.scope === 'lane' ? 'lane' : 'all',
              }
            : null,
        laneAcceptance:
          la && (num(la.decided) ?? 0) > 0
            ? { won: num(la.won) ?? 0, decided: num(la.decided) ?? 0, ratePct: num(la.rate_pct) }
            : null,
        recentLaneQuotes: arr(cu.recent_lane_quotes)
          .map(obj)
          .filter((q): q is Obj => !!q)
          .map((q) => ({
            id: num(q.id),
            number: str(q.number),
            date: str(q.date),
            price: num(q.price) ?? 0,
            outcome: String(q.outcome ?? 'open'),
          }))
          .slice(0, 5),
        paymentRisk: pr
          ? {
              band: (['low', 'medium', 'high', 'unknown'] as const).find((b) => b === pr.band) ?? 'unknown',
              label: str(pr.label) || 'No payment history yet',
              basis: str(pr.basis),
              attention: pr.attention === true || pr.band === 'medium' || pr.band === 'high',
            }
          : null,
      }
    : null;

  const yp = obj(r.your_price);
  const mp = obj(obj(r.win_prediction)?.model_progress);
  return {
    version: str(r.version) || 'pa-1',
    computedMs: num(r.computed_ms),
    missing: arr(r.missing)
      .map(str)
      .filter((s): s is string => !!s),
    targetMarginPct: num(obj(r.target_margin)?.pct) ?? num(r.target_margin_pct),
    costFloor,
    market,
    choices,
    likelihood,
    customer,
    reasoning: arr(r.reasoning)
      .map(str)
      .filter((s): s is string => !!s),
    reasoningItems: arr(r.reasoning_items)
      .map(obj)
      .filter((i): i is Obj => !!i)
      .map((i) => ({ code: String(i.code ?? ''), text: str(i.text) || '' }))
      .filter((i) => i.text),
    yourPrice:
      yp && num(yp.price) != null
        ? {
            price: num(yp.price)!,
            margin: num(yp.margin),
            marginPct: num(yp.margin_pct),
            belowFloor: yp.below_floor === true,
            likelihood: adaptLikelihood(yp.likelihood),
          }
        : null,
    r5: !!str(lk?.headline),
    // win_prediction.model_progress {accepted, rejected, accepted_needed, rejected_needed}.
    modelProgress: mp
      ? {
          won: num(mp.accepted),
          lost: num(mp.rejected),
          wonNeeded: num(mp.accepted_needed) ?? 200,
          lostNeeded: num(mp.rejected_needed) ?? 200,
        }
      : null,
    targetMarginSource: str(obj(r.target_margin)?.source),
    floorWithReturn: num(cf?.floor_with_return ?? r.floor_with_return),
    returnLoadHistory: returnHistoryOf(
      r.return_load_history ?? obj(r.alternative_with_return_load)?.return_load_history,
    ),
    attention: arr(r.attention)
      .map(obj)
      .filter((a): a is Obj => !!a)
      .map((a) => ({ code: String(a.code ?? ''), level: String(a.level ?? 'medium'), message: str(a.message) || '' }))
      .filter((a) => a.message),
    recommendation: recObj ? { key: str(recObj.key), reason: str(recObj.reason), short: str(recObj.short) } : null,
    warnings: arr(r.warnings)
      .map(obj)
      .filter((w): w is Obj => !!w)
      .map((w) => ({ code: String(w.code ?? ''), message: str(w.message) || '' }))
      .filter((w) => w.message),
  };
}

// --------------------------------------------------------------- evaluate
// Live, client-side reading of the price in the bar against the last
// analysis, so margin and likelihood follow every change without a
// round-trip. The endpoint stays the authority: it is re-called (debounced)
// and its figures replace these as soon as they land.

export type LiveLikelihood =
  | { level: 'model'; pct: number }
  /** band null: not enough data to judge. */
  | { level: 'rules'; band: Band | null; label: string; note: string | null }
  | null;

export interface LiveReading {
  price: number;
  floor: number | null;
  margin: number | null;
  marginPct: number | null;
  belowFloor: boolean;
  likelihood: LiveLikelihood;
  /** The choice whose price this is, if any. */
  matchedChoice: ChoiceKey | null;
}

const OUTSIDE = "Outside the prices we've seen you quote";

export function likelihoodAt(a: PricingAnalysis | null, price: number): LiveLikelihood {
  const lk = a?.likelihood;
  if (!lk || !(price > 0)) return null;
  // Rules thresholds (sent whenever they exist, at model level too).
  const rulesBand = (): Band | null => {
    const t = lk.rules;
    if (!t || t.likelyMax == null || t.evenMax == null) return null;
    return price <= t.likelyMax ? 'likely' : price <= t.evenMax ? 'even' : 'less_likely';
  };
  if (lk.level === 'model' && lk.model) {
    const { range, curve } = lk.model;
    if (price >= range[0] && price <= range[1]) {
      // Linear interpolation between the two curve points either side.
      let i = curve.findIndex((p) => p.price >= price);
      if (i <= 0) i = 1;
      const a0 = curve[i - 1]!;
      const a1 = curve[i]!;
      const t = a1.price === a0.price ? 0 : (price - a0.price) / (a1.price - a0.price);
      const pct = a0.pct + (a1.pct - a0.pct) * Math.max(0, Math.min(1, t));
      return { level: 'model', pct: Math.round(pct) };
    }
    // Outside what the model has seen: a band, never an extrapolated %.
    const band = rulesBand();
    return { level: 'rules', band, label: band ? BAND_LABEL[band] : NO_BAND, note: OUTSIDE };
  }
  const band = rulesBand();
  return { level: 'rules', band, label: band ? BAND_LABEL[band] : NO_BAND, note: null };
}

/** `floorOverride`: the one floor on screen (the builder's costing); the
 *  analysis' own floor is only used when none is given. */
export function readPrice(a: PricingAnalysis | null, price: number, floorOverride?: number | null): LiveReading {
  const floor = floorOverride !== undefined ? floorOverride : (a?.costFloor?.total ?? null);
  const margin = floor != null ? price - floor : null;
  // A choice only when the price IS that choice's price, to the cent: R 27 999,99
  // is a custom price, never "Stretch".
  const matchedChoice = a?.choices.find((c) => Math.abs(c.price - price) < 0.005) ?? null;
  // At a choice's own price, say exactly what its card says. The server's
  // reading wins at the exact price it was asked about; the curve is only
  // interpolated for another price. `<= 0.5` so an older server that echoed
  // whole rand still counts as an answer for this price.
  const yp = a?.yourPrice && Math.abs(a.yourPrice.price - price) <= 0.5 ? a.yourPrice.likelihood : null;
  const cl = matchedChoice?.likelihood ?? yp;
  const likelihood: LiveLikelihood = cl
    ? cl.level === 'model'
      ? { level: 'model', pct: Math.round(cl.pct) }
      : { level: 'rules', band: cl.band, label: cl.label, note: cl.outsideModelRange ? OUTSIDE : null }
    : likelihoodAt(a, price);
  return {
    price,
    floor,
    margin,
    marginPct: margin != null && price > 0 ? (margin / price) * 100 : null,
    belowFloor: margin != null && margin < 0,
    likelihood,
    matchedChoice: matchedChoice?.key ?? null,
  };
}

/** The additive `pricing_decision` saved with the quote (backend validate_pricing_decision). */
export function pricingDecision(
  a: PricingAnalysis,
  finalPrice: number,
  picked: ChoiceKey | 'custom',
  priceAdjustment = 0,
) {
  const live = readPrice(a, finalPrice);
  const lk = live.likelihood;
  return {
    version: a.version,
    shown_choices: a.choices.map((c) => ({
      key: c.key,
      price: Math.round(c.price),
      margin_pct: Math.round(c.marginPct),
      recommended: c.recommended,
      likelihood:
        c.likelihood?.level === 'model'
          ? { level: 'model', pct: Math.round(c.likelihood.pct) }
          : c.likelihood
            ? { level: 'rules', band: c.likelihood.band }
            : null,
    })),
    picked_choice: picked,
    // So quote detail can reconcile the floor line by line.
    floor_lines: (a.costFloor?.lines ?? []).map((l) =>
      l.needsInput
        ? { key: l.key, label: l.label, amount: 0, source_kind: 'missing' }
        : { key: l.key, label: l.label, amount: l.amount, source_kind: l.source.kind },
    ),
    price_adjustment: Math.round(priceAdjustment * 100) / 100,
    final_price: Math.round(finalPrice * 100) / 100,
    floor: a.costFloor ? Math.round(a.costFloor.total * 100) / 100 : null,
    market: a.market?.available
      ? {
          p25: a.market.p25,
          median: a.market.median,
          p75: a.market.p75,
          tier: a.market.tier,
          n: a.market.n,
          tier_label: a.market.tierLabel,
          is_estimate: a.market.isEstimate,
        }
      : null,
    model_version: a.likelihood?.level === 'model' ? a.likelihood.model?.version || null : null,
    n_closed: a.likelihood?.level === 'model' ? (a.likelihood.model?.nClosed ?? null) : null,
    basis_label: a.likelihood?.level === 'model' ? a.likelihood.model?.basisLabel || null : null,
    likelihood_level: a.likelihood?.level ?? null,
    // A choice's own figure (from the server) is kept; for a custom price the
    // server computes it at save, so nothing client-side is sent as fact.
    likelihood_at_final_pct: picked !== 'custom' && lk?.level === 'model' ? lk.pct : null,
    band_at_final: picked !== 'custom' && lk?.level === 'rules' ? lk.band : null,
  };
}

/**
 * The three cards' chance to win in ONE format: when any choice is a band
 * (outside the model's range), every choice is shown as its band, read from
 * the same rules thresholds, never "14% / 11% / Less likely" in one row.
 */
export function rowLikelihoods(a: PricingAnalysis | null, choices: Choice[]): Map<ChoiceKey, Likelihood | null> {
  const out = new Map<ChoiceKey, Likelihood | null>();
  const mixed =
    choices.some((c) => c.likelihood?.level === 'model') && choices.some((c) => c.likelihood?.level === 'rules');
  for (const c of choices) {
    if (!mixed || c.likelihood?.level !== 'model') {
      out.set(c.key, c.likelihood);
      continue;
    }
    const t = a?.likelihood?.rules;
    const band: Band | null =
      !t || t.likelyMax == null || t.evenMax == null
        ? null
        : c.price <= t.likelyMax
          ? 'likely'
          : c.price <= t.evenMax
            ? 'even'
            : 'less_likely';
    out.set(c.key, { level: 'rules', band, label: band ? BAND_LABEL[band] : NO_BAND, outsideModelRange: false });
  }
  return out;
}

// ----------------------------------------------------------- display helpers

const MINUS = '−';

/** Whole-number percent with a true minus sign; half away from zero. */
export const signedPct = (n: number) =>
  `${n < 0 && Math.round(Math.abs(n)) !== 0 ? MINUS : ''}${Math.round(Math.abs(n))}%`;

/** Dot shade only (the words carry the meaning): a model % shades like its band. */
export const lkTone = (l: { level: 'model'; pct: number } | { level: 'rules'; band: string | null }) =>
  l.level === 'model' ? (l.pct >= 60 ? 'likely' : l.pct >= 35 ? 'even' : 'less_likely') : (l.band ?? 'none');

/** One vocabulary: "chance to win", short form "72% to win". */
export const likelihoodShort = (l: { level: 'model'; pct: number } | { level: 'rules'; label: string } | null) =>
  !l ? null : l.level === 'model' ? `${Math.round(l.pct)}% to win` : l.label;

/** The one way out of a loss, the same in the panel and the bar: the lowest
 *  choice whose price clears the floor (normally Safe). */
export function wayOutChoice(choices: Choice[], floor: number | null): Choice | null {
  if (floor == null) return null;
  return [...choices].sort((a, b) => a.price - b.price).find((c) => c.price >= floor) ?? null;
}

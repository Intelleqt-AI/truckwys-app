// TruckWys quote rules, client mirror (QUOTE-RULES.md, 7 Oct 2026).
//
// The backend owns these rules: core/services/quote_costing.py::compute().
// `computeCosting` below is a line-for-line port of it, checked against the
// backend's golden vectors (__tests__/quote_golden.json, copied verbatim) by
// __tests__/quoteGolden.test.mjs, to the cent. Change the backend first.
//
// Self-contained on purpose: no imports, no path aliases, no RN. That keeps it
// runnable under plain `node --test` (type stripping) as well as Metro.
//
// Arithmetic contract (so JS and Python agree to the cent): IEEE doubles, the
// operations in the order written, and cents(x) = floor(x * 100 + 0.5) / 100
// applied ONLY to each line total, the floor, margin and the target price.

// ── Warnings (§10) ───────────────────────────────────────────────────────────

export type Severity = 'block' | 'warn';

export interface WarningAction {
  id: string;
  label: string;
}

export interface QuoteWarning {
  code: string;
  severity: Severity;
  /** ≤ 8 words. */
  title: string;
  /** ≤ 1 short sentence. */
  detail: string;
  impact_zar: number | null;
  actions: WarningAction[];
  [extra: string]: unknown;
}

export const ACTION_LABELS: Record<string, string> = {
  use_official: 'Use official price',
  update_own: 'Update my price',
  retry_diesel: 'Try again',
  choose_vehicle: 'Choose truck',
  add_vehicle: 'Add a truck',
  edit_vehicle: 'Check truck',
  enter_tolls: 'Enter tolls',
  confirm_no_tolls: 'No tolls on this route',
  recalculate_route: 'Recalculate route',
  confirm_distance: 'Distance is right',
  enter_route: 'Add route',
  enter_driver_cost: 'Enter driver cost',
  update_allowance: 'Set allowance',
  use_minimum: 'Use minimum charge',
  reprice: 'Re-price',
  keep_price: 'Keep price',
  enter_weight: 'Enter weight',
};

function warning(
  code: string,
  severity: Severity,
  title: string,
  detail: string,
  impact: number | null = null,
  actions: string[] = [],
  extra: Record<string, unknown> = {},
): QuoteWarning {
  return {
    code,
    severity,
    title,
    detail,
    impact_zar: impact,
    actions: actions.map((id) => ({ id, label: ACTION_LABELS[id] ?? id })),
    ...extra,
  };
}

// ── Numbers and SA formatting ────────────────────────────────────────────────

/** floor(x * 100 + 0.5) / 100, exactly as the backend. */
export function cents(x: number): number;
export function cents(x: number | null): number | null;
export function cents(x: number | null): number | null {
  if (x === null) return null;
  return Math.floor(x * 100 + 0.5) / 100;
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const pos = (v: unknown): number | null => {
  const n = toNum(v);
  return n !== null && n > 0 ? n : null;
};

const NBSP = ' ';

/** SA style: space thousands, comma decimals ("1 050", "32,80"). */
export function fmtNum(v: number, dp = 0): string {
  const abs = Math.abs(v).toFixed(dp);
  const [i, d] = abs.split('.');
  const txt = `${(i ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${d ? `,${d}` : ''}`;
  return (v < 0 && /[1-9]/.test(txt) ? '−' : '') + txt;
}

/** "R 32,80" / "R 1 050" (whole rand half-up when dp = 0). */
export function fmtRand(v: number, dp = 0): string {
  let x = v;
  if (dp === 0) x = Math.floor(Math.abs(x) + 0.5) * (x >= 0 ? 1 : -1);
  const sign = x < 0 && Math.abs(x) >= (dp === 0 ? 0.5 : 0.005) ? '−' : '';
  return `${sign}R ${fmtNum(Math.abs(x), dp)}`;
}

/** Display variant with non-breaking spaces (never wraps inside a figure). */
export function rand(v: number, whole = false): string {
  return fmtRand(v, whole ? 0 : 2).replace(/ /g, NBSP);
}

/** "+R 1 050" / "−R 120". */
export function signedRand(n: number): string {
  return `${n < 0 ? '−' : '+'}${rand(Math.abs(n), true)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SAST_MS = 2 * 3600_000;

/** ISO → epoch ms (a bare date is a SAST calendar day). Null when unreadable. */
export function parseTime(v: unknown): number | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T00:00:00+02:00`);
  // Naive datetimes are UTC, as the backend reads them.
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const t = Date.parse(hasZone ? s : `${s}Z`);
  return Number.isFinite(t) ? t : null;
}

/** "7 Oct 2026" in SAST. */
export function saDate(v: unknown): string | null {
  const t = parseTime(v);
  if (t === null) return null;
  const d = new Date(t + SAST_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "7 Oct" in SAST. */
export function saShortDate(v: unknown): string | null {
  const full = saDate(v);
  return full ? full.replace(/ \d{4}$/, '') : null;
}

// ── SA diesel period (§2) ────────────────────────────────────────────────────

/**
 * Start of the current SA fuel-price period: 00:01 SAST on the most recent
 * first Wednesday of a month that is ≤ now. Returned as a UTC Date.
 */
export function currentPeriodStart(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + SAST_MS);
  const startFor = (y: number, m: number) => {
    const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const day = 1 + ((3 - firstDow + 7) % 7);
    return new Date(Date.UTC(y, m, day, 0, 1) - SAST_MS);
  };
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const here = startFor(y, m);
  if (here.getTime() <= now.getTime()) return here;
  return m === 0 ? startFor(y - 1, 11) : startFor(y, m - 1);
}

/** Was something priced at `pricedAt` in an earlier diesel period than now? */
export function pricedInEarlierPeriod(pricedAt: unknown, now: Date = new Date()): boolean {
  const t = parseTime(pricedAt);
  return t !== null && t < currentPeriodStart(now).getTime();
}

// ── Diesel (§1) ──────────────────────────────────────────────────────────────

export type FuelZone = 'INLAND' | 'COASTAL';
export type DieselSource = 'own' | 'official' | 'override' | 'missing';

/** compute()'s `diesel` input. */
export interface DieselInput {
  zone: FuelZone;
  mode: 'LIVE' | 'OWN';
  own_price: number | null;
  own_set_at: string | null;
  official_price: number | null;
  official_effective_from: string | null;
  official_stale: boolean;
  use_official: boolean;
  override_price: number | null;
}

export interface DieselResolution {
  zone: FuelZone;
  mode: 'LIVE' | 'OWN';
  own_price: number | null;
  own_set_at: string | null;
  official_price: number | null;
  official_effective_from: string | null;
  official_stale: boolean;
  price: number | null;
  source: DieselSource;
}

const isoUtc = (v: unknown): string | null => {
  const t = parseTime(v);
  return t === null ? null : new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
};

/** Port of quote_costing.resolve_diesel. */
export function resolveDieselInput(d: Partial<DieselInput> | null | undefined): DieselResolution {
  const x = d ?? {};
  const zone: FuelZone = String(x.zone ?? 'INLAND').toUpperCase() === 'COASTAL' ? 'COASTAL' : 'INLAND';
  let mode = String(x.mode ?? 'LIVE').toUpperCase() as 'LIVE' | 'OWN';
  const own = pos(x.own_price);
  if (mode !== 'OWN' || own === null) mode = own === null ? 'LIVE' : mode;
  const official = pos(x.official_price);
  const override = pos(x.override_price);
  const base = {
    zone,
    mode,
    own_price: own,
    own_set_at: isoUtc(x.own_set_at),
    official_price: official,
    official_effective_from: isoUtc(x.official_effective_from),
    official_stale: official !== null ? !!x.official_stale : false,
  };
  if (override !== null) return { ...base, price: override, source: 'override' };
  if (mode === 'OWN' && !x.use_official) return { ...base, price: own, source: 'own' };
  if (official !== null) return { ...base, price: official, source: 'official' };
  return { ...base, price: null, source: 'missing' };
}

/** Port of quote_costing.diesel_warnings. */
export function dieselWarnings(diesel: DieselResolution, litresTotal: number | null = null): QuoteWarning[] {
  const out: QuoteWarning[] = [];
  const zoneTxt = diesel.zone === 'COASTAL' ? 'coastal' : 'inland';
  if (diesel.source === 'missing') {
    out.push(
      warning(
        'diesel_missing',
        'block',
        'No diesel price available',
        'No official price on record; set your own in settings.',
        null,
        ['retry_diesel', 'update_own'],
      ),
    );
    return out;
  }
  if (diesel.source === 'own' && diesel.official_price) {
    const own = diesel.own_price!;
    const official = diesel.official_price;
    if (Math.abs(own - official) / official > 0.03) {
      const impact = litresTotal !== null ? cents((own - official) * litresTotal) : null;
      const moreLess =
        impact !== null ? `: ${fmtRand(Math.abs(impact))} ${impact > 0 ? 'more' : 'less'} on this quote` : '';
      out.push(
        warning(
          'diesel_own_off',
          'warn',
          'Your diesel price differs from official',
          `Yours ${fmtRand(own, 2)}/L, official ${fmtRand(official, 2)}/L (${zoneTxt})${moreLess}.`,
          impact,
          ['use_official', 'update_own'],
          { own_price: own, official_price: official },
        ),
      );
    }
    const setAt = parseTime(diesel.own_set_at);
    const eff = parseTime(diesel.official_effective_from);
    if (setAt !== null && eff !== null && setAt < eff) {
      out.push(
        warning(
          'diesel_own_old',
          'warn',
          'Your diesel price predates the latest change',
          `Set ${saDate(diesel.own_set_at)}; official price changed ${saDate(diesel.official_effective_from)}.`,
          null,
          ['update_own', 'use_official'],
        ),
      );
    }
  }
  if (diesel.source === 'official' && diesel.official_stale) {
    const eff = diesel.official_effective_from;
    out.push(
      warning(
        'diesel_stale',
        'warn',
        'Official diesel price may be out of date',
        eff ? `Latest on record is from ${saDate(eff)}.` : "This month's price is not loaded yet.",
        null,
        ['retry_diesel', 'update_own'],
      ),
    );
  }
  return out;
}

// ── Diesel from the API (old and new backend) ───────────────────────────────

/** The old Company.fuel_price_per_litre model default. Never a price. */
export const LEGACY_DIESEL_SENTINEL = 23.5;

type Loose = Record<string, unknown> | null | undefined;

const isFallbackSource = (s: unknown) => typeof s === 'string' && /^FALLBACK/i.test(s);

/** The server's own resolution (new backend), from either API object. */
function serverResolution(company: Loose, live: Loose): Loose {
  const fromLive = live?.company_price;
  if (fromLive && typeof fromLive === 'object') return fromLive as Record<string, unknown>;
  const fromCompany = company?.diesel_price_in_use;
  if (fromCompany && typeof fromCompany === 'object') return fromCompany as Record<string, unknown>;
  return null;
}

/** Official price in force for the zone from GET fuel-prices/current/. FALLBACK rows never count. */
export function officialFromLive(live: Loose, zone: FuelZone): { price: number | null; from: string | null } {
  const server = serverResolution(null, live);
  const so = (server?.official ?? null) as Loose;
  if (so && (server?.zone ?? zone) === zone) {
    const price = pos(so.price);
    return { price, from: price !== null && typeof so.effective_from === 'string' ? so.effective_from : null };
  }
  if (!live || live.success === false || isFallbackSource(live.source)) return { price: null, from: null };
  const price =
    (live.zone === zone ? pos(live.zone_price) : null) ??
    pos(zone === 'COASTAL' ? live.coastal_price : live.inland_price);
  const from =
    (typeof live.effective_from === 'string' && live.effective_from) ||
    (typeof live.last_updated === 'string' && live.last_updated) ||
    null;
  return { price, from: price !== null ? from : null };
}

/** Every official figure in a live response (inland/coastal, 50 and 500ppm). */
function officialFigures(live: Loose): number[] {
  if (!live || live.success === false || isFallbackSource(live.source)) return [];
  return [
    live.zone_price,
    live.inland_price,
    live.coastal_price,
    live.diesel_inland,
    live.diesel_coastal,
    live.diesel_500ppm_inland,
    live.diesel_500ppm_coastal,
  ]
    .map(pos)
    .filter((n): n is number => n !== null);
}

/**
 * compute()'s diesel input from the company profile and GET
 * fuel-prices/current/.
 *
 * New backend: fuel_price_mode / fuel_price_own / fuel_price_own_set_at, and
 * the server's resolution (company_price / diesel_price_in_use) for the
 * official price, its date and staleness.
 * Old backend: fuel_price_per_litre, where 23.50, null or any official figure
 * means LIVE (the §1 migration rule), and staleness worked out here from
 * effective_from against the current first-Wednesday period.
 */
export function dieselInputFromApi(
  company: Loose,
  live: Loose,
  opts: { useOfficial?: boolean; overridePrice?: number | null; now?: Date } = {},
): DieselInput {
  const server = serverResolution(company, live);
  const zone: FuelZone =
    (company?.fuel_zone ?? server?.zone ?? live?.zone) === 'COASTAL' ? 'COASTAL' : 'INLAND';
  const off = officialFromLive(server ? { company_price: server } : live, zone);
  let mode: 'LIVE' | 'OWN' = 'LIVE';
  let own: number | null = null;
  let ownSetAt: string | null = null;
  if (company && 'fuel_price_mode' in company) {
    if (String(company.fuel_price_mode).toUpperCase() === 'OWN') {
      own = pos(company.fuel_price_own);
      mode = own !== null ? 'OWN' : 'LIVE';
      ownSetAt = typeof company.fuel_price_own_set_at === 'string' ? company.fuel_price_own_set_at : null;
    }
  } else if (company) {
    const legacy = pos(company.fuel_price_per_litre);
    const sentinel = legacy !== null && Math.abs(legacy - LEGACY_DIESEL_SENTINEL) < 0.005;
    const official = legacy !== null && officialFigures(live).some((p) => Math.abs(p - legacy) <= 0.005);
    if (legacy !== null && !sentinel && !official) {
      own = legacy;
      mode = 'OWN';
    }
  }
  const serverStale = ((server?.official ?? null) as Loose)?.stale;
  const fromT = parseTime(off.from);
  const stale =
    off.price !== null &&
    (typeof serverStale === 'boolean'
      ? serverStale
      : live?.stale === true ||
        (fromT !== null && fromT < currentPeriodStart(opts.now ?? new Date()).getTime()));
  return {
    zone,
    mode,
    own_price: own,
    own_set_at: ownSetAt,
    official_price: off.price,
    official_effective_from: off.from,
    official_stale: stale,
    use_official: !!opts.useOfficial,
    override_price: opts.overridePrice ?? null,
  };
}

/** Diesel resolution straight from the API objects (insights, settings). */
export function resolveDiesel(company: Loose, live: Loose, now?: Date): DieselResolution {
  return resolveDieselInput(dieselInputFromApi(company, live, { now }));
}

// ── Truck (§3) ───────────────────────────────────────────────────────────────

export interface TruckLike {
  id?: number | string;
  name: string;
  capacity?: unknown;
  fuel_consumption_l_per_100km?: unknown;
  fuel_type?: unknown;
}

/** §3: values > 100 are kg. Null when unknown or not positive. */
export function capacityTonnes(raw: unknown): number | null {
  const v = pos(raw);
  if (v === null) return null;
  return v > 100 ? v / 1000 : v;
}

export function ratedBurn(t: TruckLike | null | undefined): number | null {
  return pos(t?.fuel_consumption_l_per_100km);
}

/** Smallest capacity ≥ load; tie → lowest rated burn. Null when nothing fits. */
export function suggestTruck<T extends TruckLike>(types: T[], loadT: number): T | null {
  if (!(loadT > 0)) return null;
  const fits = types
    .map((t) => ({ t, cap: capacityTonnes(t.capacity) }))
    .filter((x): x is { t: T; cap: number } => x.cap !== null && x.cap >= loadT);
  if (!fits.length) return null;
  fits.sort((a, b) => a.cap - b.cap || (ratedBurn(a.t) ?? Infinity) - (ratedBurn(b.t) ?? Infinity));
  return fits[0]!.t;
}

// ── Operating cost per km (§6) ──────────────────────────────────────────────

// Class defaults, R/km excl. fuel and tolls: the backend's OPERATING_COST_CLASSES.
export const OPERATING_CLASS_DEFAULTS: Record<string, number> = {
  light: 8.0,
  rigid: 11.0,
  tri_axle: 14.5,
  reefer: 17.0,
  superlink: 16.0,
};
export const DEFAULT_OPERATING_CLASS = 'tri_axle';

/** Backend vehicle_class(): keywords in the name, then capacity. */
export function vehicleClass(t: TruckLike | null | undefined): string {
  const text = String(t?.name ?? '').toLowerCase();
  const kw: [string, string[]][] = [
    ['superlink', ['superlink', 'interlink']],
    ['reefer', ['reefer', 'refrig', 'fridge']],
    ['light', ['bakkie', '1-ton', '1 ton', '4-ton', '4 ton', 'light', 'van']],
    ['rigid', ['rigid', 'box truck', '8-ton', '8 ton', '6x4', 'tipper', 'dropside']],
    ['tri_axle', ['tautliner', 'flatbed', 'tri-axle', 'triaxle', 'semi', 'tanker', 'side tipper']],
  ];
  for (const [key, words] of kw) if (words.some((w) => text.includes(w))) return key;
  const cap = capacityTonnes(t?.capacity) ?? 0;
  if (cap <= 0) return DEFAULT_OPERATING_CLASS;
  if (cap <= 8) return 'light';
  if (cap <= 18) return 'rigid';
  if (cap <= 34) return 'tri_axle';
  return 'superlink';
}

export interface OperatingCost {
  perKm: number;
  source: 'company_setting' | 'company_actuals' | 'vehicle_default';
  cls: string;
}

export interface FleetTypeLike extends TruckLike {
  /** Vehicles of this type the company owns (any status). */
  owned_vehicle_count?: number;
  /** null = shared platform default; a number = the company's own row. */
  company?: number | null;
}

/**
 * The class a company-wide operating cost describes (backend
 * fleet_reference_class): the most common class among the company's trucks,
 * else among its own vehicle types; null when it has neither.
 */
export function fleetReferenceClass(types: FleetTypeLike[] | null | undefined): string | null {
  const counts = new Map<string, number>();
  for (const t of types ?? []) {
    const n = t.owned_vehicle_count ?? 0;
    if (n > 0) counts.set(vehicleClass(t), (counts.get(vehicleClass(t)) ?? 0) + n);
  }
  if (!counts.size) {
    for (const t of types ?? []) {
      if (t.company !== null && t.company !== undefined) counts.set(vehicleClass(t), (counts.get(vehicleClass(t)) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [cls, n] of counts) {
    if (n > bestN) {
      best = cls;
      bestN = n;
    }
  }
  return best;
}

/**
 * Operating cost per km for this truck's class (backend operating_cost_for):
 * the company's figure (setting, else actuals), scaled by the class defaults
 * when the fleet's main class differs; else the class default.
 */
export function operatingCostPerKm(
  company: Loose,
  truck: TruckLike | null,
  fleet?: FleetTypeLike[] | null,
): OperatingCost {
  const cls = vehicleClass(truck);
  const classDefault = OPERATING_CLASS_DEFAULTS[cls] ?? OPERATING_CLASS_DEFAULTS[DEFAULT_OPERATING_CLASS]!;
  const setting = pos(company?.operating_cost_per_km);
  const inUse = (company?.operating_cost_in_use ?? null) as Loose;
  const actuals = inUse
    ? inUse.source === 'company_actuals'
      ? pos(inUse.value)
      : pos(inUse.actuals_value)
    : null;
  const figure = setting ?? actuals;
  if (figure !== null) {
    const ref = fleetReferenceClass(fleet);
    const scaled =
      ref && ref !== cls ? (figure * classDefault) / (OPERATING_CLASS_DEFAULTS[ref] ?? classDefault) : figure;
    return {
      perKm: Math.round(scaled * 100) / 100,
      source: setting !== null ? 'company_setting' : 'company_actuals',
      cls,
    };
  }
  return { perKm: classDefault, source: 'vehicle_default', cls };
}

// ── The calculation: port of quote_costing.compute() ────────────────────────

export const DEFAULT_HOURS_PER_DAY = 9;
export const DEFAULT_EMPTY_RETURN_MIN_KM = 300;

/** Nights slept away for `hours` of driving (null when unknown). */
export function nightsAway(hours: number | null, hoursPerDay = DEFAULT_HOURS_PER_DAY): number | null {
  if (hours === null || hours <= 0) return hours === null ? null : 0;
  return Math.max(Math.ceil(hours / hoursPerDay) - 1, 0);
}

export interface CostingInputs {
  trip_type?: 'ONE_WAY' | 'ROUND_TRIP' | string;
  distance_km?: number | null;
  distance_estimated?: boolean;
  distance_confirmed?: boolean;
  duration_minutes?: number | null;
  load_kg?: number | null;
  vehicle?: { id?: unknown; name?: string; capacity?: unknown; rated_burn_l_per_100km?: unknown } | null;
  diesel?: Partial<DieselInput> | null;
  operating_cost_per_km?: number | null;
  operating_cost_source?: string | null;
  tolls?: {
    one_way?: number | null;
    empty_return?: number | null;
    lookup_failed?: boolean;
    confirmed_none?: boolean;
  } | null;
  driver?: { allowance_per_night?: number | null; nights?: number | null; amount?: number | null } | null;
  hours_per_day?: number | null;
  border_cost?: number | null;
  include_empty_return?: boolean | null;
  settings?: { include_empty_return_default?: boolean | null; empty_return_min_km?: number | null } | null;
  minimum_charge?: number | null;
  target_margin_pct?: number | null;
  price?: number | null;
}

export type LineKey =
  | 'fuel'
  | 'operating'
  | 'tolls'
  | 'driver'
  | 'border'
  | 'fuel_return'
  | 'operating_return'
  | 'tolls_return'
  | 'driver_return';

export const LINE_LABELS: Record<LineKey, string> = {
  fuel: 'Fuel',
  operating: 'Operating costs',
  tolls: 'Tolls',
  driver: 'Driver nights out',
  border: 'Border fees',
  fuel_return: 'Fuel, empty return',
  operating_return: 'Operating costs, empty return',
  tolls_return: 'Tolls, empty return',
  driver_return: 'Driver nights, empty return',
};

export interface CostingLine {
  key: LineKey;
  label: string;
  leg: 'loaded' | 'empty_return';
  amount: number | null;
  basis: string;
  [extra: string]: unknown;
}

export interface Costing {
  version: string;
  trip: {
    type: 'ONE_WAY' | 'ROUND_TRIP';
    legs_loaded: number;
    distance_km: number | null;
    empty_return_included: boolean;
    empty_return_default: boolean;
    km_loaded: number | null;
    km_empty: number;
    km_driven: number | null;
    hours_one_way: number | null;
    return_nights: number | null;
  };
  vehicle: {
    id: unknown;
    name: unknown;
    capacity_t: number | null;
    load_t: number | null;
    load_ratio: number | null;
    rated_burn_l_per_100km: number | null;
    burn_loaded_l_per_100km: number | null;
    burn_empty_l_per_100km: number | null;
  } | null;
  diesel: DieselResolution;
  litres: { loaded: number | null; empty_return: number | null; total: number | null };
  lines: CostingLine[];
  floor: number | null;
  floor_known: number;
  floor_complete: boolean;
  target_margin_pct: number | null;
  target_price: number | null;
  minimum_charge: number | null;
  price: number | null;
  margin: number | null;
  margin_pct: number | null;
  warnings: QuoteWarning[];
  blocking: string[];
  can_send: boolean;
}

const plural = (n: number | null) => (n !== 1 ? 's' : '');

export function computeCosting(inputs: CostingInputs | null | undefined): Costing {
  const inp = inputs ?? {};
  const warnings: QuoteWarning[] = [];

  // --- trip ---
  const roundTrip = String(inp.trip_type ?? 'ONE_WAY').toUpperCase() === 'ROUND_TRIP';
  const legsLoaded = roundTrip ? 2 : 1;
  const distance = pos(inp.distance_km);
  const settings = inp.settings ?? {};
  const defaultOn =
    settings.include_empty_return_default === null || settings.include_empty_return_default === undefined
      ? true
      : !!settings.include_empty_return_default;
  const minKmRaw = toNum(settings.empty_return_min_km);
  const minKm = minKmRaw === null ? DEFAULT_EMPTY_RETURN_MIN_KM : minKmRaw;
  const requested = inp.include_empty_return;
  let emptyReturn: boolean;
  if (roundTrip || distance === null) emptyReturn = false;
  else if (requested !== null && requested !== undefined) emptyReturn = !!requested;
  else emptyReturn = defaultOn && distance >= minKm;
  const kmLoaded = distance !== null ? distance * legsLoaded : null;
  const kmEmpty = emptyReturn && distance !== null ? distance : 0.0;

  if (distance === null) {
    warnings.push(
      warning(
        'distance_missing',
        'block',
        'Route distance is missing',
        'Add collection and delivery to work out the route.',
        null,
        ['enter_route'],
      ),
    );
  } else if (inp.distance_estimated && !inp.distance_confirmed) {
    warnings.push(
      warning(
        'distance_estimated',
        'block',
        'Distance is a straight-line estimate',
        `${fmtNum(distance)} km was estimated; recalculate or confirm it.`,
        null,
        ['recalculate_route', 'confirm_distance'],
      ),
    );
  }

  // --- truck (§3) ---
  const vehicle = inp.vehicle ?? null;
  let capT: number | null = null;
  let loadT: number | null = null;
  let ratio: number | null = null;
  let rated: number | null = null;
  let burnLoaded: number | null = null;
  let burnEmpty: number | null = null;
  const loadKg = toNum(inp.load_kg);
  if (vehicle === null) {
    warnings.push(
      warning(
        'no_vehicle',
        'block',
        'Choose a truck for this quote',
        'Every quote is priced on one of your vehicle types.',
        null,
        ['choose_vehicle', 'add_vehicle'],
      ),
    );
  } else {
    capT = capacityTonnes(vehicle.capacity);
    rated = pos(vehicle.rated_burn_l_per_100km);
    loadT = loadKg !== null && loadKg >= 0 ? loadKg / 1000 : null;
    ratio = capT !== null && loadT !== null ? Math.min(loadT / capT, 1) : 1;
    if (loadT === null) {
      warnings.push(
        warning(
          'load_missing',
          'warn',
          'Load weight is missing',
          'Fuel is priced as a full load until you enter it.',
          null,
          ['enter_weight'],
        ),
      );
    }
    if (rated !== null) {
      burnLoaded = rated * (0.7 + 0.3 * ratio);
      burnEmpty = rated * 0.7;
    } else {
      warnings.push(
        warning(
          'truck_burn_missing',
          'block',
          'Truck fuel use is missing',
          `Set litres per 100 km for ${vehicle.name || 'this truck'}.`,
          null,
          ['edit_vehicle'],
        ),
      );
    }
    if (capT !== null && loadT !== null && loadT > capT) {
      warnings.push(
        warning(
          'overload',
          'block',
          'Load is heavier than the truck',
          `${fmtNum(loadT, 1)} t on a ${fmtNum(capT, 1)} t truck.`,
          null,
          ['choose_vehicle'],
        ),
      );
    }
    if (capT !== null && ((rated !== null && rated < 20 && capT >= 8) || capT > 40)) {
      const what =
        capT > 40
          ? `${fmtNum(capT, 1)} t payload looks like GVM`
          : `${fmtNum(rated ?? 0, 1)} L/100km for ${fmtNum(capT, 1)} t looks low`;
      warnings.push(
        warning('truck_burn_suspect', 'warn', "Check this truck's fuel or capacity", `${what}.`, null, [
          'edit_vehicle',
        ]),
      );
    }
  }

  const litresLoaded = kmLoaded !== null && burnLoaded !== null ? (kmLoaded * burnLoaded) / 100 : null;
  const litresEmpty =
    emptyReturn && burnEmpty !== null ? (kmEmpty * burnEmpty) / 100 : !emptyReturn ? 0.0 : null;
  const litresTotal = litresLoaded !== null && litresEmpty !== null ? litresLoaded + litresEmpty : null;

  // --- diesel (§1) ---
  const diesel = resolveDieselInput(inp.diesel);
  warnings.push(...dieselWarnings(diesel, litresTotal));
  const priceL = diesel.price;

  const lines: CostingLine[] = [];
  let complete = true;
  const add = (
    key: LineKey,
    leg: 'loaded' | 'empty_return',
    amount: number | null,
    basis: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (amount === null) complete = false;
    lines.push({ key, label: LINE_LABELS[key], leg, amount, basis, ...extra });
  };

  // --- fuel (§4) ---
  const fuelAmt = litresLoaded !== null && priceL !== null ? cents(litresLoaded * priceL) : null;
  add(
    'fuel',
    'loaded',
    fuelAmt,
    `${fmtNum(kmLoaded ?? 0)} km at ${burnLoaded ? fmtNum(burnLoaded, 1) : '?'} L/100km` +
      (priceL ? ` × ${fmtRand(priceL, 2)}/L` : ''),
    { litres: litresLoaded, burn_l_per_100km: burnLoaded, price_per_litre: priceL, km: kmLoaded },
  );

  // --- operating cost (§6) ---
  const op = toNum(inp.operating_cost_per_km);
  const opAmt = kmLoaded !== null && op !== null ? cents(kmLoaded * op) : null;
  add('operating', 'loaded', opAmt, `${fmtNum(kmLoaded ?? 0)} km × ${op !== null ? fmtRand(op, 2) : '?'}/km`, {
    rate_per_km: op,
    km: kmLoaded,
    source: inp.operating_cost_source ?? null,
  });

  // --- tolls (§6) ---
  const tolls = inp.tolls ?? {};
  let tollOneWay = toNum(tolls.one_way);
  let tollsUnknown = tollOneWay === null || !!tolls.lookup_failed;
  if (tollsUnknown && tolls.confirmed_none) {
    tollOneWay = 0.0;
    tollsUnknown = false;
  }
  if (tollsUnknown) {
    tollOneWay = null;
    warnings.push(
      warning(
        'tolls_unknown',
        'block',
        'Tolls could not be worked out',
        'Enter the tolls, or confirm there are none on this route.',
        null,
        ['enter_tolls', 'confirm_no_tolls'],
      ),
    );
  }
  const tollAmt = tollOneWay !== null ? cents(tollOneWay * legsLoaded) : null;
  add(
    'tolls',
    'loaded',
    tollAmt,
    tollOneWay === null
      ? 'Unknown'
      : roundTrip
        ? `${fmtRand(tollOneWay, 2)} × 2 legs`
        : `${fmtRand(tollOneWay, 2)} one way`,
    { one_way: tollOneWay, legs: legsLoaded },
  );

  // --- driver nights (§6) ---
  const driver = inp.driver ?? {};
  const hpd = pos(inp.hours_per_day) ?? DEFAULT_HOURS_PER_DAY;
  const minutes = pos(inp.duration_minutes);
  const hours = minutes !== null ? minutes / 60 : null;
  const rate = pos(driver.allowance_per_night);
  const nightsOne = nightsAway(hours, hpd);
  const nightsTwo = hours !== null ? nightsAway(hours * 2, hpd) : null;
  const suggestedNights = roundTrip ? nightsTwo : nightsOne;
  const nightsOverride = toNum(driver.nights);
  const nights =
    nightsOverride !== null && nightsOverride >= 0 ? Math.trunc(nightsOverride) : suggestedNights;
  const userAmount = toNum(driver.amount);
  const suggested = nights !== null && rate !== null ? cents(nights * rate) : nights === 0 ? 0.0 : null;
  let drvAmt: number | null;
  let drvSource: 'user' | 'suggested';
  if (userAmount !== null && userAmount >= 0) {
    drvAmt = cents(userAmount);
    drvSource = 'user';
  } else {
    drvAmt = suggested;
    drvSource = 'suggested';
  }
  if (drvAmt === null) {
    if (nights === null) {
      warnings.push(
        warning(
          'driver_nights_unknown',
          'block',
          'Driving time is unknown',
          'Enter the driver cost, or recalculate the route.',
          null,
          ['enter_driver_cost', 'recalculate_route'],
        ),
      );
    } else {
      warnings.push(
        warning(
          'driver_allowance_missing',
          'block',
          'Driver nights have no allowance',
          `${nights} night${plural(nights)} away: enter the driver cost or set a rate.`,
          null,
          ['enter_driver_cost', 'update_allowance'],
        ),
      );
    }
  }
  add(
    'driver',
    'loaded',
    drvAmt,
    drvSource === 'user'
      ? 'Your figure'
      : rate !== null && nights
        ? `${nights} night${plural(nights)} × ${fmtRand(rate, 2)}`
        : nights === 0
          ? 'No night away'
          : 'Unknown',
    { nights, suggested_nights: suggestedNights, rate_per_night: rate, suggested, source: drvSource },
  );

  // --- border ---
  const border = toNum(inp.border_cost);
  if (border !== null && border > 0) add('border', 'loaded', cents(border), 'Border, permit and non-SA toll costs');

  // --- empty return (§5) ---
  let returnNights: number | null = null;
  if (emptyReturn) {
    const frAmt = litresEmpty !== null && priceL !== null ? cents(litresEmpty * priceL) : null;
    add(
      'fuel_return',
      'empty_return',
      frAmt,
      `${fmtNum(kmEmpty)} km empty at ${burnEmpty ? fmtNum(burnEmpty, 1) : '?'} L/100km` +
        (priceL ? ` × ${fmtRand(priceL, 2)}/L` : ''),
      { litres: litresEmpty, burn_l_per_100km: burnEmpty, price_per_litre: priceL, km: kmEmpty },
    );
    add(
      'operating_return',
      'empty_return',
      op !== null ? cents(kmEmpty * op) : null,
      `${fmtNum(kmEmpty)} km × ${op !== null ? fmtRand(op, 2) : '?'}/km`,
      { rate_per_km: op, km: kmEmpty, source: inp.operating_cost_source ?? null },
    );
    let retToll = toNum(tolls.empty_return);
    if (retToll === null) retToll = tollOneWay;
    add(
      'tolls_return',
      'empty_return',
      retToll !== null ? cents(retToll) : null,
      retToll === null ? 'Unknown' : `${fmtRand(retToll, 2)} home empty`,
      { one_way: retToll },
    );
    returnNights = nightsOne !== null && nightsTwo !== null ? nightsTwo - nightsOne : null;
    const drAmt =
      returnNights !== null && rate !== null ? cents(returnNights * rate) : returnNights === 0 ? 0.0 : null;
    if (drAmt === null && drvAmt !== null) {
      warnings.push(
        warning(
          'driver_allowance_missing',
          'block',
          'Driver nights have no allowance',
          `${returnNights} extra night${plural(returnNights)} coming home: set a rate per night.`,
          null,
          ['update_allowance'],
        ),
      );
    }
    add(
      'driver_return',
      'empty_return',
      drAmt,
      rate !== null && returnNights
        ? `${returnNights} extra night${plural(returnNights)} × ${fmtRand(rate, 2)}`
        : returnNights === 0
          ? 'No extra night'
          : 'Unknown',
      { nights: returnNights, rate_per_night: rate },
    );
  }

  if (op === null && distance !== null) complete = false;
  const known = lines.map((l) => l.amount).filter((a): a is number => a !== null);
  // Python sum() adds left to right from 0, as reduce does.
  const floorKnown = known.length ? cents(known.reduce((s, a) => s + a, 0)) : 0.0;
  const floor = complete ? floorKnown : null;

  // --- price and margin (§7) ---
  const target = toNum(inp.target_margin_pct);
  const minimum = pos(inp.minimum_charge);
  let targetPrice: number | null = null;
  if (floor !== null && target !== null && target < 100) {
    targetPrice = cents(floor / (1 - target / 100));
    if (minimum !== null && minimum > targetPrice) targetPrice = minimum;
  }
  const price = pos(inp.price);
  let margin: number | null = null;
  let marginPct: number | null = null;
  if (price !== null && floor !== null) {
    margin = cents(price - floor);
    marginPct = ((price - floor) / price) * 100;
    if (price < floor) {
      warnings.push(
        warning(
          'below_floor',
          'warn',
          'Price is below your costs',
          `This trip loses ${fmtRand(floor - price)}.`,
          cents(price - floor),
        ),
      );
    }
  }
  if (price !== null && minimum !== null && price < minimum) {
    warnings.push(
      warning(
        'below_minimum_charge',
        'block',
        'Price is below your minimum charge',
        `Your minimum charge is ${fmtRand(minimum)}.`,
        cents(minimum - price),
        ['use_minimum'],
      ),
    );
  }

  const blocking = warnings.filter((w) => w.severity === 'block').map((w) => w.code);
  return {
    version: 'qc-1',
    trip: {
      type: roundTrip ? 'ROUND_TRIP' : 'ONE_WAY',
      legs_loaded: legsLoaded,
      distance_km: distance,
      empty_return_included: emptyReturn,
      empty_return_default: !roundTrip && distance !== null && defaultOn && distance >= minKm,
      km_loaded: kmLoaded,
      km_empty: kmEmpty,
      km_driven: kmLoaded !== null ? kmLoaded + kmEmpty : null,
      hours_one_way: hours,
      return_nights: returnNights,
    },
    vehicle:
      vehicle === null
        ? null
        : {
            id: vehicle.id ?? null,
            name: vehicle.name ?? null,
            capacity_t: capT,
            load_t: loadT,
            load_ratio: ratio,
            rated_burn_l_per_100km: rated,
            burn_loaded_l_per_100km: burnLoaded,
            burn_empty_l_per_100km: burnEmpty,
          },
    diesel,
    litres: { loaded: litresLoaded, empty_return: litresEmpty, total: litresTotal },
    lines,
    floor,
    floor_known: floorKnown,
    floor_complete: floor !== null,
    target_margin_pct: target,
    target_price: targetPrice,
    minimum_charge: minimum,
    price,
    margin,
    margin_pct: marginPct,
    warnings,
    blocking,
    can_send: blocking.length === 0,
  };
}

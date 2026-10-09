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
  enter_border_costs: 'Enter border costs',
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

/**
 * ROUND_HALF_UP on the shortest decimal form of the double (backend
 * _half_up_decimal): 1,005 → 1,01 and 2,5 → 3. Returns "123.45" style.
 */
export function halfUpFixed(v: number, dp: number): string {
  const str = String(Math.abs(v));
  if (/e/i.test(str)) return Math.abs(v).toFixed(dp);
  const [ip = '0', fp = ''] = str.split('.');
  if (fp.length <= dp) return dp ? `${ip}.${fp.padEnd(dp, '0')}` : ip;
  let digits = BigInt(ip + fp.slice(0, dp));
  if (Number(fp[dp]) >= 5) digits += 1n;
  const out = digits.toString().padStart(dp + 1, '0');
  return dp ? `${out.slice(0, -dp)}.${out.slice(-dp)}` : out;
}

/** SA style: space thousands, comma decimals ("1 050", "32,80"), half-up. */
export function fmtNum(v: number, dp = 0): string {
  const abs = halfUpFixed(v, dp);
  const [i, d] = abs.split('.');
  const txt = `${(i ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${d ? `,${d}` : ''}`;
  return (v < 0 && /[1-9]/.test(txt) ? '−' : '') + txt;
}

/** "R 32,80" / "R 1 050" (whole rand half-up when dp = 0). */
export function fmtRand(v: number, dp = 0): string {
  const shown = Number(halfUpFixed(v, dp));
  const sign = v < 0 && shown !== 0 ? '−' : '';
  return `${sign}R ${fmtNum(Math.abs(v), dp)}`;
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
  /**
   * 'Diesel' (default) | 'Petrol' (petrol and hybrid trucks: same rule as
   * diesel, official ULP price) | 'Electric' (own price only).
   */
  fuel_type?: string;
  /** Petrol only: the official grade priced on, '95' | '93' (93 inland only). */
  grade?: string | null;
}

export interface DieselResolution {
  zone: FuelZone;
  mode: 'LIVE' | 'OWN';
  own_price: number | null;
  own_set_at: string | null;
  fuel_type: string;
  official_price: number | null;
  official_effective_from: string | null;
  official_stale: boolean;
  /** Only when the input carried one (petrol). */
  grade?: string;
  price: number | null;
  source: DieselSource;
}

/** ISO 8601 in SAST with its offset ("2026-10-07T00:01:00+02:00"), as the backend's iso(). */
export const isoSast = (v: unknown): string | null => {
  const t = parseTime(v);
  if (t === null) return null;
  const d = new Date(Math.floor(t / 1000) * 1000 + SAST_MS);
  return `${d.toISOString().slice(0, 19)}+02:00`;
};
const isoUtc = isoSast;

/** Port of quote_costing.resolve_diesel. */
export function resolveDieselInput(d: Partial<DieselInput> | null | undefined): DieselResolution {
  const x = d ?? {};
  const zone: FuelZone = String(x.zone ?? 'INLAND').toUpperCase() === 'COASTAL' ? 'COASTAL' : 'INLAND';
  let mode = String(x.mode ?? 'LIVE').toUpperCase() as 'LIVE' | 'OWN';
  const own = pos(x.own_price);
  if (mode !== 'OWN' || own === null) mode = own === null ? 'LIVE' : mode;
  const official = pos(x.official_price);
  const override = pos(x.override_price);
  const base: Omit<DieselResolution, 'price' | 'source'> = {
    zone,
    mode,
    own_price: own,
    own_set_at: isoUtc(x.own_set_at),
    fuel_type: x.fuel_type || 'Diesel',
    official_price: official,
    official_effective_from: isoUtc(x.official_effective_from),
    official_stale: official !== null ? !!x.official_stale : false,
  };
  if (x.grade) base.grade = String(x.grade);
  if (override !== null) return { ...base, price: override, source: 'override' };
  if (mode === 'OWN' && !x.use_official) return { ...base, price: own, source: 'own' };
  if (official !== null) return { ...base, price: official, source: 'official' };
  return { ...base, price: null, source: 'missing' };
}

/** Sum of the fuel line amounts (each to the cent) at `price`. */
const fuelLinesTotal = (parts: number[], price: number) =>
  cents(parts.reduce((s, l) => s + cents(l * price), 0));

/**
 * Port of quote_costing.diesel_warnings: diesel, or petrol by the same rule.
 * Codes stay diesel_* for compatibility; copy names the fuel, and non-diesel
 * warnings carry `fuel_type` (lowercase).
 */
export function dieselWarnings(
  diesel: DieselResolution,
  litresTotal: number | null = null,
  litresParts: number[] | null = null,
): QuoteWarning[] {
  const out: QuoteWarning[] = [];
  const zoneTxt = diesel.zone === 'COASTAL' ? 'coastal' : 'inland';
  const fuel = String(diesel.fuel_type || 'Diesel').toLowerCase();
  const officialFuel = fuel === 'diesel' || fuel === 'petrol'; // fuels with an official FIASA price
  const grade = diesel.grade;
  const where = fuel === 'petrol' && grade ? `${zoneTxt} ${grade}` : zoneTxt;
  const extra: Record<string, unknown> = fuel === 'diesel' ? {} : { fuel_type: fuel };
  if (diesel.source === 'missing') {
    if (officialFuel) {
      out.push(
        warning(
          'diesel_missing',
          'block',
          `No ${fuel} price available`,
          'No official price on record; set your own in settings.',
          null,
          ['retry_diesel', 'update_own'],
          extra,
        ),
      );
    } else if (fuel === 'electric') {
      out.push(
        warning('diesel_missing', 'block', 'No electricity price set', 'Set your electricity cost per kWh in settings.', null, [
          'update_own',
        ], extra),
      );
    } else {
      out.push(
        warning('diesel_missing', 'block', `No ${fuel} price set`, `Set your ${fuel} price per litre in settings.`, null, [
          'update_own',
        ], extra),
      );
    }
    return out;
  }
  if (diesel.source === 'own' && diesel.official_price) {
    const own = diesel.own_price!;
    const official = diesel.official_price;
    if (Math.abs(own - official) / official > 0.03) {
      // Exactly the difference of the fuel line totals.
      const impact =
        litresParts !== null
          ? cents(fuelLinesTotal(litresParts, own) - fuelLinesTotal(litresParts, official))
          : litresTotal !== null
            ? cents((own - official) * litresTotal)
            : null;
      out.push(
        warning(
          'diesel_own_off',
          'warn',
          `Your ${fuel} price differs from official`,
          `Yours ${fmtRand(own, 2)}/L, official ${fmtRand(official, 2)}/L (${where}).`,
          impact,
          ['use_official', 'update_own'],
          { own_price: own, official_price: official, ...extra },
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
          `Your ${fuel} price predates the latest change`,
          `Set ${saDate(diesel.own_set_at)}; official price changed ${saDate(diesel.official_effective_from)}.`,
          null,
          ['update_own', 'use_official'],
          extra,
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
        `Official ${fuel} price may be out of date`,
        eff ? `Latest on record is from ${saDate(eff)}.` : "This month's price is not loaded yet.",
        null,
        ['retry_diesel', 'update_own'],
        extra,
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

/**
 * The official 50ppm figures an old client could have been shown (backend
 * _is_live_echo): either zone (a zone change in the same save shows the other
 * zone). 500ppm figures never count, so a fleet's own R 29,11 isn't mistaken
 * for the 500ppm R 29,1111.
 */
function officialEchoFigures(live: Loose, _zone: FuelZone): number[] {
  if (!live || live.success === false || isFallbackSource(live.source)) return [];
  return [live.zone_price, live.inland_price, live.coastal_price, live.diesel_inland, live.diesel_coastal]
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
  // The live response's own zone fields stay in, so a zone the server didn't
  // resolve (Settings, after a zone change) still gets its official price.
  const off = officialFromLive({ ...(live ?? {}), ...(server ? { company_price: server } : {}) }, zone);
  let mode: 'LIVE' | 'OWN' = 'LIVE';
  let own: number | null = null;
  let ownSetAt: string | null = null;
  if (company && 'fuel_price_mode' in company) {
    if (String(company.fuel_price_mode).toUpperCase() === 'OWN') {
      own = pos(company.fuel_price_own);
      mode = own !== null ? 'OWN' : 'LIVE';
      ownSetAt = typeof company.fuel_price_own_set_at === 'string' ? company.fuel_price_own_set_at : null;
    }
  } else if (server && typeof server.mode === 'string') {
    // No company profile (non-admin roles get a 403) on a newer backend: the
    // server's own resolution says LIVE or OWN, and the own price.
    const so = (server.own ?? null) as Loose;
    if (String(server.mode).toUpperCase() === 'OWN' && pos(so?.price) !== null) {
      own = pos(so?.price);
      mode = 'OWN';
      ownSetAt = typeof so?.set_at === 'string' ? so.set_at : null;
    }
  } else if (company) {
    const legacy = pos(company.fuel_price_per_litre);
    const sentinel = legacy !== null && Math.abs(legacy - LEGACY_DIESEL_SENTINEL) < 0.005;
    const official = legacy !== null && officialEchoFigures(live, zone).some((p) => Math.abs(p - legacy) <= 0.005);
    if (legacy !== null && !sentinel && !official) {
      own = legacy;
      mode = 'OWN';
    }
  }
  const serverStale = ((server?.official ?? null) as Loose)?.stale;
  const fromT = parseTime(off.from);
  // Older than the previous period: unusable (missing), not merely stale.
  const now = opts.now ?? new Date();
  if (!server && fromT !== null && fromT < currentPeriodStart(new Date(currentPeriodStart(now).getTime() - 1)).getTime()) {
    off.price = null;
    off.from = null;
  }
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

// ── Petrol and other fuels from the API (old and new backend) ───────────────

/**
 * How a truck's fuel is priced: diesel and petrol (petrol and hybrid trucks)
 * by the Official / My own price rule, electric on the company's own price
 * only. Anything unrecognised is priced as diesel.
 */
export type FuelFamily = 'diesel' | 'petrol' | 'electric';

export function fuelFamily(fuelType: unknown): FuelFamily {
  const f = String(fuelType ?? '').trim().toLowerCase();
  if (f === 'petrol' || f === 'hybrid') return 'petrol';
  if (f === 'electric') return 'electric';
  return 'diesel';
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** Does this backend price petrol like diesel (fuel_price_petrol_mode et al.)? */
export function hasPetrolRule(company: Loose, live?: Loose): boolean {
  return (
    (!!company && ('fuel_price_petrol_mode' in company || isObj(company.petrol_price_in_use))) ||
    (!!live && isObj(live.company_petrol_price))
  );
}

/** The official petrol grade a company prices on: 93 only inland, else 95 (backend petrol_grade). */
export function petrolGrade(company: Loose, zone: FuelZone): '95' | '93' {
  return String(company?.fuel_price_petrol_grade ?? '95') === '93' && zone !== 'COASTAL' ? '93' : '95';
}

/** Official petrol {price, from, stale} for a zone and grade from GET fuel-prices/current/ `petrol`. */
export function officialPetrolFromLive(
  live: Loose,
  zone: FuelZone,
  grade: '95' | '93',
): { price: number | null; from: string | null; stale: boolean } {
  const table = isObj(live?.petrol) ? (live!.petrol as Record<string, unknown>) : null;
  const rec = table ? table[`${zone.toLowerCase()}_${grade}`] : null;
  if (!isObj(rec)) return { price: null, from: null, stale: false };
  const price = pos(rec.price);
  return {
    price,
    from: price !== null && typeof rec.effective_from === 'string' ? rec.effective_from : null,
    stale: price !== null && rec.stale === true,
  };
}

/**
 * compute()'s fuel input for a petrol or hybrid truck.
 *
 * New backend: same rule as diesel. fuel_price_petrol_mode LIVE (the official
 * ULP price for the zone and grade, from company_petrol_price /
 * petrol_price_in_use or the live `petrol` table) or OWN (fuel_price_petrol,
 * set at fuel_price_petrol_set_at).
 * Old backend (none of those fields): the company's own price only, as the old
 * server priced it (fuel_price_petrol; hybrid on fuel_price_hybrid), missing
 * blocks.
 */
export function petrolInputFromApi(
  company: Loose,
  live: Loose,
  opts: { useOfficial?: boolean; overridePrice?: number | null; fuelType?: string } = {},
): DieselInput {
  const hybrid = String(opts.fuelType ?? '').trim().toLowerCase() === 'hybrid';
  const server = (isObj(live?.company_petrol_price)
    ? live!.company_petrol_price
    : isObj(company?.petrol_price_in_use)
      ? company!.petrol_price_in_use
      : null) as Record<string, unknown> | null;
  const zone: FuelZone =
    (company?.fuel_zone ?? server?.zone ?? live?.zone) === 'COASTAL' ? 'COASTAL' : 'INLAND';
  if (!hasPetrolRule(company, live)) {
    return {
      zone,
      mode: 'OWN',
      own_price: pos(company?.[hybrid ? 'fuel_price_hybrid' : 'fuel_price_petrol']),
      own_set_at: null,
      official_price: null,
      official_effective_from: null,
      official_stale: false,
      use_official: false,
      override_price: opts.overridePrice ?? null,
      fuel_type: hybrid ? 'Hybrid' : 'Petrol',
    };
  }
  const grade =
    company && 'fuel_price_petrol_grade' in company
      ? petrolGrade(company, zone)
      : String(server?.grade) === '93' && zone !== 'COASTAL'
        ? '93'
        : '95';
  // The server's official figure when it resolved the same zone and grade,
  // else the live table's.
  let official = officialPetrolFromLive(live, zone, grade);
  const so = isObj(server?.official) ? (server!.official as Record<string, unknown>) : null;
  if (so && (server?.zone ?? zone) === zone && String(server?.grade ?? grade) === grade) {
    const price = pos(so.price);
    official = {
      price,
      from: price !== null && typeof so.effective_from === 'string' ? so.effective_from : null,
      stale: price !== null && so.stale === true,
    };
  }
  const serverOwn = isObj(server?.own) ? (server!.own as Record<string, unknown>) : null;
  const modeRaw = company && 'fuel_price_petrol_mode' in company ? company.fuel_price_petrol_mode : server?.mode;
  const own = pos(company && 'fuel_price_petrol' in company ? company.fuel_price_petrol : serverOwn?.price);
  const setAt = company?.fuel_price_petrol_set_at ?? serverOwn?.set_at;
  const mode: 'LIVE' | 'OWN' = String(modeRaw ?? 'LIVE').toUpperCase() === 'OWN' && own !== null ? 'OWN' : 'LIVE';
  return {
    zone,
    mode,
    own_price: own,
    own_set_at: typeof setAt === 'string' ? setAt : null,
    official_price: official.price,
    official_effective_from: official.from,
    official_stale: official.stale,
    use_official: !!opts.useOfficial,
    override_price: opts.overridePrice ?? null,
    fuel_type: 'Petrol',
    grade,
  };
}

/** compute()'s fuel input for an electric truck: own price per kWh only, missing blocks. */
export function electricInputFromApi(company: Loose, opts: { overridePrice?: number | null } = {}): DieselInput {
  return {
    zone: company?.fuel_zone === 'COASTAL' ? 'COASTAL' : 'INLAND',
    mode: 'OWN',
    own_price: pos(company?.fuel_price_electric),
    own_set_at: null,
    official_price: null,
    official_effective_from: null,
    official_stale: false,
    use_official: false,
    override_price: opts.overridePrice ?? null,
    fuel_type: 'Electric',
  };
}

/** compute()'s fuel input for a truck of `fuelType` (Diesel, Petrol, Hybrid, Electric). */
export function fuelInputFromApi(
  company: Loose,
  live: Loose,
  fuelType: unknown,
  opts: { useOfficial?: boolean; overridePrice?: number | null; now?: Date } = {},
): DieselInput {
  const family = fuelFamily(fuelType);
  if (family === 'petrol') return petrolInputFromApi(company, live, { ...opts, fuelType: String(fuelType) });
  if (family === 'electric') return electricInputFromApi(company, opts);
  return dieselInputFromApi(company, live, opts);
}

/** Petrol resolution straight from the API objects (settings). */
export function resolvePetrol(company: Loose, live: Loose): DieselResolution {
  return resolveDieselInput(petrolInputFromApi(company, live));
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

// Specialised bodies (backend SPECIALISED_BODIES): never suggested unless the
// cargo description calls for that body. [name words, cargo words].
export const SPECIALISED_BODIES: Record<string, [string[], string[]]> = {
  reefer: [
    ['reefer', 'refrig', 'fridge', 'cold'],
    ['frozen', 'chilled', 'refrigerat', 'cold', 'fresh produce', 'meat', 'dairy', 'ice cream', 'vaccine'],
  ],
  tanker: [['tanker'], ['fuel', 'liquid', 'diesel', 'petrol', 'chemical', 'water', 'oil', 'milk']],
  tipper: [['tipper'], ['sand', 'gravel', 'stone', 'coal', 'ore', 'aggregate', 'soil', 'rubble']],
  car_carrier: [
    ['car carrier', 'car-carrier', 'car transporter', 'auto carrier'],
    ['car ', 'cars', 'vehicles', 'bakkies'],
  ],
  lowbed: [
    ['lowbed', 'low bed', 'low-bed', 'abnormal'],
    ['machinery', 'excavator', 'abnormal', 'plant', 'earthmoving', 'transformer'],
  ],
};

export function bodyType(name: unknown): string | null {
  const text = String(name ?? '').toLowerCase();
  for (const [body, [words]] of Object.entries(SPECIALISED_BODIES)) if (words.some((w) => text.includes(w))) return body;
  return null;
}

export function cargoFitsBody(body: string | null, cargo: unknown): boolean {
  if (body === null) return true;
  const text = ` ${String(cargo ?? '').toLowerCase()} `;
  return SPECIALISED_BODIES[body]![1].some((w) => text.includes(w));
}

/**
 * The suggested truck (backend suggest_vehicle): among the fleet's own types
 * (an available vehicle of that type), with a capacity ≥ the load and a rated
 * burn, specialised bodies only when the cargo calls for them; key
 * (capacity, most quoted first, burn, id). Null with no load or no fit.
 */
export function suggestTruck<T extends TruckLike & { available_vehicle_count?: number }>(
  types: T[],
  loadT: number,
  opts: { cargo?: string; usage?: Record<string, number> } = {},
): T | null {
  if (!(loadT > 0)) return null;
  const usage = opts.usage ?? {};
  const fits = types
    .filter((t) => (t.available_vehicle_count ?? 1) > 0)
    .map((t) => ({ t, cap: capacityTonnes(t.capacity), burn: ratedBurn(t) }))
    .filter(
      (x): x is { t: T; cap: number; burn: number } =>
        x.cap !== null && x.burn !== null && x.cap >= loadT && cargoFitsBody(bodyType(x.t.name), opts.cargo),
    );
  if (!fits.length) return null;
  const used = (t: T) => usage[String(t.name ?? '').trim().toLowerCase()] ?? 0;
  fits.sort(
    (a, b) => a.cap - b.cap || used(b.t) - used(a.t) || a.burn - b.burn || Number(a.t.id ?? 0) - Number(b.t.id ?? 0),
  );
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
  // Most trucks wins; a tie goes to the heavier class (never scaled up onto a
  // smaller truck by a guess).
  let best: string | null = null;
  for (const [cls, n] of counts) {
    const b = best === null ? -1 : counts.get(best)!;
    if (
      best === null ||
      n > b ||
      (n === b && (OPERATING_CLASS_DEFAULTS[cls] ?? 0) > (OPERATING_CLASS_DEFAULTS[best] ?? 0))
    )
      best = cls;
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

export interface BorderCostsUnknown {
  countries?: string[];
  crossings?: string[];
  known?: { label: string; amount: number | null }[];
}

// backend cross_border.COUNTRY_NAMES
export const COUNTRY_NAMES: Record<string, string> = {
  SA: 'South Africa', ZW: 'Zimbabwe', MZ: 'Mozambique', BW: 'Botswana', NA: 'Namibia',
  LS: 'Lesotho', SZ: 'Eswatini', ZM: 'Zambia', MW: 'Malawi', TZ: 'Tanzania', KE: 'Kenya',
  AO: 'Angola', CD: 'the DR Congo', CG: 'the Republic of the Congo', UG: 'Uganda', RW: 'Rwanda',
  BI: 'Burundi', MG: 'Madagascar',
};

const crossingName = (code: string) => {
  const parts = code.split('-');
  return parts.length === 2 ? parts.map((p) => COUNTRY_NAMES[p] ?? p).join('→') : code;
};

const knownLabel = (item: Record<string, unknown>) => {
  const desc = String(item.description ?? '');
  if (item.type === 'border_crossing') return desc.replace(' border crossing', '').replace(' → ', '→').split(' (')[0]!;
  if (item.type === 'sa_permit') return 'permit';
  return desc.split(' (')[0]!;
};

/**
 * compute()'s border_costs_unknown from a route-calculate response (backend
 * border_costs_unknown_input): its border_costs_unknown with codes turned into
 * names, and the known parts from cross_border_breakdown. Null when the route
 * knows every border cost, or on an older backend (no field).
 */
export function borderCostsUnknownFromRoute(route: Record<string, unknown> | null | undefined): BorderCostsUnknown | null {
  const raw = route?.border_costs_unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const countries = (Array.isArray(r.countries) ? r.countries : [])
    .filter(Boolean)
    .map((c) => COUNTRY_NAMES[String(c).toUpperCase()] ?? String(c))
    .slice(0, 10);
  const crossings = (Array.isArray(r.crossings) ? r.crossings : [])
    .filter(Boolean)
    .map((c) => (String(c).includes('→') ? String(c) : crossingName(String(c))))
    .slice(0, 10);
  if (!countries.length && !crossings.length) return null;
  const knownRaw = Array.isArray(r.known)
    ? (r.known as Record<string, unknown>[])
    : (Array.isArray(route?.cross_border_breakdown) ? (route!.cross_border_breakdown as Record<string, unknown>[]) : []).map(
        (b) => ({ label: knownLabel(b), amount: toNum(b.amount) }),
      );
  const known = knownRaw
    .slice(0, 12)
    .filter((k) => k && typeof k === 'object' && toNum(k.amount) !== null)
    .map((k) => ({ label: String(k.label ?? '').slice(0, 60), amount: toNum(k.amount) }));
  return { countries, crossings, known };
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
    /** Round trip: the way back's own tolls (its own route's plazas). */
    return_leg?: number | null;
    lookup_failed?: boolean;
    confirmed_none?: boolean;
  } | null;
  driver?: { allowance_per_night?: number | null; nights?: number | null; amount?: number | null } | null;
  hours_per_day?: number | null;
  border_cost?: number | null;
  /** Cross-border trip: no border cost makes the floor incomplete (block). */
  international?: boolean | null;
  /** Parts of the route whose border costs aren't on file (names, not codes). */
  border_costs_unknown?: BorderCostsUnknown | null;
  /** The border figure is the user's own (covers every crossing). */
  border_cost_is_override?: boolean | null;
  /** The empty truck's border costs crossing back (return leg). */
  border_cost_empty_return?: number | null;
  /** The part of border_cost that is an estimate (not a published tariff). */
  border_estimate?: number | null;
  /** The same for the empty run home's border cost. */
  border_estimate_empty_return?: number | null;
  /** Carried, not costed: the route priced the border with it. */
  abnormal_load?: boolean | null;
  include_empty_return?: boolean | null;
  settings?: { include_empty_return_default?: boolean | null; empty_return_min_km?: number | null } | null;
  minimum_charge?: number | null;
  /** Company default price per km (default_base_rate_per_km); null = none. */
  default_price_per_km?: number | null;
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
  | 'driver_return'
  | 'border_return';

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
  border_return: 'Border fees, empty return',
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
  default_price_per_km: number | null;
  rate_price: number | null;
  default_price: number | null;
  alternative_with_return_load: { floor: number | null; target_price: number | null; default_price: number | null } | null;
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
          ? `A ${fmtNum(capT)} t payload looks like the GVM`
          : `${fmtNum(rated ?? 0)} L/100 km is low for a ${fmtNum(capT)} t truck`;
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
  const parts =
    litresLoaded !== null && litresEmpty !== null ? [litresLoaded, ...(emptyReturn ? [litresEmpty] : [])] : null;
  warnings.push(...dieselWarnings(diesel, litresTotal, parts));
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
  // R 0 from a toll lookup that worked is a known R 0: the route has no plazas.
  // A round trip's way back is priced on its own route's plazas when the
  // route calculation gave them (tolls.return_leg); else the same plazas.
  const tollBack = roundTrip ? toNum(tolls.return_leg) : null;
  const tollAmt =
    tollOneWay === null
      ? null
      : roundTrip && tollBack !== null
        ? cents(tollOneWay + tollBack)
        : cents(tollOneWay * legsLoaded);
  add(
    'tolls',
    'loaded',
    tollAmt,
    tollAmt === null
      ? 'Unknown'
      : tollOneWay === 0 && !tollBack
        ? 'No toll plazas on this route'
        : tollBack !== null
          ? `${fmtRand(tollOneWay!, 2)} out + ${fmtRand(tollBack, 2)} back`
          : roundTrip
            ? `${fmtRand(tollOneWay!, 2)} × 2 legs`
            : `${fmtRand(tollOneWay!, 2)} one way`,
    { one_way: tollOneWay, legs: legsLoaded, ...(tollBack !== null ? { return_leg: tollBack } : {}) },
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
  let drvSource: 'user' | 'suggested' | 'missing';
  if (userAmount !== null && userAmount >= 0) {
    drvAmt = cents(userAmount);
    drvSource = 'user';
  } else if (suggested === null && nights) {
    // Nights away but no allowance rate anywhere: R 0, and said so (warn).
    drvAmt = 0.0;
    drvSource = 'missing';
    warnings.push(
      warning(
        'driver_allowance_missing',
        'warn',
        'No driver allowance rate set',
        `${nights} night${plural(nights)} away priced at R 0; enter the driver cost or set a rate.`,
        null,
        ['enter_driver_cost', 'update_allowance'],
      ),
    );
  } else {
    drvAmt = suggested;
    drvSource = 'suggested';
  }
  if (drvAmt === null) {
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
  }
  add(
    'driver',
    'loaded',
    drvAmt,
    drvSource === 'user'
      ? 'Your figure'
      : drvSource === 'missing'
        ? `${nights} night${plural(nights)} at R 0: no allowance rate set`
        : rate !== null && nights
        ? `${nights} night${plural(nights)} × ${fmtRand(rate, 2)}`
        : nights === 0
          ? 'No night away'
          : 'Unknown',
    { nights, suggested_nights: suggestedNights, rate_per_night: rate, suggested, source: drvSource },
  );

  // --- border ---
  const border = toNum(inp.border_cost);
  const bu = inp.border_costs_unknown ?? {};
  const unknownNames = (bu.countries ?? []).filter(Boolean).map(String);
  const unknownCrossings = (bu.crossings ?? []).filter(Boolean).map(String);
  const borderUnknown = (unknownNames.length > 0 || unknownCrossings.length > 0) && !inp.border_cost_is_override;
  if (borderUnknown) {
    // Part of the route has no border figures on file (e.g. Namibia→Angola):
    // the floor is incomplete until the user enters the border costs.
    const names = unknownNames.length ? unknownNames : unknownCrossings.map((c) => c.split('→').at(-1) ?? c);
    const known = (bu.known ?? []).filter((k) => k && typeof k === 'object' && toNum(k.amount) !== null);
    const missing = (unknownCrossings.length ? unknownCrossings : names).join(', ');
    const detail = known.length
      ? `Known: ${known.map((k) => `${k.label} ${fmtRand(toNum(k.amount)!, 2)}`).join(' + ')}; missing: ${missing}`
      : `Missing: ${missing}`;
    add('border', 'loaded', null, `Not known for ${names.join(' and ')}`, { status: 'needs_input' });
    warnings.push(
      warning('border_costs_missing', 'block', `Border costs for ${names.join(' and ')} not known`, detail, null, [
        'enter_border_costs',
      ]),
    );
  } else if (border !== null && border > 0) {
    const est = toNum(inp.border_estimate);
    add(
      'border',
      'loaded',
      cents(border),
      'Border, permit and non-SA toll costs' + (est ? ` (includes ${fmtRand(est, 2)} estimated)` : ''),
      est ? { estimate: est } : {},
    );
  }
  else if (inp.international) {
    // An international trip always has border costs: without them the floor
    // is badly low, so it is incomplete.
    add('border', 'loaded', null, 'Not worked out yet', { status: 'needs_input' });
    warnings.push(
      warning(
        'border_costs_missing',
        'block',
        'Border costs not worked out yet',
        'Add the border, permit and non-SA toll costs for this trip.',
        null,
        ['enter_border_costs'],
      ),
    );
  }

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
      returnNights !== null && rate !== null ? cents(returnNights * rate) : returnNights !== null ? 0.0 : null;
    if (returnNights && rate === null && !warnings.some((w) => w.code === 'driver_allowance_missing')) {
      warnings.push(
        warning(
          'driver_allowance_missing',
          'warn',
          'No driver allowance rate set',
          `${returnNights} extra night${plural(returnNights)} coming home priced at R 0; set a rate per night.`,
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
        : returnNights
          ? `${returnNights} extra night${plural(returnNights)} at R 0: no allowance rate set`
          : returnNights === 0
          ? 'No extra night'
          : 'Unknown',
      { nights: returnNights, rate_per_night: rate },
    );
    if (drAmt === null && !warnings.some((w) => w.code === 'driver_nights_unknown')) {
      // The loaded driver line was entered, but without the driving time the
      // return nights are unknown: a null line always blocks.
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
    }
    if (inp.international && borderUnknown) {
      add('border_return', 'empty_return', null, 'Not known crossing back', { status: 'needs_input' });
    } else if (inp.international && border !== null && border > 0) {
      // The empty truck crosses back: the route calculation prices that leg
      // (exit-only charges, its own km); else the loaded leg's figure.
      const back = toNum(inp.border_cost_empty_return);
      const estBack = back !== null ? toNum(inp.border_estimate_empty_return) : null;
      add(
        'border_return',
        'empty_return',
        cents(back !== null ? back : border),
        'Border costs crossing back, empty' + (estBack ? ` (includes ${fmtRand(estBack, 2)} estimated)` : ''),
        estBack ? { estimate: estBack } : {},
      );
    }
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
        `${fmtRand(minimum - price)} below your ${fmtRand(minimum)} minimum.`,
        cents(minimum - price),
        ['use_minimum'],
      ),
    );
  }

  const blocking = warnings.filter((w) => w.severity === 'block').map((w) => w.code);

  // Default price: max(rate price, target price) rounded UP to the rand; the
  // rate price only with a company price per km > 0, on loaded km.
  const ratePerKm = pos(inp.default_price_per_km);
  const ratePrice = ratePerKm !== null && kmLoaded !== null ? cents(ratePerKm * kmLoaded) : null;
  // Rounded UP like the choices (next R 50 below R 20 000, else R 100).
  const defaultPrice = targetPrice !== null ? roundPrice(Math.max(ratePrice ?? 0, targetPrice)) : null;

  // The same quote with a return load booked (one-way, empty return included).
  let alternative: Costing['alternative_with_return_load'] = null;
  if (emptyReturn && requested !== false) {
    const alt = computeCosting({ ...inp, include_empty_return: false });
    alternative = { floor: alt.floor, target_price: alt.target_price, default_price: alt.default_price };
  }

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
    default_price_per_km: ratePerKm,
    rate_price: ratePrice,
    default_price: defaultPrice,
    alternative_with_return_load: alternative,
    price,
    margin,
    margin_pct: marginPct,
    warnings,
    blocking,
    can_send: blocking.length === 0,
  };
}

// ── Reopen notice (§11): port of quote_costing.changes_since_priced ─────────

export interface ChangesSincePriced {
  priced_at: string | null;
  price: number | null;
  floor_then: number | null;
  floor_now: number | null;
  delta_zar: number | null;
  margin_then: number | null;
  margin_now: number | null;
  repriced_price_keep_margin: number | null;
  changed: boolean;
  notice: string | null;
  actions: WarningAction[];
}

export function changesSincePriced(
  priceIn: unknown,
  floorThenIn: unknown,
  floorNowIn: unknown,
  pricedAt: unknown = null,
): ChangesSincePriced {
  const price = pos(priceIn);
  const floorThen = toNum(floorThenIn);
  const floorNow = toNum(floorNowIn);
  const delta = floorThen !== null && floorNow !== null ? cents(floorNow - floorThen) : null;
  const mThen = price && floorThen !== null ? ((price - floorThen) / price) * 100 : null;
  const mNow = price && floorNow !== null ? ((price - floorNow) / price) * 100 : null;
  const keep = mThen !== null && floorNow !== null && mThen < 100 ? cents(floorNow / (1 - mThen / 100)) : null;
  const changed = delta !== null && Math.abs(delta) >= 1;
  let notice: string | null = null;
  if (changed) {
    const when = saDate(pricedAt);
    notice =
      `Costs ${delta! > 0 ? 'up' : 'down'} ${fmtRand(Math.abs(delta!))}` +
      (when ? ` since ${when.replace(/ \d{4}$/, '')}` : '') +
      '.' +
      (mThen !== null && mNow !== null
        ? ` Margin ${Math.floor(mThen + 0.5)}% → ${Math.floor(mNow + 0.5)}%.`
        : '');
  }
  return {
    priced_at: isoUtc(pricedAt),
    price,
    floor_then: floorThen,
    floor_now: floorNow,
    delta_zar: delta,
    margin_then: mThen,
    margin_now: mNow,
    repriced_price_keep_margin: keep,
    changed,
    notice,
    actions: changed ? ['keep_price', 'reprice'].map((id) => ({ id, label: ACTION_LABELS[id]! })) : [],
  };
}

// ── Phone copy (same codes, severities and impact as the backend) ──────────

/**
 * Phone copy for two warnings (same codes, severities and impact as the
 * backend): the stale diesel title fits a 390 pt row, and a price under the
 * cost floor gets the one-tap fix at the company target margin.
 */
export function phoneWarning(w: QuoteWarning, c: Costing, target: number | null): QuoteWarning {
  if (w.code === 'diesel_stale') {
    const from = saShortDate(c.diesel.official_effective_from);
    const ownSet = c.diesel.own_price !== null;
    const fuelName = fuelFamily(c.diesel.fuel_type) === 'petrol' ? 'Petrol' : 'Diesel';
    return {
      ...w,
      title: from ? `${fuelName} price is from ${from}` : `${fuelName} price may be old`,
      actions: [ownSet ? { id: 'use_own', label: 'Use my price' } : { id: 'retry_diesel', label: 'Check again' }],
    };
  }
  if (w.code === 'below_floor' && c.target_price !== null && target !== null) {
    // target_price already includes the minimum charge when that is higher.
    const atMinimum = c.minimum_charge !== null && c.target_price === c.minimum_charge;
    return {
      ...w,
      actions: [
        {
          id: 'use_target',
          label: atMinimum
            ? `Price at minimum · ${rand(c.target_price, true)}`
            : `Price at ${Math.round(target)}% margin · ${rand(c.target_price, true)}`,
        },
        ...w.actions,
      ],
    };
  }
  return w;
}

/**
 * Prices offered in whole amounts (backend pricing_analysis.round_price): up
 * to the next R 50 below R 20 000, else the next R 100. Always up.
 */
export function roundPrice(price: number): number {
  const unit = price < 20000 ? 50 : 100;
  return Math.ceil(price / unit - 1e-9) * unit;
}

// ── Server-resolved inputs ───────────────────────────────────────────────────

/**
 * Local inputs with what only the server knows taken from its resolution.
 * The person's own choices (use official, a market price, tolls, driver
 * amount, trip shape) always stay local.
 */
export function withServerInputs(
  local: CostingInputs,
  server: CostingInputs | null,
  truckId: number | string | null,
  family: ReturnType<typeof fuelFamily>,
): CostingInputs {
  if (!server) return local;
  const sameTruck = server.vehicle != null && truckId != null && String(server.vehicle.id) === String(truckId);
  // The server's fuel resolution only for the same fuel: a reply for a
  // diesel truck must not price a petrol one while the next is in flight.
  const sameFuel = !!server.diesel && fuelFamily(server.diesel.fuel_type ?? 'Diesel') === family;
  return {
    ...local,
    diesel: server.diesel && sameFuel
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
    // The per-night rate depends on the trip (the cross-border allowance on
    // an international trip): only an answer for the same kind of trip.
    driver: {
      ...local.driver,
      // Nights given for this trip: the form's own (applied this session), else
      // what the server echoed from costing_inputs.driver_nights.
      nights: local.driver?.nights ?? server.driver?.nights ?? null,
      allowance_per_night:
        !!server.international === !!local.international
          ? (server.driver?.allowance_per_night ?? local.driver?.allowance_per_night ?? null)
          : (local.driver?.allowance_per_night ?? null),
    },
    hours_per_day: server.hours_per_day ?? local.hours_per_day,
    settings: server.settings ?? local.settings,
    minimum_charge: server.minimum_charge !== undefined ? server.minimum_charge : local.minimum_charge,
    default_price_per_km:
      server.default_price_per_km !== undefined ? server.default_price_per_km : local.default_price_per_km,
    target_margin_pct: server.target_margin_pct ?? local.target_margin_pct,
  };
}

/**
 * The estimated (not published) share of one leg's border lines; an agent
 * line stops being an estimate once the person typed their agent's fee. With
 * no itemised lines (older backends), the route's own border_estimate_zar.
 */
export function borderEstimateOf(items: Record<string, unknown>[], fallback: unknown, agentFeeTyped: boolean): number {
  if (!items.length) return toNum(fallback) ?? 0;
  return items
    .filter((i) => i.verified !== true && !(agentFeeTyped && /agent/i.test(String(i.code ?? ''))))
    .reduce((sum, i) => sum + (toNum(i.amount) ?? 0), 0);
}

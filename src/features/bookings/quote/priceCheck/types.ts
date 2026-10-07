import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters';

// The market price check. Port of the web app's AIPriceAnalysisPanel.
//
// API contract: compute_pricing() in the backend's core/services/
// quote_ai_pricing.py. Every price and win chance is calculated by the backend
// in Python. A check compares the quote with stored figures: the official FIASA
// fuel price, the lane benchmark from real quotes, and toll tariffs and the
// driver allowance that a monthly job finds on their published source pages and
// an admin approves. Nothing here recalculates a price on the device: switching
// "use market" / "use mine" on an item is a lookup into `combinations`.

export type ItemKey = 'fuel' | 'tolls' | 'driver_allowance' | 'base_rate';
export type Choice = 'ai' | 'mine';
export type Verdict = 'accurate' | 'needs_adjustment' | 'could_not_verify';
/** Where a market figure really comes from. */
export type VerificationKind = 'official' | 'benchmark' | 'source' | 'unverified';

export interface Reference {
  title: string;
  url: string;
}

export interface TollPlazaCheck {
  plaza: string;
  your_tariff_zar?: number | null;
  market_tariff_zar?: number | null;
  verified?: boolean;
  note?: string | null;
  route?: string | null;
  effective_from?: string | null;
  verified_at?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  published_tariff_incl_vat_zar?: number | null;
  matches_yours?: boolean | null;
}

/** One loose shape for the four items' `detail`; each item fills its own part. */
export interface ItemDetail {
  // fuel
  litres?: number;
  your_price_per_litre?: number | null;
  market_price_per_litre?: number | null;
  effective_date?: string | null;
  zone?: string | null;
  source?: string | null;
  other_zone_price_per_litre?: number | null;
  current?: boolean;
  // tolls
  legs?: number;
  toll_class?: string | null;
  plazas?: TollPlazaCheck[];
  other_plazas_mentioned?: string[];
  your_one_way_zar?: number | null;
  market_one_way_zar?: number | null;
  vat_basis?: string | null;
  sanral_class?: number | null;
  schedule_from?: string | null;
  // driver allowance (rate_per_day_zar is the older name of rate_per_night_zar)
  rate_per_night_zar?: number | null;
  rate_per_day_zar?: number | null;
  allowance_label?: string | null;
  days?: number | null;
  hours_per_day?: number | null;
  nights?: number | null;
  allowance_basis?: string | null;
  // base rate
  distance_km?: number;
  your_rate_per_km?: number | null;
  ai_rate_per_km?: number | null;
  market_low_per_km?: number | null;
  market_high_per_km?: number | null;
  benchmark_zar?: number | null;
  benchmark_label?: string | null;
}

export interface ReviewItem {
  verdict: Verdict;
  /** Only adjusted items can be switched between your figure and the market one. */
  toggleable: boolean;
  current_value_zar: number;
  ai_value_zar: number;
  reason: string;
  verification: 'verified' | 'not_verified';
  verification_kind?: VerificationKind;
  verified_at?: string | null;
  source_url?: string | null;
  source_name?: string | null;
  verification_note: string;
  sources: Reference[];
  detail: ItemDetail | null;
}

export interface Combination {
  choices: Record<ItemKey, Choice>;
  values: Record<ItemKey, number>;
  base_rate_per_km: number;
  pass_through_zar: number;
  price_zar: number;
  margin_zar: number;
  margin_pct: number;
  win_probability: number | null;
  /** Newer backends: the price is under the cost floor / under floor ÷ (1 − target). */
  below_floor?: boolean;
  below_target?: boolean;
}

export interface WinModel {
  available: boolean;
  scope: 'user' | 'global' | null;
  training_samples: number;
  reason: string | null;
}

export interface ReturnLeg {
  fuel_zar: number;
  tolls_zar: number;
  driver_zar: number;
  total_zar: number;
  fuel_basis: string;
}

export interface Review {
  success: boolean;
  usage_log_id?: number;
  verification_status?: 'verified' | 'partially_verified' | 'unverified';
  distance_km?: number;
  legs?: number;
  cross_border_zar?: number;
  cost_breakdown?: Record<ItemKey, ReviewItem>;
  toggleable_items?: ItemKey[];
  /** Every market/yours combination, keyed by choiceKey(). */
  combinations?: Record<string, Combination>;
  default_choice_key?: string;
  references?: Reference[];
  win_model?: WinModel;
  /** One-way trips: the empty run home at market figures (display only). */
  return_leg?: ReturnLeg | null;
  // Failures (never shown as-is: see failureText).
  code?: string;
  error?: string;
  retry_after_seconds?: number;
}

export const TOPICS: ItemKey[] = ['fuel', 'tolls', 'driver_allowance', 'base_rate'];

/** Same format as choice_key() in quote_ai_pricing.py. */
export const choiceKey = (c: Partial<Record<ItemKey, Choice>>): string =>
  TOPICS.map((t) => `${t}=${c[t] ?? 'mine'}`).join('|');

export const ITEM_LABELS: Record<ItemKey, string> = {
  fuel: 'Fuel',
  tolls: 'Tolls',
  driver_allowance: 'Driver allowance',
  base_rate: 'Base rate',
};
export const ITEM_WORDS: Record<ItemKey, string> = {
  fuel: 'fuel',
  tolls: 'tolls',
  driver_allowance: 'driver',
  base_rate: 'base rate',
};

// ── formatting ──────────────────────────────────────────────────────────────
export const MISSING = '—';
export const money = (n: number) => formatCurrency(n);
export const moneyWhole = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });
export const perKm = (n?: number | null) => (n == null ? MISSING : `${formatCurrency(Number(n))}/km`);
export const perLitre = (n?: number | null) => (n == null ? MISSING : `${formatCurrency(Number(n))}/L`);
export const num1 = (n?: number | null) =>
  n == null ? MISSING : formatNumber(Number(n), { maximumFractionDigits: 1 });
/** Backend sentences are plain rules text; keep the house style (no em dashes). */
export const clean = (s?: string | null) => (s || '').replace(/\s*[—–]\s*/g, ', ').trim();
export const joinWords = (w: string[]) =>
  w.length <= 1 ? w.join('') : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;

/** Only https links to a real host are shown; the name is the hostname. */
export function httpsHost(url: string): string | null {
  const m = /^https:\/\/([^/?#:]+)/i.exec(url.trim());
  return m?.[1] ? m[1].replace(/^www\./i, '') : null;
}
export const safeSources = (sources?: Reference[]) =>
  (sources || []).filter((s) => httpsHost(s.url) !== null);

export function kindOf(t: ItemKey, item: ReviewItem): VerificationKind {
  if (item.verification_kind) return item.verification_kind;
  if (item.verdict === 'could_not_verify' || item.verification !== 'verified') return 'unverified';
  if (t === 'fuel') return 'official';
  if (t === 'base_rate') return 'benchmark';
  return safeSources(item.sources).length > 0 ? 'source' : 'unverified';
}

/** The page a "source" figure was checked on. */
export function sourceOf(item: ReviewItem): Reference | null {
  if (item.source_url && httpsHost(item.source_url)) {
    return { url: item.source_url, title: item.source_name || '' };
  }
  return safeSources(item.sources)[0] || null;
}

export type ChipTone = 'success' | 'warning' | 'neutral';
export function chipFor(t: ItemKey, item: ReviewItem): { tone: ChipTone; label: string } {
  const kind = kindOf(t, item);
  const d = item.detail || {};
  if (kind === 'official') {
    const fiasa = (d.source || (t === 'fuel' ? 'FIASA' : '')).toUpperCase() === 'FIASA';
    return {
      tone: d.current === false ? 'warning' : 'success',
      label: fiasa ? 'Official price (FIASA)' : 'Official price',
    };
  }
  if (kind === 'benchmark') return { tone: 'neutral', label: 'Lane benchmark' };
  if (kind === 'source') {
    const src = sourceOf(item);
    const host = src ? httpsHost(src.url) : null;
    const when = item.verified_at ? ` · ${formatDate(item.verified_at)}` : '';
    return { tone: 'success', label: `Checked on ${host || 'source'}${when}` };
  }
  return { tone: 'warning', label: 'Not verified' };
}

// ── failures: our own words per code, never the server's text ───────────────
export type FailCode = 'unavailable' | 'cooldown' | 'throttled' | 'budget' | 'failed';
export interface Failure {
  code: FailCode;
  /** Epoch ms when a cooldown/throttle ends, else null. */
  until: number | null;
  /** The endpoint does not exist on this backend (404). */
  missing: boolean;
}
const FAIL_CODES: FailCode[] = ['unavailable', 'cooldown', 'throttled', 'budget', 'failed'];
const asCode = (v: unknown): FailCode | null =>
  (FAIL_CODES as string[]).includes(String(v)) ? (v as FailCode) : null;
const posNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface ApiError {
  status?: number;
  data?: unknown;
  /** From the Retry-After header (seconds), see lib/api/client.ts. */
  retryAfter?: number;
}

export function classify(
  err: ApiError | null,
  body: Review | null,
): { code: FailCode; retryAfter: number | null; missing: boolean } {
  const d = (err ? err.data : body) as Record<string, unknown> | null;
  const obj = d && typeof d === 'object' ? d : {};
  const retry =
    posNum(obj.retry_after_seconds) ??
    posNum(err?.retryAfter) ??
    // DRF's own throttle: "Expected available in 42 seconds." (read, never shown)
    (typeof obj.detail === 'string' ? posNum(/(\d+)\s*second/.exec(obj.detail)?.[1]) : null);
  const code = asCode(obj.code) ?? (obj.error === 'cooldown' ? 'cooldown' : null);
  if (code) return { code, retryAfter: retry, missing: false };
  const status = err?.status;
  if (status === 404) return { code: 'unavailable', retryAfter: null, missing: true };
  if (status === 503) return { code: 'unavailable', retryAfter: null, missing: false };
  if (status === 429) return { code: 'throttled', retryAfter: retry, missing: false };
  return { code: 'failed', retryAfter: null, missing: false };
}

export function failureText(f: Failure, secsLeft: number | null): { title: string; text: string } {
  const wait = secsLeft != null && secsLeft > 0 ? `Retry in ${secsLeft} s` : 'Retry shortly';
  switch (f.code) {
    case 'unavailable':
      return { title: f.missing ? 'Not available yet' : 'Not available right now', text: '' };
    case 'cooldown':
      return { title: 'Checked a moment ago', text: wait };
    case 'throttled':
      return { title: 'Too many checks', text: wait };
    case 'budget':
      return { title: "Today's checks used up", text: 'More from midnight' };
    default:
      return { title: "Couldn't check", text: 'Retry in a minute' };
  }
}

export const checkedAgo = (at: number, now: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'Checked just now';
  if (s < 3600) return `Checked ${Math.floor(s / 60)} min ago`;
  return `Checked ${Math.floor(s / 3600)} h ago`;
};

/** What the card says when there's no win chance to show. */
export const WIN_REASON_COPY: Record<string, string> = {
  not_enough_history: 'Needs more closed quotes',
  no_market_rate: 'No lane benchmark yet',
  outside_training_range: 'No similar quotes yet',
  prediction_failed: "Couldn't score this quote",
};

/** One line per item for "Show details". */
export function detailLines(t: ItemKey, item: ReviewItem): string[] {
  const d = item.detail || {};
  const lines: string[] = [];
  if (t === 'fuel') {
    lines.push(`Yours: ${perLitre(d.your_price_per_litre)} × ${num1(d.litres)} L`);
    if (d.market_price_per_litre != null) {
      lines.push(
        `Official${d.zone ? ` ${String(d.zone).toLowerCase()}` : ''}: ${perLitre(d.market_price_per_litre)} × ${num1(d.litres)} L${
          d.effective_date ? `, from ${formatDate(d.effective_date)}` : ''
        }`,
      );
      if (d.other_zone_price_per_litre != null && d.zone) {
        lines.push(
          `${String(d.zone).toLowerCase() === 'inland' ? 'Coastal' : 'Inland'} price: ${perLitre(d.other_zone_price_per_litre)}`,
        );
      }
    }
  } else if (t === 'tolls') {
    // Round trips: the one-way figures behind the totals in the row above.
    if ((d.legs ?? 1) > 1 && d.your_one_way_zar != null) {
      lines.push(`Yours: ${money(d.your_one_way_zar)} one way × ${d.legs}`);
    }
    if ((d.legs ?? 1) > 1 && d.market_one_way_zar != null) {
      lines.push(`Published: ${money(d.market_one_way_zar)} one way × ${d.legs}`);
    }
  } else if (t === 'driver_allowance') {
    const lead = d.allowance_label ? `${clean(d.allowance_label)}: ` : '';
    const perNight = d.rate_per_night_zar ?? d.rate_per_day_zar;
    if (perNight != null && d.nights != null) {
      lines.push(
        d.nights === 0
          ? `${lead}${money(perNight)} a night, none due: the trip fits in one driving day`
          : `${lead}${money(perNight)} a night × ${d.nights} night${d.nights === 1 ? '' : 's'} away`,
      );
      if (d.days != null) {
        lines.push(
          `${d.days} driving day${d.days === 1 ? '' : 's'}, at most ${num1(d.hours_per_day)} driving hours a day`,
        );
      }
    } else if (d.rate_per_night_zar != null) {
      lines.push(`${lead}${money(d.rate_per_night_zar)} a night away`);
    } else if (d.rate_per_day_zar != null && d.days != null) {
      lines.push(
        `${lead}${money(d.rate_per_day_zar)}/day × ${d.days} day${d.days === 1 ? '' : 's'}, about ${num1(d.hours_per_day)} driving hours a day`,
      );
    }
  } else {
    lines.push(`Yours: ${perKm(d.your_rate_per_km)} × ${num1(d.distance_km)} km`);
    if (d.market_low_per_km != null && d.market_high_per_km != null) {
      lines.push(`Benchmark band: ${perKm(d.market_low_per_km)} to ${perKm(d.market_high_per_km)}`);
    }
  }
  return lines;
}

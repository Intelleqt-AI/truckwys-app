// Shared pricing helpers (port of the web's lib/pricing.ts and
// lib/pricingDecision.ts): the stored pricing decision read honestly, the
// agreed price and margin, and the loss reasons captured on a decline.
// One margin definition everywhere: margin = price − full cost floor;
// margin % = margin / price (excl. VAT). Pure, no imports: runs under
// `node --test`.

export type LikelihoodBand = 'likely' | 'even' | 'less_likely';
export type PickedChoice = 'safe' | 'balanced' | 'stretch' | 'custom';

/** The pricing decision stored with a quote (additive `pricing_decision` field). */
export interface PricingDecision {
  version?: string | null;
  shown_choices?: unknown;
  picked_choice?: PickedChoice | string | null;
  final_price?: number | string | null;
  floor?: number | string | null;
  market?: {
    p25?: number | string | null;
    median?: number | string | null;
    p75?: number | string | null;
    tier?: string | null;
    n?: number | null;
    tier_label?: string | null;
    is_estimate?: boolean | null;
  } | null;
  model_version?: string | null;
  likelihood_level?: 'model' | 'rules' | string | null;
  likelihood_at_final_pct?: number | string | null;
  band_at_final?: LikelihoodBand | string | null;
  n_closed?: number | null;
  /** Server: the quote's price changed after this was saved (no new analysis). */
  stale?: boolean;
  [key: string]: unknown;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Whole number, half away from zero (as the server's ROUND_HALF_UP): 2.5 -> 3, −2.5 -> −3. */
export function roundHalfAway(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

/** Margin in rand and whole-number %, or null when either side is unknown. */
export function marginOf(price: unknown, floor: unknown): { amount: number; pct: number | null } | null {
  const p = num(price);
  const f = num(floor);
  if (p === null || f === null) return null;
  const amount = roundHalfAway(p - f);
  return { amount, pct: p > 0 ? roundHalfAway(((p - f) / p) * 100) : null };
}

const BAND_LABEL: Record<LikelihoodBand, string> = {
  likely: 'Likely',
  even: 'Even chance',
  less_likely: 'Less likely',
};

/**
 * The likelihood wording for one price. A % only at model level; rules level
 * shows its band; anything else shows nothing (null).
 */
export function likelihoodLabel(level: string | null | undefined, value: number | string | null | undefined): string | null {
  if (level === 'model') {
    const pct = num(value);
    return pct === null ? null : `${Math.round(pct)}% chance to win`;
  }
  if (level === 'rules' && typeof value === 'string' && value in BAND_LABEL) {
    return BAND_LABEL[value as LikelihoodBand];
  }
  return null;
}

/** One name for the p25–p75 range, in the builder and on the quote. */
export const MARKET_RANGE_LABEL = 'Middle half of the market';

export const CHOICE_LABEL: Record<PickedChoice, string> = {
  safe: 'Safe',
  balanced: 'Balanced',
  stretch: 'Stretch',
  custom: 'Custom',
};

// ---------------------------------------------------------------- loss reasons

/** Loss reasons captured when a quote is declined (additive `loss_reason`). */
export type LossReasonCode = 'price' | 'timing' | 'capacity' | 'relationship' | 'other';
export const LOSS_REASONS: { code: LossReasonCode; label: string }[] = [
  { code: 'price', label: 'Price' },
  { code: 'timing', label: 'Timing' },
  { code: 'capacity', label: 'Capacity' },
  { code: 'relationship', label: 'Relationship' },
  { code: 'other', label: 'Other' },
];

export interface LossReason {
  code: LossReasonCode | null;
  note: string;
}

/**
 * The fields for a decline (outcome and update_status): the additive
 * `loss_reason` code and `loss_reason_note`, both optional, and the same
 * reason as the free-text `rejection_reason` the API has always taken.
 */
export function lossReasonPayload(reason: LossReason): Record<string, unknown> {
  const note = reason.note.trim();
  if (!reason.code && !note) return {};
  const label = LOSS_REASONS.find((r) => r.code === reason.code)?.label;
  const text = [label, note].filter(Boolean).join(': ');
  return {
    ...(reason.code ? { loss_reason: reason.code } : {}),
    ...(note ? { loss_reason_note: note } : {}),
    rejection_reason: text,
  };
}

// -------------------------------------------------------------- decision view

export interface DecisionView {
  /** "Safe" / "Your price" ..., null when none was stored. */
  picked: string | null;
  /** The choice the panel recommended when this was priced (shown_choices), if stored. */
  recommended: string | null;
  finalPrice: number;
  floor: number | null;
  margin: { amount: number; pct: number | null } | null;
  belowFloor: boolean;
  market: { low: number; high: number; median: number | null; label: string; estimate: boolean } | null;
  likelihood: { text: string; basis: string | null; model: boolean } | null;
  /** The quote total no longer matches the price this decision was made at. */
  stale: boolean;
  /**
   * What the floor is made of, so the margin can be traced; null if unknown.
   * source: a short provenance label when the decision stored one; missing: no
   * figure on record; note: words shown in place of the amount.
   */
  floorLines: { label: string; amount: number; source?: string | null; missing?: boolean; note?: string | null }[] | null;
  /** True when the lines were worked out from the quote's own lines (no stored breakdown). */
  floorLinesDerived: boolean;
}

const FLOOR_LABEL: Record<string, string> = {
  fuel: 'Fuel',
  tolls: 'Tolls',
  driver_allowance: 'Driver allowance',
  border: 'Border fees',
  fixed_cost: 'Operating costs',
  return_leg: 'Empty return',
};

// The stored source_kind of a floor line, in plain words. Absent on older
// decisions: no label is shown then.
const SOURCE_LABEL: Record<string, string> = {
  official: 'Official',
  calculated: 'Calculated',
  company_actuals: 'Your actuals',
  estimate: 'Estimate',
  user: 'Your figure',
};

type QuoteLines = {
  fuel_surcharge?: unknown;
  toll_charges?: unknown;
  driver_allowance?: unknown;
  additional_charges?: unknown;
  estimated_duration_minutes?: unknown;
  trip_type?: unknown;
};

/**
 * Nights away, the cost floor's own rule: driving days = ceil(driving hours /
 * 9), nights = days − 1, both legs for a round trip. Null when the driving
 * time is not on the quote.
 */
function nightsAway(quote: QuoteLines): number | null {
  const minutes = num(quote.estimated_duration_minutes);
  if (minutes === null || minutes <= 0) return null;
  const legs = quote.trip_type === 'ROUND_TRIP' ? 2 : 1;
  return Math.max(Math.ceil((minutes * legs) / 60 / 9) - 1, 0);
}

type StoredLine = { key?: string; label?: string; amount?: unknown; source_kind?: string };
type ViewLine = { label: string; amount: number; source: string | null; missing: boolean; note: string | null };

/**
 * The floor's components. Prefers the breakdown saved with the decision
 * (`floor_lines`); else derives it from the quote's own cost lines, which the
 * floor consumes as-is, with the rest of the floor as operating costs. Null
 * when that remainder would be negative (the lines don't reconcile).
 */
function floorLinesOf(
  d: PricingDecision,
  quote: QuoteLines,
  floor: number | null,
  stale: boolean,
): { lines: DecisionView['floorLines']; derived: boolean } {
  const stored = (d as Record<string, unknown>).floor_lines;
  if (Array.isArray(stored) && stored.length) {
    const nights = nightsAway(quote);
    const lines = (stored as StoredLine[])
      .map((l): { label: string; amount: number | null; source: string | null; missing: boolean; note: string | null } => {
        const kind = String(l.source_kind || '');
        const amount = kind === 'missing' ? 0 : num(l.amount);
        // A driver line of R 0 is "None due (same day)" when the trip has no
        // night away, and "Not set" when it has one and the figure was not the
        // user's own (older decisions saved that gap as R 0).
        const zeroDriver = l.key === 'driver_allowance' && kind !== 'missing' && amount === 0;
        const noneDue = zeroDriver && nights === 0;
        const missing = kind === 'missing' || (zeroDriver && kind !== 'user' && nights !== null && nights > 0);
        return {
          label: (l.key && FLOOR_LABEL[l.key]) || String(l.label || ''),
          amount,
          source:
            noneDue || missing
              ? null
              : kind === 'user'
                ? l.key === 'driver_allowance'
                  ? 'Your setting'
                  : 'Your figure'
                : (SOURCE_LABEL[kind] ?? null),
          missing,
          note: noneDue ? 'None due (same day)' : null,
        };
      })
      .filter((l): l is ViewLine => !!l.label && l.amount !== null);
    return { lines: lines.length ? lines : null, derived: false };
  }
  if (floor === null || stale) return { lines: null, derived: false };
  const parts = [
    { label: 'Fuel', amount: num(quote.fuel_surcharge) ?? 0 },
    { label: 'Tolls', amount: num(quote.toll_charges) ?? 0 },
    { label: 'Driver allowance', amount: num(quote.driver_allowance) ?? 0 },
    { label: 'Border and other charges', amount: num(quote.additional_charges) ?? 0 },
  ].filter((p) => p.amount > 0);
  const rest = Math.round((floor - parts.reduce((a, p) => a + p.amount, 0)) * 100) / 100;
  if (rest < 0) return { lines: null, derived: false };
  return { lines: [...parts, ...(rest > 0 ? [{ label: 'Operating costs', amount: rest }] : [])], derived: true };
}

function marketLabel(m: NonNullable<PricingDecision['market']>): { label: string; estimate: boolean } {
  const n = num(m.n);
  const estimate = m.tier === 'estimate' || m.is_estimate === true;
  if (m.tier_label) return { label: String(m.tier_label), estimate };
  if (estimate) return { label: 'Estimate, not market data', estimate };
  const quotes = n ? `${n} quote${n === 1 ? '' : 's'}` : null;
  if (m.tier === 'platform') return { label: ['TruckWys platform', quotes].filter(Boolean).join(', '), estimate };
  if (m.tier === 'company') return { label: ['Your own quotes', quotes].filter(Boolean).join(', '), estimate };
  return { label: quotes || 'Market range', estimate };
}

/**
 * The stored pricing decision, read honestly: only what was saved with the
 * quote, never a recomputed or heuristic figure. Null when the quote has no
 * decision (older quotes), so callers show no margin or likelihood at all.
 */
export function pricingDecisionOf(
  quote: ({ total_amount?: unknown; pricing_decision?: PricingDecision | null } & QuoteLines) | null | undefined,
): DecisionView | null {
  const d = quote?.pricing_decision;
  if (!d || typeof d !== 'object') return null;
  const finalPrice = num(d.final_price);
  if (finalPrice === null) return null;
  const floor = num(d.floor);
  const margin = marginOf(finalPrice, floor);
  // A typed price reads "Your price", as in the builder's bar.
  const picked =
    d.picked_choice === 'custom'
      ? 'Your price'
      : d.picked_choice && d.picked_choice in CHOICE_LABEL
        ? CHOICE_LABEL[d.picked_choice as PickedChoice]
        : null;
  const shown = Array.isArray(d.shown_choices) ? (d.shown_choices as { key?: string; recommended?: boolean }[]) : [];
  const recKey = shown.find((c) => c && c.recommended === true)?.key;
  const recommended = recKey && recKey in CHOICE_LABEL ? CHOICE_LABEL[recKey as PickedChoice] : null;

  let market: DecisionView['market'] = null;
  const m = d.market;
  if (m && num(m.p25) !== null && num(m.p75) !== null) {
    market = { low: num(m.p25)!, high: num(m.p75)!, median: num(m.median), ...marketLabel(m) };
  }

  let likelihood: DecisionView['likelihood'] = null;
  const pct = num(d.likelihood_at_final_pct);
  const band = likelihoodLabel('rules', d.band_at_final as string | null);
  if (d.likelihood_level === 'model' && pct !== null) {
    // The basis count, when the saved decision carries it.
    const n = num(d.n_closed ?? (d as Record<string, unknown>).model_n_closed);
    likelihood = {
      text: `${Math.round(pct)}%`,
      basis:
        typeof d.basis_label === 'string' && d.basis_label
          ? `From ${d.basis_label}.`
          : n
            ? `From ${n} closed quotes.`
            : 'From your win model.',
      model: true,
    };
  } else if (band) {
    likelihood = {
      text: band,
      basis:
        d.likelihood_level === 'model'
          ? 'This price was outside what your model has learned from.'
          : 'A rough guide from the market and this customer.',
      model: false,
    };
  }

  const total = num(quote?.total_amount);
  // Stale: the server marked it (the price changed without a new analysis),
  // or the quote total no longer matches the price it was made at.
  const stale = d.stale === true || (total !== null && Math.abs(total - finalPrice) > 0.5);
  const fl = floorLinesOf(d, quote || {}, floor, stale);
  return {
    floorLines: fl.lines,
    floorLinesDerived: fl.derived,
    picked,
    recommended,
    finalPrice,
    floor,
    margin,
    belowFloor: floor !== null && finalPrice < floor,
    market,
    likelihood,
    stale,
  };
}

/**
 * The price the customer agreed when the quote was won, when it differs from
 * the quoted total (read-only, kept with the outcome; billing still uses the
 * quote total). Accepts the field under the names the API may use; null when
 * absent, not won, or equal to the quote (to the cent).
 */
export function agreedPriceOf(quote: Record<string, unknown> | null | undefined): number | null {
  if (!quote || quote.outcome !== 'accepted') return null;
  const nested =
    quote.outcome_detail && typeof quote.outcome_detail === 'object'
      ? (quote.outcome_detail as Record<string, unknown>).final_price
      : undefined;
  const agreed = num(quote.agreed_price ?? quote.final_price ?? quote.outcome_final_price ?? nested);
  const total = num(quote.total_amount);
  if (agreed === null || agreed <= 0 || total === null) return null;
  return Math.abs(agreed - total) >= 0.005 ? agreed : null;
}

/**
 * The margin at the agreed price, as the server works it out (agreed price
 * less the stored cost floor; `agreed_margin` / `agreed_margin_pct`). Never
 * computed here: null until the API sends both figures.
 */
export function agreedMarginOf(
  quote: Record<string, unknown> | null | undefined,
): { amount: number; pct: number | null } | null {
  if (!quote) return null;
  const amount = num(quote.agreed_margin);
  if (amount === null) return null;
  const pct = num(quote.agreed_margin_pct);
  return { amount: Math.round(amount), pct: pct === null ? null : Math.round(pct) };
}

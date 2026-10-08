// Trip economics on the phone (QUOTE-RULES "Trip economics"): the booking
// block convert_to_load returns, a job's (or return pair's) margin, return-load
// candidates and the quote's actuals once delivered.
// Pure, no imports: runs under `node --test`.

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ── Formatting (same rules as lib/formatters: en-ZA, true minus) ─────────────
const MINUS = '−';

/** Whole rand: `R 1 020`, `−R 4 200`; null is `—`. */
export function rand(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(Math.round(n)));
  return Math.round(n) < 0 ? `${MINUS}${body}` : body;
}

/** A 0..100 value: `18,2%`, `−3,0%`. */
export function percent(n: number | null | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(n));
  const zero = Number(Math.abs(n).toFixed(decimals)) === 0;
  return `${n < 0 && !zero ? MINUS : ''}${body}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-12…` → `12 Oct`; anything else → ''. */
export function shortDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month}` : '';
}

/** An endpoint an older backend doesn't have: hide the feature, say nothing. */
export const isMissingEndpoint = (status: unknown): boolean =>
  [404, 405, 501].includes(Number(status));

// ── Return-load candidates ───────────────────────────────────────────────────
export type CandidateDirection = 'return' | 'outbound';

export interface LinkWarning {
  code: string;
  title: string;
}

export interface Candidate {
  loadId: number | string;
  loadNumber: string;
  customer: string;
  pickup: string;
  delivery: string;
  pickupDate: string | null;
  deliveryDate: string | null;
  amount: number | null;
  pickupKmFromDrop: number | null;
  reversesLane: boolean;
  warnings: LinkWarning[];
}

export function parseWarnings(raw: unknown): LinkWarning[] {
  return arr(raw)
    .map((w) => obj(w))
    .map((w) => ({ code: text(w.code), title: text(w.title) || text(w.detail) }))
    .filter((w) => w.title);
}

export function parseCandidates(raw: unknown): Candidate[] {
  return arr(raw)
    .map((r) => obj(r))
    .filter((r) => r.load_id != null && r.load_id !== '')
    .map((r) => ({
      loadId: r.load_id as number | string,
      loadNumber: text(r.load_number),
      customer: text(r.customer_name),
      pickup: text(r.pickup),
      delivery: text(r.delivery),
      pickupDate: text(r.pickup_date) || null,
      deliveryDate: text(r.delivery_date) || null,
      amount: numOrNull(r.total_amount),
      pickupKmFromDrop: numOrNull(r.pickup_km_from_drop),
      reversesLane: r.reverses_lane === true,
      warnings: parseWarnings(r.warnings),
    }));
}

/** `Durban → Johannesburg`. */
export const candidateTitle = (c: Candidate): string =>
  `${c.pickup || '—'} → ${c.delivery || '—'}`;

/**
 * The one line under a candidate. A return (this job's truck coming home)
 * says when it collects and how far from the drop; an outbound (the job this
 * one would be the return of) says when it delivers.
 */
export function candidateSub(c: Candidate, direction: CandidateDirection): string {
  const parts: string[] = [];
  if (c.customer) parts.push(c.customer);
  if (direction === 'return') {
    const d = shortDate(c.pickupDate);
    if (d) parts.push(`collects ${d}`);
    if (c.pickupKmFromDrop != null) {
      parts.push(
        c.pickupKmFromDrop < 1 ? 'at the drop' : `${Math.round(c.pickupKmFromDrop)} km from the drop`,
      );
    }
  } else {
    const d = shortDate(c.deliveryDate);
    if (d) parts.push(`delivers ${d}`);
  }
  if (c.amount != null && c.amount > 0) parts.push(rand(c.amount));
  const line = parts.join(' · ');
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : '';
}

/** First warning title, shown under the candidate (it links anyway). */
export const candidateNote = (c: Candidate): string | null =>
  c.warnings[0]?.title ?? (c.reversesLane ? 'Same lane back' : null);

// ── Job / pair economics ────────────────────────────────────────────────────
export type LegRole = 'single' | 'outbound' | 'return';
export type Basis = 'actual' | 'estimate' | 'mixed' | null;

export interface MissingInput {
  code: string;
  prompt: string;
  /** Being worked out (e.g. `tolls_pending`): nothing to ask the user. */
  pending: boolean;
}

export interface Leg {
  loadId: number | string | null;
  loadNumber: string;
  role: LegRole;
  lane: string;
  revenue: number | null;
  revenueBasis: Basis;
  cost: number | null;
  costBasis: Basis;
  estimateLabel: string;
  margin: number | null;
  marginPct: number | null;
  quotedMarginPct: number | null;
  marginVsQuotedPts: number | null;
  emptyReturnRemoved: number;
  missing: MissingInput[];
}

export interface Combined {
  revenue: number | null;
  cost: number | null;
  costBasis: Basis;
  margin: number | null;
  marginPct: number | null;
  quotedMarginPct: number | null;
  marginVsQuotedPts: number | null;
  emptyReturnRemoved: number;
}

export interface Economics {
  pair: boolean;
  outboundId: number | string | null;
  returnId: number | string | null;
  legs: Leg[];
  combined: Combined | null;
  expectingReturn: boolean;
}

const basisOf = (v: unknown): Basis =>
  v === 'actual' || v === 'estimate' || v === 'mixed' ? v : null;

const roleOf = (v: unknown): LegRole => (v === 'outbound' || v === 'return' ? v : 'single');

function parseMissing(raw: unknown): MissingInput[] {
  return arr(raw)
    .map((m) => obj(m))
    .map((m) => ({ code: text(m.code), prompt: text(m.prompt), pending: m.pending === true }))
    .filter((m) => m.prompt);
}

function parseLeg(raw: unknown): Leg {
  const l = obj(raw);
  return {
    loadId: (l.load_id as number | string | undefined) ?? null,
    loadNumber: text(l.load_number),
    role: roleOf(l.role),
    lane: text(l.lane),
    revenue: numOrNull(l.revenue),
    revenueBasis: basisOf(l.revenue_basis),
    cost: numOrNull(l.cost),
    costBasis: basisOf(l.cost_basis),
    estimateLabel: text(l.estimate_label),
    margin: numOrNull(l.margin),
    marginPct: numOrNull(l.margin_pct),
    quotedMarginPct: numOrNull(obj(l.quoted).margin_pct),
    marginVsQuotedPts: numOrNull(l.margin_vs_quoted_pts),
    emptyReturnRemoved: numOrNull(l.empty_return_removed) ?? 0,
    missing: parseMissing(l.missing),
  };
}

/** Null when the body carries no legs (not an economics response). */
export function parseEconomics(raw: unknown): Economics | null {
  const e = obj(raw);
  const legs = arr(e.legs).map(parseLeg);
  if (!legs.length) return null;
  const c = e.combined ? obj(e.combined) : null;
  return {
    pair: e.pair === true,
    outboundId: (e.outbound_id as number | string | undefined) ?? null,
    returnId: (e.return_id as number | string | undefined) ?? null,
    legs,
    combined: c
      ? {
          revenue: numOrNull(c.revenue),
          cost: numOrNull(c.cost),
          costBasis: basisOf(c.cost_basis),
          margin: numOrNull(c.margin),
          marginPct: numOrNull(c.margin_pct),
          quotedMarginPct: numOrNull(obj(c.quoted).margin_pct),
          marginVsQuotedPts: numOrNull(c.margin_vs_quoted_pts),
          emptyReturnRemoved: numOrNull(c.empty_return_removed) ?? 0,
        }
      : null,
    expectingReturn: e.expecting_return === true,
  };
}

/** `Actual` / `Estimate` / `Part actual`; null when there is no cost at all. */
export function basisLabel(basis: Basis): string | null {
  if (basis === 'actual') return 'Actual';
  if (basis === 'estimate') return 'Estimate';
  if (basis === 'mixed') return 'Part actual';
  return null;
}

/** `R 4 200 · 18,2%`; `—` when the cost isn't known. */
export function marginText(margin: number | null, pct: number | null): string {
  if (margin == null) return '—';
  return pct == null ? rand(margin) : `${rand(margin)} · ${percent(pct)}`;
}

/** `2,1 pts below quoted` / `As quoted`; null when either side is unknown. */
export function vsQuotedText(pts: number | null): string | null {
  if (pts == null || !Number.isFinite(pts)) return null;
  if (Math.abs(pts) < 0.05) return 'As quoted';
  const n = new Intl.NumberFormat('en-ZA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    Math.abs(pts),
  );
  return `${n} pts ${pts > 0 ? 'above' : 'below'} quoted`;
}

export const EMPTY_RETURN_REMOVED = 'Empty return removed — return load linked';

export interface LegView {
  key: string;
  title: string;
  lane: string;
  loadId: number | string | null;
  revenue: string;
  costLabel: string;
  cost: string;
  margin: string;
  negative: boolean;
  basis: string | null;
  quoted: string | null;
  vsQuoted: string | null;
  below: boolean;
}

export interface MarginCardView {
  legs: LegView[];
  combined: null | {
    margin: string;
    negative: boolean;
    basis: string | null;
    quoted: string | null;
    vsQuoted: string | null;
    below: boolean;
  };
  emptyReturnNote: string | null;
  /** Things to add before the job can be costed. */
  missing: string[];
  /** An in-progress note (`Working out tolls…`): shown calmly, with a refresh. */
  pending: string | null;
}

const LEG_TITLE: Record<LegRole, string> = { single: 'This job', outbound: 'Outbound', return: 'Return' };

function legView(l: Leg, i: number): LegView {
  const basis = basisLabel(l.costBasis);
  return {
    key: `${l.role}-${l.loadId ?? i}`,
    title: LEG_TITLE[l.role],
    lane: l.lane,
    loadId: l.loadId,
    revenue: rand(l.revenue),
    costLabel: l.costBasis === 'actual' ? 'Actual cost' : 'Estimated cost',
    cost: l.cost == null ? '—' : rand(l.cost),
    margin: marginText(l.margin, l.marginPct),
    negative: (l.margin ?? 0) < 0,
    basis,
    quoted: l.quotedMarginPct == null ? null : `Quoted ${percent(l.quotedMarginPct)}`,
    vsQuoted: vsQuotedText(l.marginVsQuotedPts),
    below: (l.marginVsQuotedPts ?? 0) <= -0.05,
  };
}

/** What the margin card shows: per leg, the pair combined, and what's missing. */
export function marginCardView(e: Economics): MarginCardView {
  const legs = e.legs.map(legView);
  const c = e.pair ? e.combined : null;
  const removed = e.pair && (c?.emptyReturnRemoved ?? 0) > 0;
  const seen = new Set<string>();
  const missing: string[] = [];
  let pending: string | null = null;
  for (const l of e.legs) {
    for (const m of l.missing) {
      if (m.pending) {
        pending = pending ?? m.prompt;
        continue;
      }
      if (seen.has(m.prompt)) continue;
      seen.add(m.prompt);
      missing.push(m.prompt);
    }
  }
  return {
    legs,
    combined: c
      ? {
          margin: marginText(c.margin, c.marginPct),
          negative: (c.margin ?? 0) < 0,
          basis: basisLabel(c.costBasis),
          quoted: c.quotedMarginPct == null ? null : `Quoted ${percent(c.quotedMarginPct)}`,
          vsQuoted: vsQuotedText(c.marginVsQuotedPts),
          below: (c.marginVsQuotedPts ?? 0) <= -0.05,
        }
      : null,
    emptyReturnNote: removed ? EMPTY_RETURN_REMOVED : null,
    missing,
    pending,
  };
}

/** The other leg of a pair, seen from `loadId`. */
export function partnerLeg(e: Economics, loadId: number | string): Leg | null {
  if (!e.pair) return null;
  return e.legs.find((l) => String(l.loadId) !== String(loadId)) ?? null;
}

// ── Booking (POST quotes/{id}/convert_to_load/) ─────────────────────────────
export interface InvoiceLine {
  label: string;
  amount: string;
}

export interface InvoicePreviewView {
  heading: string;
  lines: InvoiceLine[];
  subtotal: string | null;
  vat: string | null;
  total: string | null;
  note: string | null;
}

const randCents = (n: number | null): string => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Math.abs(n));
  return n < 0 ? `${MINUS}${body}` : body;
};

/** `NET30` → `Due in 30 days`. */
export function termsText(terms: unknown, days?: unknown): string | null {
  const d = numOrNull(days) ?? numOrNull(/^NET(\d+)$/i.exec(text(terms).trim())?.[1]);
  return d == null ? null : `Due in ${d} days`;
}

export function invoicePreviewView(raw: unknown): InvoicePreviewView | null {
  const p = obj(raw);
  const state = text(p.state);
  if (!state) return null;
  if (state === 'not_invoiceable') {
    return {
      heading: 'No invoice',
      lines: [],
      subtotal: null,
      vat: null,
      total: null,
      note: p.reason === 'cancelled' ? 'The job is cancelled.' : 'The job has no amount to invoice.',
    };
  }
  if (state === 'raised') {
    return {
      heading: text(p.invoice_number) ? `Invoice ${text(p.invoice_number)}` : 'Invoice raised',
      lines: [],
      subtotal: randCents(numOrNull(p.subtotal)),
      vat: randCents(numOrNull(p.vat_amount)),
      total: randCents(numOrNull(p.total)),
      note: null,
    };
  }
  const notes: string[] = [];
  const terms = termsText(p.payment_terms, p.terms_days);
  if (terms) notes.push(terms);
  if (state === 'on_delivery' && p.auto_email === true) notes.push('emailed to the customer');
  const note = notes.join(' · ');
  return {
    heading: state === 'on_delivery' ? 'Invoice on delivery' : 'Invoice after delivery',
    lines: arr(p.lines)
      .map((l) => obj(l))
      .map((l) => ({ label: text(l.description) || 'Transport', amount: randCents(numOrNull(l.net_amount)) })),
    subtotal: randCents(numOrNull(p.subtotal)),
    vat: randCents(numOrNull(p.vat_amount)),
    total: randCents(numOrNull(p.total)),
    note: note ? note.charAt(0).toUpperCase() + note.slice(1) : null,
  };
}

export interface ReturnLink {
  linked: boolean;
  expectingReturn: boolean;
  warnings: LinkWarning[];
  /** Set when a requested link couldn't be made (the job stays booked). */
  error: string | null;
}

export interface BookingResult {
  loadId: number | string | null;
  loadNumber: string;
  /** False on an older backend: no booking block, just the new load. */
  hasBooking: boolean;
  alreadyConverted: boolean;
  isReturnOf: number | string | null;
  returnLoadId: number | string | null;
  expectingReturn: boolean;
  returnLink: ReturnLink | null;
  returnCandidates: Candidate[];
  outboundCandidates: Candidate[];
  invoice: InvoicePreviewView | null;
  economics: Economics | null;
}

export function parseBooking(body: unknown): BookingResult {
  const b = obj(body);
  const bk = b.booking && typeof b.booking === 'object' ? obj(b.booking) : null;
  const link = bk?.return_link ? obj(bk.return_link) : null;
  return {
    loadId: (b.id as number | string | undefined) ?? (b.pk as number | string | undefined) ?? null,
    loadNumber: text(b.load_number),
    hasBooking: !!bk,
    alreadyConverted: bk?.already_converted === true,
    isReturnOf: (bk?.is_return_of as number | string | undefined) ?? null,
    returnLoadId: (bk?.return_load_id as number | string | undefined) ?? null,
    expectingReturn: bk?.expecting_return === true,
    returnLink: link
      ? {
          linked: link.linked === true,
          expectingReturn: link.expecting_return === true,
          warnings: parseWarnings(link.warnings),
          error: link.error ? text(link.detail) || 'That return load could not be linked.' : null,
        }
      : null,
    returnCandidates: parseCandidates(bk?.return_candidates),
    outboundCandidates: parseCandidates(bk?.outbound_candidates),
    invoice: invoicePreviewView(bk?.invoice_preview),
    economics: parseEconomics(bk?.economics),
  };
}

/** True while some leg's costing is still being worked out (poll / refresh). */
export const economicsPending = (e: Economics | null | undefined): boolean =>
  !!e && e.legs.some((l) => l.missing.some((m) => m.pending));

// ── Booking preview (GET quotes/{id}/booking-preview/, no job created) ──────
export interface BookingPreview {
  /** False when the quote is already booked: `loadId` is its job. */
  preview: boolean;
  canBook: boolean;
  /** Why booking would be refused, in the server's words. */
  blockedText: string | null;
  loadId: number | string | null;
  returnCandidates: Candidate[];
  outboundCandidates: Candidate[];
  invoice: InvoicePreviewView | null;
}

function blockedSentence(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = obj(raw);
  const block = arr(b.warnings)
    .map((w) => obj(w))
    .find((w) => w.severity === 'block' && text(w.title));
  if (block) return text(block.title);
  return text(b.error) || "This quote can't be booked yet.";
}

/** Null when the body isn't a booking preview. */
export function parseBookingPreview(body: unknown): BookingPreview | null {
  const b = obj(body);
  if (typeof b.can_book !== 'boolean' || !b.booking) return null;
  const bk = obj(b.booking);
  return {
    preview: b.preview !== false,
    canBook: b.can_book,
    blockedText: b.can_book ? null : blockedSentence(b.blocked),
    loadId: (b.load_id as number | string | undefined) ?? null,
    returnCandidates: parseCandidates(bk.return_candidates),
    outboundCandidates: parseCandidates(bk.outbound_candidates),
    invoice: invoicePreviewView(bk.invoice_preview),
  };
}

/**
 * The "Coming back loaded?" choice before booking: back empty, expecting one,
 * or a specific load. `out:<id>` = this job is that load's return (sent as
 * return_of_load_id); `ret:<id>` = that load brings this truck home (linked
 * right after booking).
 */
export type ReturnChoice = 'empty' | 'expect' | `out:${string}` | `ret:${string}`;

export function bookingBodyFor(choice: ReturnChoice): {
  expect_return?: boolean;
  return_of_load_id?: string;
  linkReturnId?: string;
} {
  if (choice === 'expect') return { expect_return: true };
  if (choice.startsWith('out:')) return { return_of_load_id: choice.slice(4) };
  if (choice.startsWith('ret:')) return { linkReturnId: choice.slice(4) };
  return {};
}

/** What a refused booking says: the server's own sentence where it has one. */
export function bookErrorText(err: unknown): string {
  const e = obj(err);
  const data = obj(e.data);
  if (data.code === 'quote_not_bookable' && text(data.error)) return text(data.error);
  if (err instanceof Error && err.message) return err.message;
  return text(data.error) || "Couldn't book this job. Try again.";
}

// ── Pricing analysis: how often this lane found a return load ───────────────
/**
 * The analysis answered and carries the field (even as null): no fallback
 * call. False while it's loading and on an older backend.
 */
export const analysisHasReturnHistory = (analysis: unknown): boolean =>
  !!analysis && typeof analysis === 'object' && 'return_load_history' in (analysis as Raw);

/** `On this lane 60% of your trips found a return load (12 of 20).`, or null. */
export function returnHistoryText(analysis: unknown): string | null {
  const a = obj(analysis);
  const direct = text(obj(a.return_load_history).text);
  if (direct) return direct;
  return text(obj(obj(a.alternative_with_return_load).return_load_history).text) || null;
}

// ── Quote detail: what the job really earned ────────────────────────────────
export interface ActualsView {
  margin: string;
  negative: boolean;
  basis: string | null;
  revenue: string | null;
  cost: string | null;
  backhaul: string | null;
}

export function actualsView(raw: unknown): ActualsView | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = obj(raw);
  const pct = numOrNull(a.actual_margin_pct);
  const revenue = numOrNull(a.actual_revenue);
  const cost = numOrNull(a.actual_cost);
  if (pct == null && revenue == null) return null;
  return {
    margin: pct == null ? '—' : percent(pct),
    negative: (pct ?? 0) < 0,
    basis: basisLabel(basisOf(a.actual_cost_basis)),
    revenue: revenue == null ? null : rand(revenue),
    cost: cost == null ? null : rand(cost),
    backhaul: a.backhaul_found === true ? 'Came back loaded' : a.backhaul_found === false ? 'Came back empty' : null,
  };
}

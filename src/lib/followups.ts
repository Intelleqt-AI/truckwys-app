// Quote follow-ups (FOLLOWUPS-CLIENT-SPEC.md): fuel price clause, fuel change
// alerts, expiry / no-answer nudges and the customer reminder, the weekly
// margin report and the pricing setup step. Pure display rules only.
//
// Mirror of the web's src/lib/followups.ts (same function names, same cases in
// __tests__/followups.test.mjs) so both clients print identical strings.
// Display text the backend sends (message, description, clause, display,
// default_text, reason_text) is shown as it is and never rebuilt here.
//
// Pure, no imports: runs under `node --test`. Figures use a plain space for
// thousands, like the app's other SA formatters (the web uses a no-break space).

export const MISSING = '—';
const MINUS = '−';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SAST_MS = 2 * 3600 * 1000;

// ------------------------------------------------------------------ types

export interface QuoteAutomation {
  fuel_surcharge_enabled: boolean;
  fuel_surcharge_threshold_pct: number;
  fuel_surcharge_prompt_pending: boolean;
  fuel_surcharge_decided_at: string | null;
  fuel_alerts_enabled: boolean;
  follow_ups_enabled: boolean;
  follow_up_after_days: number;
  expiry_nudge_days: number;
  weekly_margin_email_enabled: boolean;
}

export type AdjustmentReason =
  'no_clause' | 'no_official_price' | 'within_threshold' | 'applies' | 'no_quote';

export interface FuelAdjustment {
  /** Quote endpoint: the PDF's fuel line (server-built). */
  reference?: string | null;
  quote_id: number | null;
  load_id: number | null;
  applies: boolean;
  reason: AdjustmentReason;
  clause: string | null;
  stamped?: boolean;
  amount_zar: number | null;
  amount_display?: string;
  direction: 'up' | 'down' | null;
  description: string | null;
  product?: string;
  zone?: string;
  litres?: number;
  price_at_pricing?: number;
  price_on_trip?: number | null;
  change_pct?: number | null;
  threshold_pct?: number;
  trip_date?: string;
  trip_date_source?: string;
  provisional?: boolean;
  invoiced?: { invoice_id: number; line_id: number | null; amount_zar: number | null } | null;
}

export interface FollowUpState {
  quote_id: number;
  status: string;
  sent_at: string | null;
  sent_at_estimated: boolean;
  days_since_sent: number | null;
  valid_until: string | null;
  expires_in_days: number | null;
  expiry_nudged_at: string | null;
  no_answer_nudged_at: string | null;
  reminder: {
    last_sent_at: string | null;
    count: number;
    last_sent_to: string | null;
    can_send: boolean;
    reason: string | null;
    reason_text: string | null;
  };
}

export interface ReminderPreview {
  can_send: boolean;
  reason: string | null;
  reason_text: string | null;
  preview: {
    to: string;
    reply_to: string | null;
    subject: string;
    text: string;
    html: string;
  } | null;
}

export interface FuelAlertQuote {
  quote_id: number;
  quote_number: string;
  customer: string;
  status: string;
  valid_until: string | null;
  price: number;
  floor_then: number | null;
  floor_now: number | null;
  delta_zar: number | null;
  margin_then: number | null;
  margin_now: number | null;
  under_target: boolean;
  repriced_price_keep_margin: number | null;
  zone: string;
  link: string;
  status_now: string;
  still_open: boolean;
}

export interface FuelAlert {
  id: number;
  product: string;
  fuel: string;
  zone: string;
  period_start: string;
  effective_from: string;
  old_price: number;
  new_price: number;
  delta: number;
  target_margin_pct: number;
  quotes_affected: number;
  quotes_under_target: number;
  title: string;
  message: string;
  notified_at: string | null;
  created_at: string;
  quotes?: FuelAlertQuote[];
}

export interface PricingSetupItem {
  key: 'target_margin' | 'operating_cost' | 'driver_allowance' | 'fuel_mode' | string;
  label: string;
  value: unknown;
  display: string;
  default_text: string;
  set: boolean;
  how: 'changed' | 'confirmed' | 'inferred' | null;
  set_at: string | null;
}

export interface PricingSetup {
  needs_setup: boolean;
  unset: string[];
  dismissed_at: string | null;
  items: PricingSetupItem[];
}

// ------------------------------------------------------------------ numbers

function halfUpFixed(v: number, dp: number): string {
  const shifted = Math.round(Number(`${Math.abs(v)}e${dp}`));
  return Number(`${shifted}e-${dp}`).toFixed(dp);
}

/** "1 275,46" (no sign). */
function saNum(v: number, dp: number): string {
  const [i, d] = halfUpFixed(v, dp).split('.');
  return `${(i ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${d ? `,${d}` : ''}`;
}

const finite = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** "R 32,80" / "−R 812,40" / "R 32 347" (dp 0). "—" for no value. */
export function formatMoney(v: number | null | undefined, dp = 2): string {
  const n = finite(v);
  if (n === null) return MISSING;
  const shown = Number(halfUpFixed(n, dp));
  return `${n < 0 && shown !== 0 ? MINUS : ''}R ${saNum(n, dp)}`;
}

/** A 0..100 value: "7,5%" / "−4,6%". */
function formatPercent(v: number, dp: number): string {
  const shown = Number(halfUpFixed(v, dp));
  return `${v < 0 && shown !== 0 ? MINUS : ''}${saNum(v, dp)}%`;
}

// ------------------------------------------------------------------ errors

/** The backend's `message` ({success: false, code, message}) else the fallback. */
export function apiMessage(err: unknown, fallback: string): string {
  const e = err as { data?: { message?: unknown; detail?: unknown; error?: unknown }; status?: unknown } | null;
  for (const m of [e?.data?.message, e?.data?.detail, e?.data?.error]) {
    if (typeof m === 'string' && m.trim()) return m;
  }
  const status = Number(e?.status);
  if (status === 403) return 'You don’t have permission to do this.';
  if (status === 404) return 'Not found. It may have been deleted.';
  if (Number.isInteger(status) && status >= 500) return `${fallback} (server error ${status})`;
  return fallback;
}

/** The backend's error `code` ("too_soon", "demo", …), else null. */
export function apiCode(err: unknown): string | null {
  const c = (err as { data?: { code?: unknown } } | null)?.data?.code;
  return typeof c === 'string' && c ? c : null;
}

/** Per-field messages from a 400 `invalid_input` ({errors: {field: message}}). */
export function fieldErrors(err: unknown): Record<string, string> {
  const errors = (err as { data?: { errors?: unknown } } | null)?.data?.errors;
  if (!errors || typeof errors !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errors as Record<string, unknown>)) {
    const msg = Array.isArray(v) ? v[0] : v;
    if (typeof msg === 'string') out[k] = msg;
  }
  return out;
}

// ------------------------------------------------------------------ numbers and dates

/** "5%", "7,5%", "2,1%": whole numbers without a decimal, else one. */
export function pctText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return MISSING;
  const r1 = Math.round(Number(v) * 10) / 10;
  return formatPercent(r1, Number.isInteger(r1) ? 0 : 1);
}

/** "11,0%": always one decimal (margins in the fuel alert list). */
export function marginText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return MISSING;
  return formatPercent(Number(v), 1);
}

function sastParts(v: string): { y: number; m: number; d: number } | null {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (plain) return { y: Number(plain[1]), m: Number(plain[2]) - 1, d: Number(plain[3]) };
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return null;
  const s = new Date(t.getTime() + SAST_MS);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), d: s.getUTCDate() };
}

/** "Fri 7 Nov" (SAST calendar day). */
export function dayText(v: string | null | undefined): string {
  if (!v) return MISSING;
  const p = sastParts(v);
  if (!p) return MISSING;
  const wd = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay();
  return `${DAYS[wd]} ${p.d} ${MONTHS[p.m]}`;
}

/** "2 Oct" (SAST calendar day). */
export function shortDay(v: string | null | undefined): string {
  if (!v) return MISSING;
  const p = sastParts(v);
  return p ? `${p.d} ${MONTHS[p.m]}` : MISSING;
}

/** "7 Oct 2026" (SAST calendar day), or null. */
function longDay(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const p = sastParts(v);
  return p ? `${p.d} ${MONTHS[p.m]} ${p.y}` : null;
}

// ------------------------------------------------------------------ fuel clause

function fuelName(product: string | undefined): string {
  if (!product || product === 'diesel') return 'Diesel';
  const grade = product.split('_')[1];
  return grade ? `Petrol ${grade}` : 'Petrol';
}

export interface AdjustmentRow {
  /** Main line: the backend description, or the provisional / no-change sentence. */
  title: string;
  /** "+R 1 275,46" / "−R 812,40", only when it applies and is final. */
  amount: string | null;
  /** The muted line under it. */
  sub: string | null;
  /** Invoice link (load detail, once invoiced). */
  invoiceId: number | null;
  tone: 'neutral' | 'up' | 'down';
}

/** The "Fuel price adjustment" row on a sent quote or a load. Null = hide it. */
export function adjustmentRow(a: FuelAdjustment | null | undefined): AdjustmentRow | null {
  if (!a || a.reason === 'no_clause' || a.reason === 'no_quote') return null;
  // Only a clause the customer was sent (stamped) ever changes an invoice.
  if (a.stamped === false) return null;
  if (a.reason === 'no_official_price') {
    return {
      title: 'No official price for the trip date yet.',
      amount: null,
      sub: null,
      invoiceId: null,
      tone: 'neutral',
    };
  }
  if (a.reason === 'within_threshold') {
    const moved = a.change_pct == null ? null : Math.abs(Number(a.change_pct));
    return {
      title: `${fuelName(a.product)} moved ${pctText(moved)}, inside your ${pctText(a.threshold_pct)} clause. No change.`,
      amount: null,
      sub: null,
      invoiceId: null,
      tone: 'neutral',
    };
  }
  if (a.reason !== 'applies' || a.amount_zar == null) return null;
  const abs = formatMoney(Math.abs(Number(a.amount_zar)));
  const down = a.direction === 'down' || Number(a.amount_zar) < 0;
  if (a.provisional) {
    return {
      title: `If the price stays at ${formatMoney(a.price_on_trip)}/L, the fuel part goes ${down ? 'down' : 'up'} ${abs}.`,
      amount: null,
      sub: 'Final on the trip date.',
      invoiceId: null,
      tone: 'neutral',
    };
  }
  const invoiced = a.invoiced && a.invoiced.invoice_id != null ? a.invoiced : null;
  return {
    title: a.description || 'Fuel price adjustment',
    amount: `${down ? MINUS : '+'}${abs}`,
    sub: invoiced ? 'On invoice' : 'Added to the invoice when the load is delivered.',
    invoiceId: invoiced ? invoiced.invoice_id : null,
    tone: down ? 'down' : 'up',
  };
}

/** The draft quote's muted line: what the PDF will say (diesel line + clause). */
export function draftClauseLine(
  reference: string | null | undefined,
  clause: string | null | undefined,
): string | null {
  const parts = [reference, clause].map((s) => (s || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/**
 * "Priced on diesel at R 32,80/L (official inland, 7 Oct 2026)." from a saved
 * quote: the line the PDF prints (backend quote_pdf.diesel_reference_line),
 * or null when the quote has no pricing snapshot.
 */
export function fuelReferenceLine(
  quote: Record<string, unknown> | null | undefined,
): string | null {
  const q = quote ?? {};
  const price = finite(q.fuel_price_used);
  const source = typeof q.fuel_price_source === 'string' ? q.fuel_price_source : '';
  if (price === null || !source) return null;
  const snapRaw = (q.costing_snapshot as Record<string, unknown> | null | undefined)?.diesel;
  const snap = snapRaw && typeof snapRaw === 'object' ? (snapRaw as Record<string, unknown>) : {};
  const fuel = String(snap.fuel_type || 'Diesel').toLowerCase();
  const grade = snap.grade ? String(snap.grade) : '';
  const name =
    fuel === 'petrol'
      ? grade
        ? `petrol ${grade}`
        : 'petrol'
      : fuel === 'electric'
        ? 'electricity'
        : fuel;
  const unit = fuel === 'electric' ? 'kWh' : 'L';
  const zone = String(q.fuel_zone || '').toUpperCase() === 'COASTAL' ? 'coastal' : 'inland';
  const what =
    source === 'official'
      ? `official ${zone}`
      : source === 'own'
        ? 'own price'
        : source === 'override'
          ? 'set for this quote'
          : source;
  const when =
    (source === 'official' ? longDay(q.fuel_effective_from) : null) ?? longDay(q.priced_at);
  return `Priced on ${name} at ${formatMoney(price)}/${unit} (${what}${when ? `, ${when}` : ''}).`;
}

/** The example sentence in the one-time prompt, from the company's own threshold. */
export function promptExample(thresholdPct: number | null | undefined): string {
  const pct = pctText(thresholdPct ?? 5);
  return `If the official price moves more than ${pct} before the trip, the fuel part of this quote changes by the same amount.`;
}

/**
 * The diesel line in front of the prompt's example: "Priced on diesel at
 * R 32,80/L (official inland, 7 Oct 2026). " (with its trailing space), or ''
 * when there is no official price to quote.
 */
export function promptReference(
  price: number | null | undefined,
  zone?: string | null,
  effectiveFrom?: string | null,
): string {
  const p = finite(price);
  if (p === null || p <= 0) return '';
  const z = String(zone || '').toUpperCase() === 'COASTAL' ? 'coastal' : 'inland';
  const when = longDay(effectiveFrom);
  return `Priced on diesel at ${formatMoney(p)}/L (official ${z}${when ? `, ${when}` : ''}). `;
}

// ------------------------------------------------------------------ fuel alert

/** "R 29,56 → R 32,80/L (official inland)". */
export function alertPriceLine(a: Pick<FuelAlert, 'old_price' | 'new_price' | 'zone'>): string {
  const zone = String(a.zone || '').toUpperCase() === 'COASTAL' ? 'coastal' : 'inland';
  return `${formatMoney(a.old_price)} → ${formatMoney(a.new_price)}/L (official ${zone})`;
}

/** "R 32 347 → R 33 622". */
export function floorChange(q: Pick<FuelAlertQuote, 'floor_then' | 'floor_now'>): string {
  return `${formatMoney(q.floor_then, 0)} → ${formatMoney(q.floor_now, 0)}`;
}

/** "11,0% → 7,5%". */
export function marginChange(q: Pick<FuelAlertQuote, 'margin_then' | 'margin_now'>): string {
  return `${marginText(q.margin_then)} → ${marginText(q.margin_now)}`;
}

const STATUS_WORD: Record<string, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  CONVERTED: 'Booked',
  COMPLETED: 'Completed',
};

export function statusWord(s: string | null | undefined): string {
  const k = String(s || '').toUpperCase();
  return STATUS_WORD[k] || (k ? k.charAt(0) + k.slice(1).toLowerCase() : MISSING);
}

/** Under-target rows first, then the rest; rows no longer open last. */
export function sortAlertQuotes<T extends Pick<FuelAlertQuote, 'still_open' | 'under_target'>>(
  rows: T[],
): T[] {
  const rank = (q: T) => (q.still_open ? 0 : 2) + (q.under_target ? 0 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b));
}

// ------------------------------------------------------------------ follow-up card

/** "Sent 3 days ago" / "Sent about 3 days ago" / "Sent today" / "Sent yesterday". */
export function sentLine(
  s: Pick<FollowUpState, 'days_since_sent' | 'sent_at_estimated'>,
): string | null {
  const n = s.days_since_sent;
  if (n == null || !Number.isFinite(Number(n))) return null;
  const about = s.sent_at_estimated ? 'about ' : '';
  if (n <= 0) return 'Sent today';
  if (n === 1) return s.sent_at_estimated ? 'Sent about a day ago' : 'Sent yesterday';
  return `Sent ${about}${n} days ago`;
}

/** "Expires Fri 7 Nov" / "Expires today" / "Expires tomorrow" / "Expired on Fri 7 Nov". */
export function expiresLine(
  s: Pick<FollowUpState, 'valid_until' | 'expires_in_days'>,
): string | null {
  if (!s.valid_until) return null;
  const n = s.expires_in_days;
  if (n != null && n < 0) return `Expired on ${dayText(s.valid_until)}`;
  if (n === 0) return 'Expires today';
  if (n === 1) return 'Expires tomorrow';
  return `Expires ${dayText(s.valid_until)}`;
}

/** "Last reminder 2 Oct", when there has been one. */
export function lastReminderLine(s: Pick<FollowUpState, 'reminder'>): string | null {
  const at = s.reminder?.last_sent_at;
  return at ? `Last reminder ${shortDay(at)}` : null;
}

export const NOTE_MAX = 500;

/** The reminder note as the API takes it (trimmed, never more than 500 characters). */
export function cleanNote(note: string): string {
  return note.trim().slice(0, NOTE_MAX);
}

/** The follow-up card shows on a sent quote only. */
export function showFollowUp(status: string | null | undefined): boolean {
  return String(status || '').toUpperCase() === 'SENT';
}

/** The second-step button: "Send to buyer@acme.test". */
export function reminderSendLabel(to: string | null | undefined): string {
  return to ? `Send to ${to}` : 'Send reminder';
}

/** The toast after a reminder went out. */
export function reminderSentText(to: string | null | undefined): string {
  return to ? `Reminder sent to ${to}` : 'Reminder sent';
}

// ------------------------------------------------------------------ notifications

export const FOLLOWUP_EVENT_TITLES: Record<string, string> = {
  'quote.fuel_alert': 'Fuel price alert',
  'quote.expiring': 'Quote expiring soon',
  'quote.no_answer': 'No answer yet',
};

/** Where a follow-up notification opens (the backend link, else rebuilt from the event). */
export function followUpLink(
  event: string,
  data: {
    link?: string | null;
    alert_id?: number | string | null;
    quote_id?: number | string | null;
  } = {},
): string | null {
  if (data.link) return data.link;
  if (event === 'quote.fuel_alert' && data.alert_id != null)
    return `/bookings/quotes?fuel_alert=${data.alert_id}`;
  if ((event === 'quote.expiring' || event === 'quote.no_answer') && data.quote_id != null) {
    return `/bookings/quotes/${data.quote_id}?follow_up=1`;
  }
  return null;
}

/** The fuel alert id in a quotes-list URL (?fuel_alert=12), else null. */
export function fuelAlertParam(search: string): number | null {
  const m = /[?&]fuel_alert=([^&#]*)/.exec(search || '');
  const n = m ? Number(decodeURIComponent(m[1] ?? '')) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** True for a quote link carrying ?follow_up=1. */
export function followUpParam(search: string): boolean {
  return /[?&]follow_up=(1|true)(?:&|#|$)/.test(search || '');
}

// ------------------------------------------------------------------ settings

export const AUTOMATION_BOUNDS = {
  fuel_surcharge_threshold_pct: {
    min: 1,
    max: 25,
    message: 'Enter a fuel price change between 1% and 25%.',
  },
  follow_up_after_days: { min: 1, max: 30, message: 'Enter a number of days between 1 and 30.' },
  expiry_nudge_days: { min: 1, max: 14, message: 'Enter a number of days between 1 and 14.' },
} as const;

type AutomationKey = keyof QuoteAutomation;

const LABELS: Partial<Record<AutomationKey, string>> = {
  fuel_surcharge_enabled: 'Fuel price clause on quotes',
  fuel_surcharge_threshold_pct: 'Fuel clause threshold',
  fuel_alerts_enabled: 'Fuel price alerts',
  follow_ups_enabled: 'Follow-up reminders',
  follow_up_after_days: 'Reminder after no answer',
  expiry_nudge_days: 'Reminder before expiry',
  weekly_margin_email_enabled: 'Weekly margin email',
};

const EDITABLE: AutomationKey[] = [
  'fuel_surcharge_enabled',
  'fuel_surcharge_threshold_pct',
  'fuel_alerts_enabled',
  'follow_ups_enabled',
  'follow_up_after_days',
  'expiry_nudge_days',
  'weekly_margin_email_enabled',
];

/** Only the fields that changed, for the PATCH. */
export function automationPatch(
  saved: QuoteAutomation,
  draft: QuoteAutomation,
): Partial<QuoteAutomation> {
  const out: Partial<QuoteAutomation> = {};
  for (const k of EDITABLE) {
    if (Number(saved[k]) !== Number(draft[k])) {
      (out as Record<string, unknown>)[k] = draft[k];
    }
  }
  return out;
}

function valueText(k: AutomationKey, v: unknown): string {
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (k === 'fuel_surcharge_threshold_pct') return pctText(Number(v));
  const n = Number(v);
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/** One line per change for the confirm dialog: "Fuel price clause on quotes: Off to On". */
export function automationChangeLines(
  saved: QuoteAutomation,
  patch: Partial<QuoteAutomation>,
): string[] {
  return (Object.keys(patch) as AutomationKey[]).map(
    (k) => `${LABELS[k] || k}: ${valueText(k, saved[k])} to ${valueText(k, patch[k])}`,
  );
}

/** Client check (the server checks again): the field's message, else null. */
export function boundError(k: keyof typeof AUTOMATION_BOUNDS, raw: string | number): string | null {
  const b = AUTOMATION_BOUNDS[k];
  const s = String(raw).trim().replace(',', '.');
  if (s === '' || !/^\d+(\.\d+)?$/.test(s)) return b.message;
  const n = Number(s);
  if (k !== 'fuel_surcharge_threshold_pct' && !Number.isInteger(n)) return b.message;
  if (k === 'fuel_surcharge_threshold_pct' && !/^\d+(\.\d{1,2})?$/.test(s)) return b.message;
  return n < b.min || n > b.max ? b.message : null;
}

/** A typed bound field as a number ("7,5" → 7.5), once boundError passed. */
export const boundValue = (raw: string | number): number =>
  Number(String(raw).trim().replace(',', '.'));

/** A stored value as its box shows it ("7,5", "3"). */
export const boundText = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(Number(v)) ? '' : String(Number(v)).replace('.', ',');

// ------------------------------------------------------------------ pricing setup

/** The rows the setup step shows: one per unset item, in the backend's order. */
export function unsetItems(
  s: Pick<PricingSetup, 'unset' | 'items'> | null | undefined,
): PricingSetupItem[] {
  if (!s) return [];
  const unset = Array.isArray(s.unset) ? s.unset : null;
  return (s.items || []).filter((i) => (unset ? unset.includes(i.key) : !i.set));
}

/** POST body for "These look right": confirm exactly the unset keys. */
export function confirmBody(s: Pick<PricingSetup, 'unset' | 'items'> | null | undefined) {
  return { action: 'confirm' as const, keys: unsetItems(s).map((i) => i.key) };
}

// ------------------------------------------------------------------ weekly margin report

/** Null means no data: "—", never 0. */
export function reportPct(v: number | null | undefined): string {
  return v == null ? MISSING : formatPercent(v, 1);
}

export function reportMoney(v: number | null | undefined): string {
  return v == null ? MISSING : formatMoney(v, 0);
}

/** The Actual column: "13,9% (1 of 2 loads)" when only some loads have actual costs. */
export function actualMarginText(row: {
  loads: number;
  actual_loads: number;
  actual_margin_pct: number | null;
}): string {
  if (row.actual_margin_pct == null || !row.actual_loads) return MISSING;
  const pct = reportPct(row.actual_margin_pct);
  return row.actual_loads < row.loads ? `${pct} (${row.actual_loads} of ${row.loads} loads)` : pct;
}

/** "+6,7 pts" / "−4,6 pts" against the target. */
export function ptsText(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return MISSING;
  const n = Math.round(Number(v) * 10) / 10;
  if (n === 0) return '0 pts';
  return `${n > 0 ? '+' : MINUS}${formatPercent(Math.abs(n), 1).replace('%', '')} pts`;
}

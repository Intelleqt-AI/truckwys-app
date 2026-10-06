import { CAPITAL_LAUNCHED } from '@/lib/features';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { isOpenLoad, staleLabel, staleWork } from '@/lib/staleWork';
import { saDaysBetween } from '@/lib/dates';
import type { Load, Vehicle } from '@/lib/ledger';

// Home "Needs you": turn the backend's signals into clean rows. Port of the web
// Overview's components/overview/signals.ts and the filtering in pages/Overview.tsx.
// The signal API returns prose ("Tiger Brands Ltd owes R 20,505.65. Due
// 2026-06-05. Chase now."); known patterns are parsed into parts, anything else
// is shown as written after safe clean-up (en-ZA figures, dates, sentence case,
// no em dashes).

const wholeRand = (n: number) => formatCurrency(n, { maximumFractionDigits: 0 });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const days = (n: number) => plural(n, 'day');

// ── Raw signal ──────────────────────────────────────────────────────────────
export interface HomeSignal {
  category: string;
  title: string;
  body: string;
  action: string;
  actionUrl: string | null;
  severity: string;
  type: string;
}

const asStr = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** The signals response (`{signals: []}` or a bare array) as clean HomeSignals. */
export function parseSignals(raw: unknown): HomeSignal[] {
  const list = Array.isArray(raw) ? raw : ((raw as { signals?: unknown[] } | null)?.signals ?? []);
  return (Array.isArray(list) ? list : []).map((item) => {
    const s = (item ?? {}) as Record<string, unknown>;
    const url = asStr(s.action_url);
    return {
      category: asStr(s.category || s.type) || 'Update',
      title: asStr(s.title),
      // The backend appends invented loss estimates ("Estimated revenue loss:
      // R 72,000/day") with no basis. Dropped, as on the web.
      body: asStr(s.body || s.message)
        .replace(/\s*Estimated revenue loss:[^.]*\.?/gi, '')
        .trim(),
      action: asStr(s.action) || 'VIEW',
      actionUrl: url.startsWith('/') ? url : null,
      severity: asStr(s.severity) || 'low',
      type: asStr(s.type) || 'INFO',
    };
  });
}

/** Fast Pay is not live: its signals describe money that is not available. */
export const isFastPaySignal = (s: { title?: string; body?: string; action?: string; actionUrl?: string | null }) =>
  /fast\s*pay|advance/i.test(`${s.title ?? ''} ${s.body ?? ''} ${s.action ?? ''}`) ||
  s.actionUrl === '/capital';

/** The backend's "N vehicles idle" signal, which Home replaces with its own count. */
export const isIdleVehiclesSignal = (s: { title?: string }) =>
  /(vehicles?|trucks?)\s+idle/i.test(String(s?.title ?? ''));
/** The backend's "N loads in transit" signal, which Home replaces with the left-open row. */
export const isInTransitSignal = (s: { title?: string }) =>
  /loads?\s+in\s+transit/i.test(String(s?.title ?? ''));

// ── Rows ────────────────────────────────────────────────────────────────────
export type NeedsTarget =
  | { kind: 'invoice'; id: string }
  | { kind: 'tab'; tab: 'Bookings'; params?: { tab: 'orders' | 'quotes' } }
  | { kind: 'tab'; tab: 'Fleet'; params?: { tab: 'vehicles' | 'drivers' } }
  | { kind: 'tab'; tab: 'Finance'; params?: { tab: 'invoices' | 'expenses' | 'reports' } }
  | { kind: 'screen'; name: 'Capital' | 'Copilot' };

export interface NeedsRow {
  kind: 'invoice' | 'fleet' | 'other';
  title: string;
  detail: string;
  /** Money figure shown right-aligned on the row. */
  amount?: string;
  actionLabel: string | null;
  target: NeedsTarget | null;
  severity: string;
}

/** Where a web action_url lands in the app, or null when the app has no such place. */
export function targetFromUrl(url: string | null | undefined): NeedsTarget | null {
  if (!url) return null;
  const path = url.split('?')[0] ?? '';
  const inv = /^\/finance\/invoices\/(\d+)\/?$/.exec(path);
  if (inv?.[1]) return { kind: 'invoice', id: inv[1] };
  if (path.startsWith('/finance/reports')) return { kind: 'tab', tab: 'Finance', params: { tab: 'reports' } };
  if (path.startsWith('/finance/expenses')) return { kind: 'tab', tab: 'Finance', params: { tab: 'expenses' } };
  if (path.startsWith('/finance')) return { kind: 'tab', tab: 'Finance', params: { tab: 'invoices' } };
  if (path.startsWith('/fleet')) return { kind: 'tab', tab: 'Fleet', params: { tab: 'vehicles' } };
  if (path.startsWith('/bookings/quotes')) return { kind: 'tab', tab: 'Bookings', params: { tab: 'quotes' } };
  if (path.startsWith('/bookings')) return { kind: 'tab', tab: 'Bookings', params: { tab: 'orders' } };
  if (path.startsWith('/capital')) return { kind: 'screen', name: 'Capital' };
  if (path.startsWith('/copilot')) return { kind: 'screen', name: 'Copilot' };
  return null;
}

const ACTION_LABELS: Record<string, string> = {
  CHASE: 'Chase',
  ASSIGN: 'Assign',
  VIEW: 'View',
  REVIEW: 'Review',
  APPROVE: 'Review',
};
const IMPERATIVE_TAIL = /\s*(Chase now|Assign now|Review now|Act now)\.?\s*$/i;

const GENERIC_WORDS = new Set([
  'overdue', 'invoice', 'invoices', 'payment', 'payments', 'received', 'due', 'paid', 'unpaid',
  'vehicle', 'vehicles', 'truck', 'trucks', 'driver', 'drivers', 'idle', 'available', 'active', 'inactive',
  'load', 'loads', 'in', 'transit', 'delivered', 'delayed', 'late', 'on', 'the', 'road', 'of', 'to', 'for', 'and', 'at', 'is', 'are', 'a', 'an', 'by', 'with', 'from', 'now',
  'quote', 'quotes', 'accepted', 'declined', 'expired', 'sent', 'new', 'expense', 'expenses', 'approval', 'pending',
  'maintenance', 'service', 'licence', 'license', 'expiring', 'expires', 'soon', 'renewal', 'insurance',
  'margin', 'low', 'high', 'risk', 'alert', 'warning', 'reminder', 'days', 'day', 'customer', 'customers', 'cash',
  'fuel', 'price', 'up', 'down', 'increase', 'decrease', 'update', 'updated', 'created', 'assigned', 'unassigned',
  'booking', 'bookings', 'order', 'orders', 'status', 'changed', 'waiting', 'needs', 'attention', 'review',
]);

/** "Invoice Overdue: INV-1" becomes "Invoice overdue: INV-1". Only generic words are lowered; names and IDs stay. */
function sentenceCase(text: string): string {
  let seenWord = false;
  return text.replace(/[A-Za-z0-9][A-Za-z0-9'-]*/g, (w) => {
    const first = !seenWord;
    seenWord = true;
    if (first) return /^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    return /^[A-Z][a-z'-]+$/.test(w) && GENERIC_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w;
  });
}

/** en-ZA money and dd Mon yyyy dates in free text ("R 1,234.50" becomes "R 1 234,50"). */
function normaliseFigures(text: string): string {
  if (!text) return '';
  let out = text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, y: string, mo: string, d: string) => {
    const date = formatDate(`${y}-${mo}-${d}`);
    return date === '—' ? m : date;
  });
  out = out.replace(/\bR\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?![\d,])/g, (m, int: string, dec?: string) => {
    const n = Number(int.replace(/,/g, '') + (dec ?? ''));
    return Number.isFinite(n)
      ? formatCurrency(n, { maximumFractionDigits: dec ? 2 : 0, minimumFractionDigits: dec ? 2 : 0 })
      : m;
  });
  return out;
}

/** No em or en dashes in what people read: a spaced dash becomes a colon (titles) or comma (prose). */
const noDashes = (s: string, joiner: string) => s.replace(/\s*[—–]\s*/g, joiner);

export function presentSignal(s: HomeSignal, loads: Load[] = []): NeedsRow {
  const title = noDashes(s.title, ': ');
  const body = noDashes(s.body.replace(IMPERATIVE_TAIL, '').trim(), ', ');
  const actionLabel = ACTION_LABELS[s.action.toUpperCase()] ?? null;
  const target = targetFromUrl(s.actionUrl);
  const base = { actionLabel, target, severity: s.severity };

  // "Invoice Overdue: INV-…" / "<customer> owes R 20,505.65. Due 2026-06-05."
  const owes = /^(.+?)\s+owes\s+R\s?([\d,]+(?:\.\d+)?)\.?\s*(?:Due\s+(\d{4}-\d{2}-\d{2}))?/i.exec(body);
  if (owes?.[1] && owes[2]) {
    const amount = Number(owes[2].replace(/,/g, ''));
    const late = owes[3] ? saDaysBetween(owes[3]) : null;
    const when =
      late != null && late > 0 ? `${days(late)} late` : owes[3] ? `due ${formatDate(owes[3])}` : null;
    const invNo = /\b(INV-[\w-]+)/.exec(title)?.[1];
    return {
      ...base,
      kind: 'invoice',
      title: owes[1],
      amount: Number.isFinite(amount) ? wholeRand(amount) : normaliseFigures(`R ${owes[2]}`),
      detail: [when, invNo].filter(Boolean).join(' · ').replace(/^./, (c) => c.toUpperCase()),
    };
  }

  // "N Loads In Transit": the backend adds "All tracking normally", which it does
  // not check. Drop the claim and say how many are past their delivery date.
  if (isInTransitSignal(s)) {
    const moving = loads.filter((l) => String(l.status).toUpperCase() === 'IN_TRANSIT');
    const n = moving.length;
    const late = moving.filter((l) => (l.delivery_date ? (saDaysBetween(l.delivery_date) ?? 0) > 0 : false)).length;
    const detail =
      late > 0
        ? late === n
          ? n === 1
            ? 'Past the delivery date'
            : 'All past the delivery date'
          : `${late} of them past the delivery date`
        : normaliseFigures(body.replace(/\s*All tracking normally\.?/i, '').trim());
    return {
      ...base,
      kind: 'fleet',
      title: n > 0 ? `${plural(n, 'load')} in transit` : sentenceCase(normaliseFigures(title)),
      detail,
    };
  }

  if (isIdleVehiclesSignal(s)) {
    return {
      ...base,
      kind: 'fleet',
      title: sentenceCase(normaliseFigures(title)),
      detail: body && body !== title ? normaliseFigures(body) : '',
      actionLabel: 'View',
    };
  }

  const hint = `${s.category} ${title}`;
  return {
    ...base,
    kind: /fleet|vehicle|driver|truck/i.test(hint)
      ? 'fleet'
      : /invoice|payment|cash/i.test(hint)
        ? 'invoice'
        : 'other',
    title: sentenceCase(normaliseFigures(title)),
    detail: body && body !== title ? normaliseFigures(body) : '',
  };
}

// ── Computed rows ───────────────────────────────────────────────────────────
/** The load list also carries the assigned vehicle's id. */
type LoadWithVehicle = Load & { vehicle?: number | string | null };

const IDLE_TARGET: NeedsTarget = { kind: 'tab', tab: 'Fleet', params: { tab: 'vehicles' } };
const ORDERS_TARGET: NeedsTarget = { kind: 'tab', tab: 'Bookings', params: { tab: 'orders' } };

/**
 * Home's "N vehicles idle" row, from the same vehicles and loads the Fleet tab
 * uses, so Home never names a truck that Fleet shows on an order. The backend's
 * plate list is not passed through.
 *   idle     status Available or Active, and no current open load (a load left
 *            open is not current work, lib/staleWork.ts)
 *   free     idle trucks with no open load at all: the ones named
 *   holding  idle trucks still holding an order left open: counted, not named
 * Null when no truck is idle.
 */
export function idleRow(vehicles: Vehicle[], loads: Load[], today: Date = new Date()): NeedsRow | null {
  const byVehicle = new Map<number, Load[]>();
  for (const l of loads as LoadWithVehicle[]) {
    if (l.vehicle == null || !isOpenLoad(l)) continue;
    const k = Number(l.vehicle);
    byVehicle.set(k, [...(byVehicle.get(k) ?? []), l]);
  }
  const idle = vehicles.filter(
    (v) =>
      ['AVAILABLE', 'ACTIVE'].includes(String(v.status ?? '').toUpperCase()) &&
      !(byVehicle.get(Number(v.id)) ?? []).some((l) => !staleWork(l, today)),
  );
  if (idle.length === 0) return null;
  const plate = (v: Vehicle) => String(v.plate || [v.make, v.model].filter(Boolean).join(' ') || `Vehicle ${v.id}`);
  const free = idle.filter((v) => !byVehicle.has(Number(v.id)));
  const holding = idle.filter((v) => byVehicle.has(Number(v.id)));
  const named = free.slice(0, 2).map(plate);
  const more = free.length - named.length;
  const freeText = free.length === 0 ? '' : `${named.join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
  const detail =
    holding.length === 0
      ? freeText
      : free.length === 0
        ? holding.length === 1
          ? 'It holds an order left open'
          : 'All hold an order left open'
        : `${free.length} with no load · ${holding.length} ${holding.length === 1 ? 'holds' : 'hold'} an order left open`;
  return {
    kind: 'fleet',
    title: `${plural(idle.length, 'vehicle')} idle`,
    detail,
    actionLabel: 'View',
    target: IDLE_TARGET,
    severity: 'medium',
  };
}

const STATUS_WORDS: Record<string, string> = {
  IN_TRANSIT: 'in transit',
  LOADING: 'loading',
  ASSIGNED: 'assigned',
  PENDING: 'pending',
};

/**
 * Home's left-open row: the same loads Bookings and Fleet flag as stale
 * (lib/staleWork.ts), so the counts agree everywhere.
 * "11 loads left open" · "Oldest since 2 Jan 2026 (270 days)".
 */
export function staleRow(loads: Load[], today: Date = new Date()): NeedsRow | null {
  const stale = loads
    .map((l) => ({ l, s: staleWork(l, today) }))
    .filter((x): x is { l: Load; s: NonNullable<ReturnType<typeof staleWork>> } => x.s !== null)
    .sort((a, b) => b.s.days - a.s.days);
  const oldest = stale[0];
  if (!oldest) return null;
  const n = stale.length;
  const mix = new Map<string, number>();
  for (const x of stale) {
    const k = String(x.l.status).toUpperCase();
    mix.set(k, (mix.get(k) ?? 0) + 1);
  }
  const text = staleLabel(oldest.s).text;
  const statusMix = Object.keys(STATUS_WORDS)
    .filter((k) => mix.get(k))
    .map((k) => `${mix.get(k)} ${STATUS_WORDS[k]}`)
    .join(', ');
  return {
    kind: 'fleet',
    title: `${plural(n, 'load')} left open`,
    detail: n === 1 ? `Open ${text}` : `Oldest ${text}${statusMix ? ` · ${statusMix}` : ''}`,
    actionLabel: 'Review',
    target: ORDERS_TARGET,
    severity: 'medium',
  };
}

/**
 * The Needs you list, in the web's order: left-open loads first, then the
 * backend's signals. Fast Pay signals are hidden while Fast Pay is not live;
 * the backend's "loads in transit" signal is replaced by the left-open row when
 * there is one; its "vehicles idle" signal is replaced by `idle` (computed from
 * the full fleet) and dropped when no truck is idle, or kept as a bare count
 * (no plates) while the fleet has not loaded.
 */
export function buildNeeds(args: {
  signals: HomeSignal[];
  loads: Load[] | null;
  vehicles: Vehicle[] | null;
}): NeedsRow[] {
  const { signals, loads, vehicles } = args;
  const stale = loads ? staleRow(loads) : null;
  const rows: NeedsRow[] = stale ? [stale] : [];
  for (const s of signals) {
    if (!CAPITAL_LAUNCHED && isFastPaySignal(s)) continue;
    if (stale && isInTransitSignal(s)) continue;
    if (isIdleVehiclesSignal(s)) {
      if (loads && vehicles) {
        const idle = idleRow(vehicles, loads);
        if (idle) rows.push({ ...idle, severity: s.severity });
      } else {
        rows.push({ ...presentSignal(s, loads ?? []), detail: '', target: IDLE_TARGET });
      }
      continue;
    }
    rows.push(presentSignal(s, loads ?? []));
  }
  return rows;
}

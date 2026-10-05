import {
  MONTHS,
  expenseNet,
  inPeriod,
  isOpen,
  isPending,
  isRejected,
  monthLabel,
  monthsIn,
  num,
  priorPeriod,
  resolvePeriod,
  revenueByMonth,
  todayISO,
  ymOf,
  type CreditNoteRec,
  type Expense,
  type Invoice,
  type Load,
  type Payment,
  type Quote,
  type RevenueBasis,
  type Vehicle,
} from '@/lib/ledger';
import { isOpenLoad, staleWork } from '@/lib/staleWork';
import { bookedLoadOf, isBookedQuote, quoteStage } from '@/lib/quoteStage';

// Everything Home adds up, as pure functions of the full ledgers (lib/useLedger).
// Port of the web Overview's components/overview/ledger.ts and today.tsx /
// charts.tsx, on the shared rules in lib/ledger.ts, so Home, Insights and the
// Reports agree.

// ── Money ───────────────────────────────────────────────────────────────────
// Revenue and costs are excl. VAT, on the shared rules in lib/ledger.ts
// (revenueByMonth / expenseNet), which mirror the backend's accounting_reports:
//   revenue  accrual: issued invoices less credit notes; cash: money received,
//            each payment less its invoice's VAT share (an overpayment is not revenue)
//   costs    every expense that is not rejected (approved and pending), net of input VAT
export interface HomeMoney {
  /** Which revenue the figures are on: invoiced (accrual) or received (cash). */
  basis: RevenueBasis;
  /** Payments received in the last 12 months, incl. VAT, by payment date. */
  received: number;
  /** The 12 months before that; null when there were no payments in them. */
  receivedPrior: number | null;
  /** Revenue excl. VAT over the last 12 months, on `basis`. */
  revenueExcl: number;
  /** The 12 months before that; null when there was no revenue in them. */
  revenuePrior: number | null;
  /** Expenses dated in the last 12 months that are not rejected, excl. VAT. */
  costs: number;
  /** (revenueExcl - costs) / revenueExcl as a percentage; null with no revenue. */
  margin: number | null;
  marginPrior: number | null;
  /** The part of `costs` still awaiting approval (already deducted; for information). */
  pending: number;
  pendingCount: number;
  /** Open balances of issued, unpaid invoices, incl. VAT. */
  owed: number;
  /** The part of `owed` whose due date has passed. */
  pastDue: number;
  openInvoices: number;
  months: { ym: string; revenue: number; costs: number }[];
}

function receivedOf(payments: Payment[], range: { from: string; to: string }) {
  const paid = payments.filter((p) => inPeriod(p.payment_date, range));
  return { incl: paid.reduce((s, p) => s + num(p.amount), 0), count: paid.length };
}

function costsOf(expenses: Expense[], range: { from: string; to: string }) {
  const byMonth = new Map<string, number>();
  let total = 0;
  for (const e of expenses) {
    if (isRejected(e) || !inPeriod(e.expense_date, range)) continue;
    const a = expenseNet(e);
    total += a;
    const m = ymOf(e.expense_date);
    byMonth.set(m, (byMonth.get(m) ?? 0) + a);
  }
  return { total, byMonth };
}

/** Drops only the empty lead-in before the first entry and the empty tail after the last. */
function shownMonths(months: string[], hasEntry: (ym: string) => boolean): string[] {
  let first = -1;
  let last = -1;
  months.forEach((m, i) => {
    if (hasEntry(m)) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return last < 0 ? months : months.slice(first, last + 1);
}

export function computeHomeMoney(
  src: {
    invoices: Invoice[];
    payments: Payment[];
    expenses: Expense[];
    creditNotes?: CreditNoteRec[];
  },
  basis: RevenueBasis = 'cash',
): HomeMoney {
  const period = resolvePeriod('last-12');
  const prior = priorPeriod(period);
  const now = revenueByMonth(src, basis, period);
  const before = revenueByMonth(src, basis, prior);
  const got = receivedOf(src.payments, period);
  const gotBefore = receivedOf(src.payments, prior);
  const costs = costsOf(src.expenses, period);
  const costsPrior = costsOf(src.expenses, prior);
  const margin = now.excl > 0.005 ? ((now.excl - costs.total) / now.excl) * 100 : null;
  const marginPrior =
    before.excl > 0.005 ? ((before.excl - costsPrior.total) / before.excl) * 100 : null;

  let pending = 0;
  let pendingCount = 0;
  for (const e of src.expenses) {
    if (isPending(e) && inPeriod(e.expense_date, period)) {
      pending += expenseNet(e);
      pendingCount += 1;
    }
  }

  const today = todayISO();
  const open = src.invoices.filter(isOpen);
  const owed = open.reduce((s, i) => s + num(i.balance), 0);
  const pastDue = open
    .filter((i) => !!i.due_date && i.due_date.slice(0, 10) < today)
    .reduce((s, i) => s + num(i.balance), 0);

  const all = monthsIn(period.from, period.to);
  const shown = shownMonths(all, (m) => now.byMonth.has(m) || costs.byMonth.has(m));
  return {
    basis,
    received: got.incl,
    receivedPrior: gotBefore.count > 0 ? gotBefore.incl : null,
    revenueExcl: now.excl,
    revenuePrior: before.entries.length > 0 ? before.excl : null,
    costs: costs.total,
    margin,
    marginPrior,
    pending,
    pendingCount,
    owed,
    pastDue,
    openInvoices: open.length,
    months: shown.map((ym) => ({
      ym,
      revenue: now.byMonth.get(ym) ?? 0,
      costs: costs.byMonth.get(ym) ?? 0,
    })),
  };
}

/** "Jan 2026" style span of the months the chart shows. */
export function monthsSpanText(months: { ym: string }[]): string {
  const a = months[0];
  const b = months[months.length - 1];
  if (!a || !b) return '';
  return a.ym === b.ym ? monthLabel(a.ym) : `${monthLabel(a.ym)} to ${monthLabel(b.ym)}`;
}

/** Short month name for a chart tick. */
export const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

// ── Loads ───────────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;

export interface LoadsSummary {
  /** Open (Pending, Assigned, Loading, In transit) and not stale. */
  active: number;
  /** Open loads past their delivery date or open more than 30 days: "left open". */
  notClosed: number;
  /** 28 intensity levels (0 to 3), oldest first, for the utilisation grid. */
  heat: number[];
  /** Loads created in the last 28 days. */
  booked28: number;
}

export function summariseLoads(loads: Load[], today: Date = new Date()): LoadsSummary {
  const open = loads.filter((l) => isOpenLoad(l));
  const notClosed = open.filter((l) => staleWork(l, today)).length;

  const counts = new Array<number>(28).fill(0);
  const nowMs = today.getTime();
  for (const l of loads) {
    const at = l.created_at || l.pickup_date;
    if (!at) continue;
    const t = new Date(at).getTime();
    if (Number.isNaN(t)) continue;
    const daysAgo = Math.floor((nowMs - t) / DAY_MS);
    if (daysAgo >= 0 && daysAgo < 28) counts[27 - daysAgo] = (counts[27 - daysAgo] ?? 0) + 1;
  }
  const max = Math.max(1, ...counts);
  return {
    active: open.length - notClosed,
    notClosed,
    heat: counts.map((c) => (c === 0 ? 0 : Math.min(3, Math.ceil((c / max) * 3)))),
    booked28: counts.reduce((a, b) => a + b, 0),
  };
}

// ── Fleet ───────────────────────────────────────────────────────────────────
export interface FleetSummary {
  total: number;
  /** Available, in use or active (the web Home's "active vehicles"). */
  active: number;
  /** Status Available only. */
  available: number;
}

export function summariseFleet(vehicles: Vehicle[]): FleetSummary {
  const st = (v: Vehicle) => String(v.status ?? '').toUpperCase();
  return {
    total: vehicles.length,
    active: vehicles.filter((v) => ['AVAILABLE', 'IN_USE', 'ACTIVE'].includes(st(v))).length,
    available: vehicles.filter((v) => st(v) === 'AVAILABLE').length,
  };
}

// ── Quote funnel ────────────────────────────────────────────────────────────
// Quote statuses that mean the quote went out to the customer.
const WENT_OUT = new Set(['SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'IT', 'COMPLETED']);
// Load statuses once a booked job is moving or done.
const LOAD_MOVING = new Set(['IN_TRANSIT', 'DELIVERED', 'INVOICED']);

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Small second line under the label. */
  sub?: string;
  /** Said under the row, e.g. loads left open. */
  note?: string;
}

export interface QuoteFunnel {
  stages: FunnelStage[];
  /** Live Sent quotes still waiting for a reply (not lapsed). */
  awaiting: number;
  /** Live Draft quotes (not lapsed). */
  drafts: number;
  declined: number;
  /** Draft or Sent quotes past their valid-until date, plus quotes marked Expired. */
  expired: number;
  /** Quotes that went out, and how many of them were accepted. */
  sentEver: number;
  accepted: number;
  /** Accepted as a whole percentage of every quote that went out; null with none sent. */
  winRate: number | null;
}

/**
 * Where quotes stand now, in the web's order (charts.tsx QuoteConversion +
 * today.tsx usePipeline), on the shared stage rule (lib/quoteStage.ts) so an
 * expired quote is never a live Draft or Sent:
 *   Draft        live drafts
 *   Sent         live Sent quotes still waiting for a reply
 *   Accepted     accepted or booked
 *   Booked       converted into a load (booked_load / converted, or legacy IT/COMPLETED)
 *   On the road  the booked load is In transit, Delivered or Invoiced; In-transit
 *                loads past their delivery date or open > 30 days are left out
 *                (lib/staleWork.ts) and said in the note
 *   Declined     a Sent quote marked lost, or Declined
 *   Expired      only listed when there is one; never counted as live work
 * Win rate is accepted over every quote that went out.
 */
export function computeFunnel(quotes: Quote[], loads: Load[], now: Date = new Date()): QuoteFunnel {
  const loadById = new Map(loads.map((l) => [String(l.id), l]));
  let sent = 0;
  let accepted = 0;
  let booked = 0;
  let onRoad = 0;
  let staleInTransit = 0;
  let awaiting = 0;
  let drafts = 0;
  let declined = 0;
  let expired = 0;

  for (const q of quotes) {
    const raw = q as unknown as Record<string, unknown>;
    const stage = quoteStage(raw, now);
    const st = String(q.status ?? '').toUpperCase();
    const legacyMoving = st === 'IT' || st === 'COMPLETED';
    const isBooked = isBookedQuote(raw) || legacyMoving;
    const bl = bookedLoadOf(raw);
    const loadSt = String(bl?.status ?? '').toUpperCase();

    if (isBooked || WENT_OUT.has(st)) sent += 1;
    if (isBooked || stage === 'ACCEPTED') accepted += 1;
    if (isBooked) booked += 1;

    if (LOAD_MOVING.has(loadSt) || legacyMoving) {
      const full = bl ? loadById.get(String(bl.id)) : undefined;
      if (loadSt === 'IN_TRANSIT' && full && staleWork(full, now)) staleInTransit += 1;
      else onRoad += 1;
    }

    if (!isBooked) {
      if (stage === 'SENT') awaiting += 1;
      else if (stage === 'DRAFT') drafts += 1;
      else if (stage === 'DECLINED') declined += 1;
      else if (stage === 'EXPIRED') expired += 1;
    }
  }

  return {
    stages: [
      { key: 'draft', label: 'Draft', count: drafts },
      { key: 'sent', label: 'Sent', count: awaiting },
      { key: 'accepted', label: 'Accepted', count: accepted },
      { key: 'booked', label: 'Booked', count: booked },
      {
        key: 'road',
        label: 'On the road',
        sub: 'In transit or delivered',
        count: onRoad,
        note:
          staleInTransit > 0
            ? `${staleInTransit} in transit past ${staleInTransit === 1 ? 'its' : 'their'} delivery date, left open`
            : undefined,
      },
      { key: 'declined', label: 'Declined', count: declined },
      ...(expired > 0 ? [{ key: 'expired', label: 'Expired', count: expired }] : []),
    ],
    awaiting,
    drafts,
    declined,
    expired,
    sentEver: sent,
    accepted,
    winRate: sent > 0 ? Math.round((accepted / sent) * 100) : null,
  };
}

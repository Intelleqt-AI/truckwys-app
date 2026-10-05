// Series for the Insights charts, worked out on the device from the ledgers the
// tabs already load (no new requests). Port of the web's
// components/insights/insight-series.ts and lib/revenuePerKm.ts.
//
// Days are whole South African calendar days (lib/dates), as everywhere else in
// the app; the web counts in the browser's zone.

import type { LanePoint, OwedRow, PayRow } from '@/components/viz/types';
import { saDateISO, saDaysBetween } from '@/lib/dates';
import {
  AGE_BUCKETS,
  DELIVERED,
  ageBucket,
  isOpen,
  isPaid,
  num,
  todayISO,
  type Invoice,
  type Load,
} from '@/lib/ledger';

const up = (s?: string | null) => (s || '').toUpperCase();
const days = (a: string, b: string) => saDaysBetween(a, b) ?? 0;

// ── getting paid ────────────────────────────────────────────────────────────
// Two views of the same invoices: what is owed now (open and past due, for
// chasing) and how each customer has paid (settled in the last 12 months, for
// the habit). The two never mix, so "days late" always means one thing.

const custKey = (i: Invoice) => (i.customer != null ? `c${i.customer}` : `n${i.customer_name}`);

interface PaidInvoice {
  inv: Invoice;
  /** Days from issue to payment. */
  toPay: number;
  /** Days after the due date (negative: early); null without a due date. */
  late: number | null;
  /** Days between issue and due date, or null. */
  terms: number | null;
}

/** Invoices paid in full with a recorded payment date, paid in the last 12 months. */
function paidInvoices(invoices: Invoice[]): PaidInvoice[] {
  const { from } = lastTwelveMonths();
  return invoices.flatMap((inv) => {
    if (!isPaid(inv) || !inv.paid_at || !inv.issue_date) return [];
    const paidOn = saDateISO(inv.paid_at);
    if (!paidOn || paidOn < from) return [];
    return [
      {
        inv,
        toPay: Math.max(0, days(inv.issue_date, paidOn)),
        late: inv.due_date ? days(inv.due_date, paidOn) : null,
        terms: inv.due_date ? Math.max(0, days(inv.issue_date, inv.due_date)) : null,
      },
    ];
  });
}

/** The value at half the total weight, walking the values in order. */
function weightedMedian(items: { v: number; w: number }[]): number {
  const sorted = [...items].sort((a, b) => a.v - b.v);
  const half = sorted.reduce((s, x) => s + x.w, 0) / 2;
  let run = 0;
  for (const x of sorted) {
    run += x.w;
    if (run >= half) return x.v;
  }
  return 0;
}

/**
 * One row per customer: how late (or early) each paid invoice was against its
 * own due date. Customers with a late habit first; ties by name.
 */
export function habitRows(invoices: Invoice[]): PayRow[] {
  const by = new Map<string, PayRow>();
  for (const { inv, late } of paidInvoices(invoices)) {
    if (late == null) continue;
    const key = custKey(inv);
    const row = by.get(key) ?? { id: key, label: inv.customer_name, median: 0, thin: true, marks: [] };
    row.marks.push({
      id: String(inv.id),
      ref: inv.invoice_number || `Invoice ${inv.id}`,
      late,
      amount: num(inv.total_amount),
    });
    by.set(key, row);
  }
  const rows = [...by.values()].map((r) => ({
    ...r,
    thin: r.marks.length < 3,
    // A zero-rand invoice still counts once, so a row is never all zero weight.
    median: weightedMedian(r.marks.map((m) => ({ v: m.late, w: Math.max(m.amount, 1) }))),
  }));
  rows.sort((a, b) => b.median - a.median || a.label.localeCompare(b.label));
  return rows;
}

/**
 * Customers with overdue open invoices, biggest overdue balance first. Overdue
 * is the same as Finance > Debtors age: issued, balance owing, past its due date.
 */
export function owedRows(invoices: Invoice[]): OwedRow[] {
  const today = todayISO();
  const by = new Map<string, OwedRow>();
  for (const inv of invoices) {
    if (!isOpen(inv) || !inv.due_date) continue;
    const late = days(inv.due_date, today);
    if (late <= 0) continue;
    const key = custKey(inv);
    const row = by.get(key) ?? {
      id: key,
      label: inv.customer_name,
      customerId: inv.customer,
      overdue: 0,
      buckets: AGE_BUCKETS.map(() => 0),
      oldest: 0,
      invoices: [],
    };
    const balance = num(inv.balance);
    row.overdue += balance;
    row.buckets[ageBucket(late)]! += balance;
    row.oldest = Math.max(row.oldest, late);
    row.invoices.push({
      id: inv.id,
      ref: inv.invoice_number || `Invoice ${inv.id}`,
      balance,
      daysLate: late,
      remindedAgo: inv.last_reminder_at ? Math.max(0, days(inv.last_reminder_at, today)) : null,
    });
    by.set(key, row);
  }
  const rows = [...by.values()];
  rows.forEach((r) => r.invoices.sort((a, b) => b.daysLate - a.daysLate));
  rows.sort((a, b) => b.overdue - a.overdue || a.label.localeCompare(b.label));
  return rows;
}

export interface PaidSummary {
  /** Median days from issue to payment, last 12 months; null with nothing paid. */
  medianDays: number | null;
  /** The most common terms (due date less issue date) on those invoices. */
  usualTerms: number | null;
  /** Share of invoices paid on or before the due date, 0 to 100; null with none to judge. */
  onTimePct: number | null;
  onTime: number;
  /** Paid invoices with a due date: the base for `onTimePct`. */
  judged: number;
  overdueBalance: number;
  overdueInvoices: number;
  overdueCustomers: number;
  /** Balance more than 90 days past due. */
  over90: number;
}

export function paidSummary(invoices: Invoice[]): PaidSummary {
  const paid = paidInvoices(invoices);
  const judged = paid.filter((p) => p.late != null);
  const onTime = judged.filter((p) => (p.late as number) <= 0).length;

  const counts = new Map<number, number>();
  paid.forEach((p) => p.terms != null && counts.set(p.terms, (counts.get(p.terms) ?? 0) + 1));
  const usualTerms = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;

  const owed = owedRows(invoices);
  return {
    medianDays: paid.length ? weightedMedian(paid.map((p) => ({ v: p.toPay, w: 1 }))) : null,
    usualTerms,
    onTimePct: judged.length ? (onTime / judged.length) * 100 : null,
    onTime,
    judged: judged.length,
    overdueBalance: owed.reduce((s, r) => s + r.overdue, 0),
    overdueInvoices: owed.reduce((s, r) => s + r.invoices.length, 0),
    overdueCustomers: owed.length,
    over90: owed.reduce((s, r) => s + (r.buckets[4] ?? 0), 0),
  };
}

// ── revenue per km ──────────────────────────────────────────────────────────
// One basis for the whole app: delivered work (delivered, invoiced, completed,
// paid) with a recorded distance, dated by delivery date (else pickup, else
// creation), over the last 12 months (this month and the 11 before it). Loads
// without a distance are left out of both the rand and the km.

export interface PerKmPeriod {
  /** First day, YYYY-MM-DD. */
  from: string;
  /** Last day (today), YYYY-MM-DD. */
  to: string;
  label: string;
}

export function lastTwelveMonths(): PerKmPeriod {
  const to = todayISO();
  const y = Number(to.slice(0, 4));
  const m = Number(to.slice(5, 7)) - 1 - 11; // may be negative: Date normalises it
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { from, to, label: 'last 12 months' };
}

const km = (l: Pick<Load, 'distance'>) => {
  const x = parseFloat(String(l.distance ?? ''));
  return Number.isFinite(x) ? x : 0;
};

/** Delivered loads with a distance, dated inside the period: the rows every per-km figure is built from. */
export function perKmLoads(loads: Load[], period: PerKmPeriod = lastTwelveMonths()): Load[] {
  return loads.filter((l) => {
    if (!DELIVERED.has(up(l.status)) || km(l) <= 0) return false;
    const iso = (l.delivery_date || l.pickup_date || l.created_at || '').slice(0, 10);
    return !!iso && iso >= period.from && iso <= period.to;
  });
}

/** The fleet's revenue per km over the period; null when there is no distance. */
export function fleetRevenuePerKm(loads: Load[], period: PerKmPeriod = lastTwelveMonths()): number | null {
  const rows = perKmLoads(loads, period);
  const distance = rows.reduce((s, l) => s + km(l), 0);
  const revenue = rows.reduce((s, l) => s + num(l.total_amount), 0);
  return distance > 0 ? revenue / distance : null;
}

/**
 * Lanes with a recorded distance: revenue per km against km per trip.
 * `noDistance` counts lanes that had loads but nothing to draw.
 */
export function lanePoints(loads: Load[], minTrips: number): { points: LanePoint[]; noDistance: number } {
  const by = new Map<string, { trips: number; rev: number; km: number }>();
  const seen = new Set<string>();
  for (const l of loads) {
    if (!l.pickup_city || !l.delivery_city) continue;
    const key = `${l.pickup_city} to ${l.delivery_city}`;
    seen.add(key);
    const d = km(l);
    if (d <= 0) continue;
    const e = by.get(key) ?? { trips: 0, rev: 0, km: 0 };
    by.set(key, { trips: e.trips + 1, rev: e.rev + num(l.total_amount), km: e.km + d });
  }
  const points: LanePoint[] = [...by.entries()]
    .filter(([, d]) => d.rev > 0)
    .map(([label, d]) => ({
      id: label,
      label,
      trips: d.trips,
      revenue: d.rev,
      kmPerTrip: d.km / d.trips,
      perKm: d.rev / d.km,
      thin: d.trips < minTrips,
    }));
  return { points, noDistance: seen.size - points.length };
}

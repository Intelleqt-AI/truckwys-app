import { formatDate } from './formatters';
import { addMonthsYM, saDateISO, saDaysBetween } from './dates';

// The ledger rules: what counts as issued, owed, paid, delivered or approved,
// and how periods are cut. One definition shared by Home, Insights and anything
// else that adds up money, so their figures cannot disagree. Port of the web
// app's components/reports/data.ts (the pure parts). Lists are loaded in full by
// lib/useLedger.ts, so totals reconcile to the ledgers.

// ── types ───────────────────────────────────────────────────────────────────
export interface Invoice {
  id: number;
  invoice_number: string;
  customer: number | null;
  customer_name: string;
  status: string;
  issue_date: string;
  due_date: string;
  created_at: string;
  subtotal: string | number;
  vat_amount: string | number;
  total_amount: string | number;
  paid_amount: string | number;
  balance: string | number;
  paid_at: string | null;
  load: number | null;
  sent_at?: string | null;
  last_reminder_at?: string | null;
  reminder_count?: number | null;
}
export interface Payment {
  id: number;
  payment_number: string;
  invoice: number | null;
  invoice_number?: string;
  customer: number | null;
  customer_name?: string;
  amount: string | number;
  payment_date: string;
  payment_method?: string;
  reference_number?: string;
}
export interface Expense {
  id: number;
  expense_number?: string;
  category: string;
  description?: string;
  amount: string | number;
  expense_date: string;
  status: string;
  vehicle: number | null;
  vendor?: string;
  created_at: string;
}
export interface Load {
  id: number;
  load_number: string;
  customer: number | null;
  customer_name: string;
  status: string;
  total_amount: string | number;
  delivery_date: string | null;
  pickup_date?: string | null;
  created_at?: string | null;
  distance?: string | number | null;
  pickup_city?: string;
  delivery_city?: string;
  pickup_location?: string;
  delivery_location?: string;
  pod_document?: string | null;
  pod_signature?: string | null;
  pod_received_by?: string | null;
  quote?: number | null;
}
export interface Quote {
  id: number;
  quote_number: string;
  customer_name?: string;
  status: string;
  total_amount: string | number;
  fuel_surcharge?: string | number | null;
  fuel_price_at_creation?: string | number | null;
  valid_until: string | null;
  outcome?: string | null;
  created_at?: string | null;
  pickup_location?: string;
  delivery_location?: string;
  distance?: string | number | null;
  vehicle_type?: string;
  booked_load?: { id: number | string; load_number?: string; status?: string } | null;
  converted?: boolean;
}
export interface Customer {
  id: number;
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
}
export interface Vehicle {
  id: number;
  plate: string;
  make?: string;
  model?: string;
  status?: string;
}

// ── numbers ─────────────────────────────────────────────────────────────────
export const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── dates ───────────────────────────────────────────────────────────────────
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Today's calendar date in South African time (YYYY-MM-DD), whatever the phone's zone. */
export const todayISO = () => saDateISO(new Date()) ?? '';
/** YYYY-MM of an ISO date or timestamp, '' when there is none. */
export const ymOf = (iso?: string | null) => (iso ? iso.slice(0, 7) : '');
export const ymNow = () => todayISO().slice(0, 7);
export const addMonths = addMonthsYM;
export const monthsIn = (from: string, to: string) => {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 60; m = addMonths(m, 1)) out.push(m);
  return out;
};
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const monthEnd = (ym: string) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0);
  return `${ym}-${String(d.getDate()).padStart(2, '0')}`;
};
/** "15 Jun 2026" */
export const day = (iso?: string | null) => (iso ? formatDate(iso.slice(0, 10)) : '');
/** Whole South African calendar days from a to b (b later is positive). */
export const daysBetween = (a: string, b: string) => saDaysBetween(a.slice(0, 10), b.slice(0, 10)) ?? 0;

// ── periods ─────────────────────────────────────────────────────────────────
export type PeriodId = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'last-12' | 'ytd';
export interface Period {
  id: PeriodId;
  from: string;
  to: string;
}
export function resolvePeriod(id: PeriodId): Period {
  const now = ymNow();
  switch (id) {
    case 'this-month':
      return { id, from: now, to: now };
    case 'last-month': {
      const m = addMonths(now, -1);
      return { id, from: m, to: m };
    }
    case 'last-3':
      return { id, from: addMonths(now, -2), to: now };
    case 'last-6':
      return { id, from: addMonths(now, -5), to: now };
    case 'ytd':
      return { id, from: `${now.slice(0, 4)}-01`, to: now };
    default:
      return { id: 'last-12', from: addMonths(now, -11), to: now };
  }
}
/** The same number of months immediately before. */
export const priorPeriod = (p: { from: string; to: string }) => {
  const n = monthsIn(p.from, p.to).length;
  return { from: addMonths(p.from, -n), to: addMonths(p.from, -1) };
};
export const periodText = (p: { from: string; to: string }) =>
  p.from === p.to ? monthLabel(p.from) : `${monthLabel(p.from)} to ${monthLabel(p.to)}`;
export const inPeriod = (iso: string | null | undefined, p: { from: string; to: string }) => {
  const m = ymOf(iso);
  return !!m && m >= p.from && m <= p.to;
};

// ── ledger rules ────────────────────────────────────────────────────────────
const NOT_ISSUED = new Set(['DRAFT', 'CANCELLED', 'CANCELED', 'VOID']);
const st = (s?: string) => (s || '').toUpperCase();
/** Issued to the customer: not a draft, not cancelled. */
export const isIssued = (i: Pick<Invoice, 'status'>) => !NOT_ISSUED.has(st(i.status));
export const isDraft = (i: Pick<Invoice, 'status'>) => st(i.status) === 'DRAFT';
/** Owed today: issued, not fully paid, balance above zero. */
export const isOpen = (i: Pick<Invoice, 'status' | 'balance'>) =>
  isIssued(i) && st(i.status) !== 'PAID' && num(i.balance) > 0.005;
/** Load statuses that count as delivered work. */
export const DELIVERED = new Set(['DELIVERED', 'INVOICED', 'COMPLETED', 'PAID']);
export const isApproved = (e: Pick<Expense, 'status'>) => st(e.status) === 'APPROVED';
export const isPending = (e: Pick<Expense, 'status'>) => st(e.status) === 'PENDING';
/** Paid in full: the Invoices "Paid" filter (status Paid). */
export const isPaid = (i: Pick<Invoice, 'status'>) => st(i.status) === 'PAID';

export interface PaidTiming {
  /** Invoices paid in full (status Paid). */
  count: number;
  /** How many of them have both an issue date and a paid date. */
  timed: number;
  /** Average days from issue date to paid date over `timed`; null when none. */
  avgDays: number | null;
}

/**
 * THE "time to get paid" definition: paid = status Paid; days = issue date to
 * paid date (never below 0), averaged over the paid invoices that have both.
 */
export function paidInvoiceTiming(
  invoices: Pick<Invoice, 'status' | 'issue_date' | 'paid_at'>[],
): PaidTiming {
  const paid = invoices.filter(isPaid);
  const days = paid.flatMap((i) => {
    const paidOn = (i.paid_at || '').slice(0, 10);
    if (!i.issue_date || !paidOn) return [];
    return [Math.max(0, daysBetween(i.issue_date, paidOn))];
  });
  return {
    count: paid.length,
    timed: days.length,
    avgDays: days.length ? days.reduce((s, v) => s + v, 0) / days.length : null,
  };
}

/** Share of an invoice's total that is VAT (from the invoice itself, not a rate field). */
export const vatShare = (i?: Pick<Invoice, 'total_amount' | 'vat_amount'>) => {
  if (!i) return 0;
  const t = num(i.total_amount);
  return t > 0 ? num(i.vat_amount) / t : 0;
};

export const CATEGORY_LABEL: Record<string, string> = {
  FUEL: 'Fuel',
  TOLLS: 'Tolls',
  DRIVER: 'Driver costs',
  DRIVER_COST: 'Driver costs',
  MAINTENANCE: 'Maintenance and repairs',
  INSURANCE: 'Insurance',
  OVERHEAD: 'Overheads and admin',
};
export const catLabel = (c: string) =>
  CATEGORY_LABEL[st(c)] ??
  (c ? c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ') : 'Uncategorised');
/** Transport P&L: costs that move with the work vs fixed running costs. */
export const DIRECT = ['FUEL', 'TOLLS', 'DRIVER', 'DRIVER_COST', 'MAINTENANCE'];
export const OVERHEADS = ['INSURANCE', 'OVERHEAD'];

// ── lanes ───────────────────────────────────────────────────────────────────
const CITY_ALIAS: Record<string, string> = {
  JHB: 'Johannesburg',
  JOBURG: 'Johannesburg',
  CPT: 'Cape Town',
  DBN: 'Durban',
  PE: 'Port Elizabeth',
  GQEBERHA: 'Port Elizabeth',
  PTA: 'Pretoria',
  BFN: 'Bloemfontein',
  EL: 'East London',
  PMB: 'Pietermaritzburg',
};
const cleanCity = (city?: string, location?: string) => {
  const pickName = (s?: string) => {
    const t = (s || '').trim();
    if (!t || /^tbd$/i.test(t) || /^tba$/i.test(t)) return '';
    const alias = CITY_ALIAS[t.toUpperCase()];
    if (alias) return alias;
    return t.replace(/\s+(Depot|Warehouse|Harbour|CBD|Port)$/i, '').trim();
  };
  return pickName(city) || pickName(location);
};
/** "Johannesburg to Durban", or '' when either end is unknown. */
export const laneOf = (l: Pick<Load, 'pickup_city' | 'pickup_location' | 'delivery_city' | 'delivery_location'>) => {
  const a = cleanCity(l.pickup_city, l.pickup_location);
  const b = cleanCity(l.delivery_city, l.delivery_location);
  return a && b ? `${a} to ${b}` : '';
};

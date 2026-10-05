import { formatCurrency, formatDate, formatNumber, formatPercent } from './formatters';
import { addMonthsYM, saDateISO, saDaysBetween } from './dates';
import type { CustomerPrice } from './vat';

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
  /** Gross: what was paid, VAT included. */
  amount: string | number;
  expense_date: string;
  status: string;
  vehicle: number | null;
  vendor?: string;
  created_at: string;
  /** Input VAT inside `amount`; absent on old records (then 0). */
  vat_amount?: string | number | null;
  supplier_name?: string | null;
  tax_code?: string;
}
/** A credit note, for revenue: ISSUED ones reduce what was invoiced. */
export interface CreditNoteRec {
  id: number;
  credit_note_number: string;
  invoice: number;
  invoice_number: string;
  customer: number | null;
  customer_name: string;
  issue_date: string;
  status: string;
  subtotal: string | number;
  vat_amount: string | number;
  total_amount: string | number;
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
  /** Price excl. VAT, VAT and total incl. VAT as the customer is shown them. */
  customer_price?: CustomerPrice | null;
  is_international?: boolean;
  /** The truck on the order (null until one is assigned). */
  vehicle?: number | null;
  driver_name?: string | null;
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
  /** Price excl. VAT, VAT and total incl. VAT as the customer is shown them. */
  customer_price?: CustomerPrice | null;
  is_international?: boolean;
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
  /** All-time revenue recorded on the truck's profile (Insights > Fleet). */
  revenue_generated?: string | number | null;
}

// ── numbers ─────────────────────────────────────────────────────────────────
export const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── statement money ─────────────────────────────────────────────────────────
/** "R 1 234,56"; negatives in brackets, as on a statement: "(R 1 234,56)". */
export const money = (v: number) => {
  const r = round2(v);
  if (r === 0) return formatCurrency(0);
  return r < 0 ? `(${formatCurrency(-r)})` : formatCurrency(r);
};
/** No currency sign (the table says "in rand"), optionally whole rands; negatives in brackets. */
export const moneyBare = (v: number, whole = false) => {
  const r = whole ? Math.round(v) : round2(v);
  const body = formatCurrency(Math.abs(r), whole ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {})
    .replace(/^R\s?/, '')
    .replace(/[\s ]/g, ' ');
  return r < 0 ? `(${body})` : body;
};
/** Whole rand for tiles: "R 182 053", negatives "−R 4 200". */
export const moneyWhole = (v: number) =>
  formatCurrency(Math.round(v), { maximumFractionDigits: 0, minimumFractionDigits: 0 });
export const int = (v: number) => formatNumber(Math.round(v));
/** "14,1%"; '' when there is no value. */
export const pct = (v: number | null, dp = 1) => (v == null || !Number.isFinite(v) ? '' : formatPercent(v, dp));

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

/** Months to show as columns or rows: the period from its first to its last
 *  month with any entry. Empty months inside that range stay (a real zero);
 *  only the empty lead-in and tail are dropped. With no entries the whole
 *  period is kept. Display only: totals are over the full period. */
export const shownMonths = (months: string[], hasEntry: (ym: string) => boolean) => {
  let first = -1;
  let last = -1;
  months.forEach((m, i) => {
    if (hasEntry(m)) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return last < 0 ? months : months.slice(first, last + 1);
};
/** "Oct to Nov 2025", "Dec 2025 to Feb 2026", "Jun 2026". */
const monthSpan = (list: string[]) => {
  const a = list[0]!;
  const b = list[list.length - 1]!;
  if (a === b) return monthLabel(a);
  return a.slice(0, 4) === b.slice(0, 4)
    ? `${MONTHS[Number(a.slice(5, 7)) - 1]} to ${monthLabel(b)}`
    : `${monthLabel(a)} to ${monthLabel(b)}`;
};
/** Why some months of the period are not shown, or null. */
export const trimNote = (all: string[], shown: string[]) => {
  if (!shown.length || shown.length >= all.length) return null;
  const firstShown = shown[0]!;
  const lastShown = shown[shown.length - 1]!;
  const lead = all.slice(0, all.indexOf(firstShown));
  const tail = all.slice(all.indexOf(lastShown) + 1);
  const verb = (list: string[]) => (list.length === 1 ? 'is' : 'are');
  if (lead.length && tail.length) {
    return `Only ${monthSpan(shown)} ${shown.length === 1 ? 'has' : 'have'} entries, so ${monthSpan(lead)} and ${monthSpan(tail)} are not shown.`;
  }
  if (lead.length) return `No entries before ${monthLabel(firstShown)}, so ${monthSpan(lead)} ${verb(lead)} not shown.`;
  return `No entries after ${monthLabel(lastShown)}, so ${monthSpan(tail)} ${verb(tail)} not shown.`;
};

// ── periods ─────────────────────────────────────────────────────────────────
export type PeriodId = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'last-12' | 'ytd' | 'custom';
export interface Period {
  id: PeriodId;
  from: string;
  to: string;
}
export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-3', label: '3 months' },
  { id: 'last-6', label: '6 months' },
  { id: 'last-12', label: '12 months' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'custom', label: 'Custom' },
];
export function resolvePeriod(id: PeriodId, customFrom?: string | null, customTo?: string | null): Period {
  const now = ymNow();
  switch (id) {
    case 'custom': {
      const ok = (s?: string | null) => !!s && /^\d{4}-\d{2}$/.test(s);
      if (ok(customFrom) && ok(customTo)) {
        const [a, b] = customFrom! <= customTo! ? [customFrom!, customTo!] : [customTo!, customFrom!];
        return { id, from: a, to: monthsIn(a, b).length >= 36 ? addMonths(a, 35) : b };
      }
      return { id: 'last-12', from: addMonths(now, -11), to: now };
    }
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

/** The ageing columns, by days past the due date (Debtors age and Insights). */
export const AGE_BUCKETS = ['Current', '1 to 30 days', '31 to 60 days', '61 to 90 days', 'Over 90 days'] as const;
/** Index into `AGE_BUCKETS` for an invoice this many days past its due date. */
export const ageBucket = (daysOverdue: number) =>
  daysOverdue <= 0 ? 0 : daysOverdue <= 30 ? 1 : daysOverdue <= 60 ? 2 : daysOverdue <= 90 ? 3 : 4;

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

// ── revenue (one definition) ────────────────────────────────────────────────
//
// Mirrors the backend's accounting_reports (docs/foundation/REPORTS.md) and the
// web's reports/data.ts, so every figure here says the same revenue as the web:
//   accrual: issued invoices (not draft, not void) by issue date, total - VAT,
//            minus ISSUED credit-note subtotals on the credit note's own date;
//   cash:    each payment's ex-VAT share of its invoice, by payment date;
//            the part of a payment above the invoice total is not revenue.
// Expenses: net of their input VAT (amount - vat_amount).

export type RevenueBasis = 'accrual' | 'cash';
export const BASIS_LABEL: Record<RevenueBasis, string> = { accrual: 'Invoiced', cash: 'Received' };
/** "excl. VAT, accrual (invoiced)" for sub-lines. */
export const basisText = (b: RevenueBasis) =>
  `excl. VAT, ${b === 'accrual' ? 'accrual (invoiced)' : 'cash (received)'}`;

export const isCreditIssued = (c: Pick<CreditNoteRec, 'status'>) => st(c.status) === 'ISSUED';

export interface RevenueEntry {
  kind: 'invoice' | 'credit' | 'payment';
  date: string;
  ref: string;
  customer: number | null;
  party: string;
  /** Signed: credit notes are negative. */
  excl: number;
  vat: number;
  incl: number;
  /** Cash basis: the part of the payment above what the invoice was worth (not revenue). */
  over?: number;
}

export interface RevenueSource {
  invoices: Invoice[];
  payments: Payment[];
  creditNotes?: CreditNoteRec[];
}

/** Revenue entries in a range, on one basis. Sum `excl` for revenue excl. VAT. */
export function revenueEntries(
  d: RevenueSource,
  basis: RevenueBasis,
  r: { from: string; to: string },
): RevenueEntry[] {
  if (basis === 'accrual') {
    const inv = d.invoices
      .filter((i) => isIssued(i) && inPeriod(i.issue_date, r))
      .map<RevenueEntry>((i) => {
        const t = num(i.total_amount);
        const v = num(i.vat_amount);
        return {
          kind: 'invoice',
          date: i.issue_date,
          ref: i.invoice_number,
          customer: i.customer,
          party: i.customer_name,
          excl: t - v,
          vat: v,
          incl: t,
        };
      });
    const cn = (d.creditNotes ?? [])
      .filter((c) => isCreditIssued(c) && inPeriod(c.issue_date, r))
      .map<RevenueEntry>((c) => ({
        kind: 'credit',
        date: c.issue_date,
        ref: `${c.credit_note_number}${c.invoice_number ? `, ${c.invoice_number}` : ''}`,
        customer: c.customer,
        party: c.customer_name,
        excl: -num(c.subtotal),
        vat: -num(c.vat_amount),
        incl: -num(c.total_amount),
      }));
    return [...inv, ...cn];
  }
  // Cash: allocate every payment to its invoice in date order, so a payment
  // past the invoice total (an overpayment) is not counted as revenue.
  const invById = new Map(d.invoices.map((i) => [i.id, i]));
  const paidSoFar = new Map<number, number>();
  const ordered = [...d.payments].sort(
    (a, b) => (a.payment_date || '').localeCompare(b.payment_date || '') || a.id - b.id,
  );
  const out: RevenueEntry[] = [];
  for (const p of ordered) {
    const amt = num(p.amount);
    const inv = p.invoice != null ? invById.get(p.invoice) : undefined;
    let alloc = amt;
    if (inv) {
      const before = paidSoFar.get(inv.id) || 0;
      alloc = Math.max(0, Math.min(amt, num(inv.total_amount) - before));
      paidSoFar.set(inv.id, before + amt);
    }
    if (!inPeriod(p.payment_date, r)) continue;
    const v = alloc * vatShare(inv);
    out.push({
      kind: 'payment',
      date: p.payment_date,
      ref: `${p.payment_number || `PMT-${p.id}`}${p.invoice_number ? `, ${p.invoice_number}` : ''}`,
      customer: p.customer ?? inv?.customer ?? null,
      party: p.customer_name || inv?.customer_name || 'Unknown customer',
      excl: alloc - v,
      vat: v,
      incl: alloc,
      over: amt - alloc,
    });
  }
  return out;
}

export const sumOf = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

/** Revenue excl. VAT per month, plus totals, for a basis and range. */
export function revenueByMonth(d: RevenueSource, basis: RevenueBasis, r: { from: string; to: string }) {
  const entries = revenueEntries(d, basis, r);
  const byMonth = new Map<string, number>();
  entries.forEach((e) => {
    const m = ymOf(e.date);
    byMonth.set(m, (byMonth.get(m) || 0) + e.excl);
  });
  return {
    entries,
    byMonth,
    excl: sumOf(entries, (e) => e.excl),
    vat: sumOf(entries, (e) => e.vat),
    incl: sumOf(entries, (e) => e.incl),
    invoices: entries.filter((e) => e.kind === 'invoice').length,
    credits: entries.filter((e) => e.kind === 'credit'),
    payments: entries.filter((e) => e.kind === 'payment').length,
    over: sumOf(entries, (e) => e.over || 0),
  };
}

/** An expense excl. its input VAT. */
export const expenseNet = (e: Pick<Expense, 'amount' | 'vat_amount'>) => num(e.amount) - num(e.vat_amount);
export const expenseVat = (e: Pick<Expense, 'vat_amount'>) => num(e.vat_amount);
export const isRejected = (e: Pick<Expense, 'status'>) => st(e.status) === 'REJECTED';

export const CATEGORY_LABEL: Record<string, string> = {
  FUEL: 'Fuel',
  TOLLS: 'Tolls',
  DRIVER: 'Driver costs',
  DRIVER_COST: 'Driver costs',
  SUBCONTRACTOR: 'Subcontractors',
  MAINTENANCE: 'Maintenance and repairs',
  INSURANCE: 'Insurance',
  OVERHEAD: 'Overheads and admin',
};
export const catLabel = (c: string) =>
  CATEGORY_LABEL[st(c)] ??
  (c ? c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ') : 'Uncategorised');
/** Transport P&L: costs that move with the work vs fixed running costs. */
export const methodLabel = (m?: string) => {
  const s = st(m);
  if (!s) return 'Payment';
  if (s === 'EFT' || s === 'BANK_TRANSFER') return 'EFT';
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
};
export const DIRECT = ['FUEL', 'TOLLS', 'DRIVER', 'DRIVER_COST', 'SUBCONTRACTOR', 'MAINTENANCE'];
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

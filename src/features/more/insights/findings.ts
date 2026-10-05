// Findings engine (on the device, read only). Port of the web app's
// components/insights/findings.ts.
//
// Every finding is computed from the full ledgers the app already loads
// (lib/useLedger.ts) plus the company profile, the live diesel price and the
// weekly cash forecast. Each one carries the records behind it (evidence), so
// every rand figure can be traced to invoices, expenses, loads or quotes.
// Nothing here writes data: an action is a link to the screen where the owner
// does the work. A finding fires only on a clear trigger and above R 1 000.
//
// Pure TypeScript, no React. Navigation targets are described as data
// (`Target`) and turned into real navigation by the UI.

import { formatCurrency, formatDate, formatPercent } from '@/lib/formatters';
import { saDaysBetween } from '@/lib/dates';
import { resolveDieselPrice } from '@/lib/dieselPrice';
import {
  expenseNet,
  isDraft,
  isOpen as ledgerIsOpen,
  isPaid,
  num,
  periodText,
  plural,
  resolvePeriod,
  type Expense,
  type Invoice,
  type Load,
  type Payment,
  type Quote,
} from '@/lib/ledger';
import { bookedLoadOf, quoteLapsed, quoteStage } from '@/lib/quoteStage';
import {
  STALE_AFTER_DAYS,
  staleAction,
  staleLabel,
  staleWork,
} from '@/lib/staleWork';
import { marginFromLedger } from './margin';

// ── types ───────────────────────────────────────────────────────────────────

export type Severity = 'high' | 'medium' | 'low';
export type Category =
  | 'Get paid'
  | 'Know your margin'
  | 'Quote better'
  | 'Bill your work'
  | 'Clear old orders'
  | 'Cash ahead';
export type FindingKind =
  | 'never_sent'
  | 'stopped_paying'
  | 'never_chased'
  | 'short_paid'
  | 'no_pod'
  | 'pending_costs'
  | 'diesel'
  | 'open_loads'
  | 'pending_loads'
  | 'expired_quotes'
  | 'cash_shortfall';

/** Where an action or an evidence row goes in the app. */
export type Target =
  | { kind: 'invoice'; id: number }
  | { kind: 'invoices' }
  | { kind: 'load'; id: number }
  | { kind: 'orders' }
  | { kind: 'quote'; id: number }
  | { kind: 'quotes' }
  | { kind: 'customer'; id: number }
  | { kind: 'expenses' }
  | { kind: 'reports' }
  | { kind: 'company-settings' };

export interface EvidenceRow {
  id: string;
  /** Record number, e.g. an invoice number. */
  ref: string;
  label: string;
  /** Short fact about the record, e.g. "112 days late". */
  note: string;
  amount: number;
  target: Target;
}

export interface Finding {
  id: string;
  kind: FindingKind;
  category: Category;
  severity: Severity;
  confidence: 'high' | 'medium' | 'low';
  basis: 'Measured' | 'Estimated';
  amount: number;
  /** 2 to 6 words that follow the figure. */
  headline: string;
  /** One supporting line. */
  line: string;
  action: { label: string; target: Target };
  /** How it was worked out (shown behind the info toggle). */
  method: string;
  evidence: EvidenceRow[];
  evidenceNoun: [string, string];
  /** Invoice ids carried by the finding (for the de-duplicated total). */
  invoiceIds: number[];
  /** Load ids carried by the finding (unbilled work). */
  loadIds: number[];
  /** Counts toward "cash held up": money owed or unbilled, measured. */
  cash: boolean;
}

/** The weekly forecast as `dashboard/cashflow/` returns it. */
export interface CashflowForecast {
  forecast?: unknown;
}

export interface FindingInputs {
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  loads: Load[];
  quotes: Quote[];
  /** "first 1000 of 1250 invoices" notes for lists that could not be loaded in full. */
  partial: string[];
  /** fuel-prices/current/ ; null when it could not be loaded. */
  fuel: Record<string, unknown> | null;
  /** company/profile/ ; null when it could not be loaded. */
  company: Record<string, unknown> | null;
  /** dashboard/cashflow/ ; null when the forecast is unavailable (HTTP 503). */
  cashflow: CashflowForecast | null;
}

export interface FindingsSummary {
  /** Money held up across the cash findings, each invoice and load counted once. */
  cash: number;
  invoiceCount: number;
  loadCount: number;
  customerCount: number;
  /** Open invoices past their due date. */
  overdueCount: number;
  /** Of those, how many have a reminder recorded. */
  reminded: number;
  oldestLate: number;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const THRESHOLD = 1000;
const SHORTFALL_WEEKS = 8;
const SHORTFALL_MIN = 5000;
const MONTH3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const up = (s?: string | null) => (s || '').toUpperCase();
const dateOnly = (s: string | null | undefined) => (s ? s.slice(0, 10) : '');
/** Whole South African calendar days from a to b (b later is positive). */
const days = (a: string | Date, b: string | Date) => saDaysBetween(a, b) ?? 0;

/** Whole rand, e.g. "R 127 621". Used in headlines and lines, where cents are noise. */
export const randWhole = (v: number) =>
  formatCurrency(Math.round(v), { minimumFractionDigits: 0, maximumFractionDigits: 0 });
/** Rand and cents, for evidence rows and per-litre prices. */
export const rand2 = (v: number) =>
  formatCurrency(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const shortName = (s: string) =>
  s
    .replace(/\s+(\(Pty\)\s*)?(Ltd|Limited|Holdings|Group|Beverages SA|Industries)\.?$/i, '')
    .replace(/\s+(Ltd|Limited|Holdings)\.?$/i, '')
    .trim() || s;

/** "26 Oct" */
const shortDay = (iso: string) => {
  const m = Number(iso.slice(5, 7));
  return `${Number(iso.slice(8, 10))} ${MONTH3[m - 1] ?? ''}`.trim();
};

/**
 * Sent and not fully paid: the ledger's `isOpen` (drafts and cancelled are not
 * owed), and a written-off invoice is not owed either.
 */
const isOpen = (i: Invoice) => ledgerIsOpen(i) && up(i.status) !== 'WRITTEN_OFF';
const neverReminded = (i: Invoice) => !num(i.reminder_count) && !i.last_reminder_at;
const customerKey = (i: Invoice) => (i.customer != null ? `c${i.customer}` : `n${i.customer_name}`);

/** The stale loads in a list (open and stale), oldest first: the one rule Orders, Home and the fleet use. */
function staleLoads(loads: Load[], now: Date): Load[] {
  return loads
    .map((l) => ({ l, s: staleWork(l, now) }))
    .filter((x): x is { l: Load; s: NonNullable<ReturnType<typeof staleWork>> } => x.s !== null)
    .sort((a, b) => b.s.days - a.s.days)
    .map((x) => x.l);
}

const partialNote = (partial: string[], noun: string) => {
  const p = partial.find((x) => x.endsWith(` ${noun}`));
  return p ? ` Based on the ${p}.` : '';
};

// ── findings ────────────────────────────────────────────────────────────────

export function computeFindings(input: FindingInputs, now: Date = new Date()): Finding[] {
  const { invoices, loads, quotes } = input;
  const out: Finding[] = [];
  const invNote = partialNote(input.partial, 'invoices');
  const loadNote = input.partial.some((x) => x.endsWith(' loads')) ? ' Not every load could be loaded.' : '';
  const lateDays = (i: Invoice) => (i.due_date ? days(i.due_date, now) : 0);
  const invoiceRow = (i: Invoice, note: string, amount = num(i.balance)): EvidenceRow => ({
    id: `inv-${i.id}`,
    ref: i.invoice_number,
    label: i.customer_name,
    note,
    amount,
    target: { kind: 'invoice', id: i.id },
  });

  // 1. Invoices created but never sent ----------------------------------------
  const drafts = invoices
    .filter((i) => isDraft(i) && num(i.total_amount) > 0 && days(i.created_at, now) >= 2)
    .sort((a, b) => num(b.total_amount) - num(a.total_amount));
  const draftTotal = drafts.reduce((s, i) => s + num(i.total_amount), 0);
  if (drafts.length && draftTotal >= THRESHOLD) {
    const oldest = Math.max(...drafts.map((i) => days(i.created_at, now)));
    out.push({
      id: 'never_sent',
      kind: 'never_sent',
      category: 'Get paid',
      basis: 'Measured',
      confidence: 'high',
      severity: oldest > 30 ? 'high' : 'medium',
      amount: draftTotal,
      headline: 'Invoiced, never sent',
      line: `${plural(drafts.length, 'draft invoice')}, the oldest ${plural(oldest, 'day')} old. Customers have not seen them.`,
      action: {
        label: drafts.length === 1 ? 'Review and send' : `Review ${drafts.length} drafts`,
        target: drafts.length === 1 && drafts[0] ? { kind: 'invoice', id: drafts[0].id } : { kind: 'invoices' },
      },
      method: `Invoices still in Draft at least 2 days after they were created. Value is each invoice total including VAT. Drafts are not counted as owed anywhere in this feed.${invNote}`,
      evidence: drafts.map((i) =>
        invoiceRow(i, `created ${plural(days(i.created_at, now), 'day')} ago`, num(i.total_amount)),
      ),
      evidenceNoun: ['draft invoice', 'draft invoices'],
      invoiceIds: drafts.map((i) => i.id),
      loadIds: [],
      cash: true,
    });
  }

  // Last payment date per invoice (for part-payments).
  const lastPayment = new Map<number, string>();
  for (const p of input.payments) {
    if (p.invoice == null) continue;
    const prev = lastPayment.get(p.invoice);
    if (!prev || p.payment_date > prev) lastPayment.set(p.invoice, p.payment_date);
  }

  // 2. Customers who stopped paying (one card per customer) --------------------
  const byCustomer = new Map<string, Invoice[]>();
  for (const i of invoices) {
    const k = customerKey(i);
    const a = byCustomer.get(k) ?? [];
    a.push(i);
    byCustomer.set(k, a);
  }
  const stoppedCustomers = new Set<string>();
  byCustomer.forEach((list, key) => {
    const first = list[0];
    if (!first) return;
    const paid = list.filter((i) => isPaid(i) && i.paid_at && i.due_date);
    const onTime = paid.filter((i) => dateOnly(i.paid_at) <= i.due_date);
    const open = list.filter(isOpen);
    const openTotal = open.reduce((s, i) => s + num(i.balance), 0);
    const stuck = open.filter((i) => lateDays(i) >= 30);
    if (!stuck.length || openTotal < 20000) return;
    // Skipped: a newer invoice was paid while an older one is still open.
    const skipped = open
      .filter((o) => paid.some((p) => p.issue_date > o.issue_date))
      .sort((a, b) => a.issue_date.localeCompare(b.issue_date));
    const goodHistory = paid.length >= 2 && onTime.length === paid.length;
    if (!goodHistory) return;
    stoppedCustomers.add(key);
    const maxLate = Math.max(...stuck.map(lateDays));
    const skip = skipped[0];
    const name = first.customer_name;
    out.push({
      id: `stopped_${key}`,
      kind: 'stopped_paying',
      category: 'Get paid',
      basis: 'Measured',
      confidence: skip ? 'high' : 'medium',
      severity: 'high',
      amount: openTotal,
      headline: `${shortName(name)} stopped paying`,
      line: skip
        ? `Paid ${plural(onTime.length, 'invoice')} on time, then skipped ${skip.invoice_number}. Now ${plural(maxLate, 'day')} late.`
        : `Paid ${plural(onTime.length, 'invoice')} on time. Now ${plural(stuck.length, 'invoice')} up to ${plural(maxLate, 'day')} late.`,
      action: {
        label: skip ? 'Call about the skipped invoice' : 'Call their accounts team',
        target: first.customer != null ? { kind: 'customer', id: first.customer } : { kind: 'invoices' },
      },
      method: `A customer who paid at least 2 invoices by their due date and now has at least R 20 000 unpaid, with an invoice 30 or more days late${skip ? ', and who paid a newer invoice while an older one is still open (often a dispute or a missing proof of delivery)' : ''}. Value is their open balance on sent invoices.${invNote}`,
      evidence: [...list]
        .sort((a, b) => a.issue_date.localeCompare(b.issue_date))
        .filter((i) => !isDraft(i))
        .map((i) => {
          const paidIt = isPaid(i);
          const note = paidIt
            ? `paid ${
                i.paid_at && i.due_date
                  ? dateOnly(i.paid_at) <= i.due_date
                    ? 'on time'
                    : `${plural(days(i.due_date, dateOnly(i.paid_at)), 'day')} late`
                  : ''
              }`.trim()
            : `${i === skip ? 'skipped, ' : ''}${lateDays(i) > 0 ? `${plural(lateDays(i), 'day')} late` : 'not yet due'}`;
          return invoiceRow(i, note, paidIt ? num(i.total_amount) : num(i.balance));
        }),
      evidenceNoun: ['invoice', 'invoices'],
      invoiceIds: open.map((i) => i.id),
      loadIds: [],
      cash: true,
    });
  });

  // 3. Part-paid invoices (short-paid) -------------------------------------------
  const shortPaid = invoices
    .filter((i) => {
      if (!isOpen(i)) return false;
      const total = num(i.total_amount);
      const paidAmt = num(i.paid_amount);
      if (paidAmt <= 0 || paidAmt >= 0.9 * total) return false;
      if (stoppedCustomers.has(customerKey(i))) return false;
      const last = lastPayment.get(i.id);
      return last ? days(last, now) >= 14 : false;
    })
    .sort((a, b) => num(b.balance) - num(a.balance));
  const shortTotal = shortPaid.reduce((s, i) => s + num(i.balance), 0);
  const shortIds = new Set(shortPaid.map((i) => i.id));
  if (shortPaid.length && shortTotal >= THRESHOLD) {
    const quiet = Math.min(...shortPaid.map((i) => days(lastPayment.get(i.id) ?? dateOnly(i.created_at), now)));
    out.push({
      id: 'short_paid',
      kind: 'short_paid',
      category: 'Get paid',
      basis: 'Measured',
      confidence: 'medium',
      severity: 'medium',
      amount: shortTotal,
      headline: 'Unpaid after part-payments',
      line: `${plural(shortPaid.length, 'invoice')} part-paid, then nothing for at least ${plural(quiet, 'day')}.`,
      action: {
        label: 'Ask for remittance advice',
        target: shortPaid.length === 1 && shortPaid[0] ? { kind: 'invoice', id: shortPaid[0].id } : { kind: 'invoices' },
      },
      method: `Sent invoices where less than 90% has been paid and no further payment has been recorded for 14 days. A small or partial payment often means a query on the invoice or a payment allocated to the wrong invoice. Value is the unpaid remainder.${invNote}`,
      evidence: shortPaid.map((i) =>
        invoiceRow(i, `${Math.round((num(i.paid_amount) / num(i.total_amount)) * 100)}% paid`),
      ),
      evidenceNoun: ['invoice', 'invoices'],
      invoiceIds: shortPaid.map((i) => i.id),
      loadIds: [],
      cash: true,
    });
  }

  // 4. Overdue and never chased (grouped) -----------------------------------------
  const unchased = invoices
    .filter((i) => {
      if (!isOpen(i) || lateDays(i) <= 7 || !neverReminded(i) || shortIds.has(i.id)) return false;
      return !stoppedCustomers.has(customerKey(i));
    })
    .sort((a, b) => num(b.balance) - num(a.balance));
  const unchasedTotal = unchased.reduce((s, i) => s + num(i.balance), 0);
  if (unchased.length && unchasedTotal >= THRESHOLD) {
    const customers = new Set(unchased.map((i) => i.customer ?? i.customer_name)).size;
    // Days past the due date, weighted by balance: the Debtors report's basis.
    const avgLate = Math.round(
      unchased.reduce((s, i) => s + lateDays(i) * num(i.balance), 0) / unchasedTotal,
    );
    // The line quotes the oldest invoice: the same day count as its own row.
    const maxLate = Math.max(...unchased.map(lateDays));
    out.push({
      id: 'never_chased',
      kind: 'never_chased',
      category: 'Get paid',
      basis: 'Measured',
      confidence: 'high',
      severity: avgLate > 60 ? 'high' : 'medium',
      amount: unchasedTotal,
      headline: 'Overdue, never chased',
      line: `${plural(customers, 'customer')}, up to ${plural(maxLate, 'day')} past the due date. No reminder sent on any.`,
      action: { label: 'Send reminders', target: { kind: 'invoices' } },
      method: `Sent invoices more than 7 days past their due date with no reminder ever recorded. Customers and invoices already in a card above are left out. Value is the unpaid balance. Days late are whole days since each invoice's due date.${invNote}`,
      evidence: unchased.map((i) => invoiceRow(i, `${plural(lateDays(i), 'day')} late`)),
      evidenceNoun: ['invoice', 'invoices'],
      invoiceIds: unchased.map((i) => i.id),
      loadIds: [],
      cash: true,
    });
  }

  // 5. Unpaid with no proof of delivery ----------------------------------------
  {
    const loadById = new Map(loads.map((l) => [l.id, l]));
    const noPod = invoices
      .filter((i) => {
        if (!isOpen(i) || lateDays(i) <= 0 || i.load == null) return false;
        const l = loadById.get(i.load);
        return (
          !!l && !l.pod_document && !(l.pod_signature || '').trim() && !(l.pod_received_by || '').trim()
        );
      })
      .sort((a, b) => num(b.balance) - num(a.balance));
    const podTotal = noPod.reduce((s, i) => s + num(i.balance), 0);
    const linked = invoices.filter((i) => isOpen(i) && i.load != null).length;
    const openCount = invoices.filter(isOpen).length;
    const firstInv = noPod[0];
    if (firstInv && noPod.length && podTotal >= THRESHOLD) {
      out.push({
        id: 'no_pod',
        kind: 'no_pod',
        category: 'Get paid',
        basis: 'Measured',
        confidence: 'high',
        severity: 'medium',
        amount: podTotal,
        headline: 'Overdue, no proof of delivery',
        line: `${plural(noPod.length, 'overdue invoice')} without a POD. Customers ask for it first.`,
        action: {
          label: noPod.length === 1 ? 'Attach the POD' : 'Attach PODs, largest first',
          target: firstInv.load != null ? { kind: 'load', id: firstInv.load } : { kind: 'orders' },
        },
        method: `Overdue invoices whose load has no POD document, signature or received-by name. Only invoices linked to a load can be checked: ${linked} of ${openCount} open invoices are. Some invoices here may also appear in another card, so values are not added across cards.${invNote}${loadNote}`,
        evidence: noPod.map((i) => {
          const l = i.load != null ? loadById.get(i.load) : undefined;
          return {
            ...invoiceRow(i, `${l?.load_number ?? 'Load'}, ${plural(lateDays(i), 'day')} late`),
            target: i.load != null ? ({ kind: 'load', id: i.load } as Target) : ({ kind: 'invoice', id: i.id } as Target),
          };
        }),
        evidenceNoun: ['invoice', 'invoices'],
        invoiceIds: noPod.map((i) => i.id),
        loadIds: [],
        cash: true,
      });
    }
  }

  // 6. Costs waiting for approval --------------------------------------------
  // The margin is the Margin tab's (margin.ts: last 12 months, excl. VAT, cash
  // basis), so both print the same percentage. Costs are every expense that is not
  // rejected, so an expense still Pending is already deducted: what is at stake is
  // that a cost nobody has looked at drags the margin down until it is approved or
  // rejected.
  {
    const pending = input.expenses
      .filter(
        (e) =>
          up(e.status) === 'PENDING' &&
          expenseNet(e) > 0 &&
          days(e.created_at || e.expense_date, now) >= 7,
      )
      .sort((a, b) => expenseNet(b) - expenseNet(a));
    const pendingTotal = pending.reduce((s, e) => s + expenseNet(e), 0);
    const period = resolvePeriod('last-12');
    const m = marginFromLedger(
      { invoices, payments: input.payments, expenses: input.expenses },
      period,
    );
    const withoutPending = m.net + m.pending;
    // Without them the business would be in profit; with them it is not.
    const flips = m.net < 0 && withoutPending >= 0;
    if (pending.length && pendingTotal >= THRESHOLD && (flips || pendingTotal > 0.05 * m.costs)) {
      out.push({
        id: 'pending_costs',
        kind: 'pending_costs',
        category: 'Know your margin',
        basis: 'Measured',
        confidence: 'high',
        severity: flips ? 'high' : 'medium',
        amount: pendingTotal,
        headline: 'Costs waiting for approval',
        line:
          flips && m.pct != null
            ? `They are in your ${formatPercent(m.pct)} margin, which is a loss. Without them it is a ${randWhole(withoutPending)} profit.`
            : `${plural(pending.length, 'expense')} waiting for approval, already counted in your margin.`,
        action: { label: `Review ${plural(pending.length, 'expense')}`, target: { kind: 'expenses' } },
        method: `Expenses still Pending 7 or more days after they were entered, excl. VAT. Reports count every expense that is not rejected, so these are already costs until they are rejected. Margin, ${periodText(period)}, excl. VAT, cash basis (as on the Margin tab): revenue ${randWhole(m.revenue)} less costs ${randWhole(m.costs)} is ${randWhole(m.net)}, of which ${randWhole(m.pending)} is still pending in those months.${partialNote(input.partial, 'expenses')}`,
        evidence: pending.map((e) => ({
          id: `exp-${e.id}`,
          ref: e.expense_number || `#${e.id}`,
          label: (e.category || '').charAt(0) + (e.category || '').slice(1).toLowerCase().replace(/_/g, ' '),
          note: `dated ${formatDate(e.expense_date)}`,
          amount: expenseNet(e),
          target: { kind: 'expenses' },
        })),
        evidenceNoun: ['expense', 'expenses'],
        invoiceIds: [],
        loadIds: [],
        cash: false,
      });
    }
  }

  // 7. Quotes priced on old diesel -----------------------------------------------
  if (input.fuel) {
    const diesel = resolveDieselPrice({ company: input.company, live: input.fuel });
    const official = diesel.livePrice ?? 0;
    const zone = diesel.zone;
    const loadByQuote = new Map(
      loads.filter((l) => l.quote != null).map((l) => [l.quote as number, l]),
    );
    const DONE = ['DELIVERED', 'INVOICED', 'CANCELLED', 'COMPLETED'];
    const rows: { q: Quote; price: number; litres: number; short: number }[] = [];
    if (official > 0) {
      for (const q of quotes) {
        const st = up(q.status);
        const price = num(q.fuel_price_at_creation);
        const fuel = num(q.fuel_surcharge);
        if (price <= 0 || fuel <= 0) continue;
        const loadStatus = up(loadByQuote.get(q.id)?.status ?? bookedLoadOf(q as unknown as Record<string, unknown>)?.status);
        const done = loadStatus !== '' && DONE.includes(loadStatus);
        const live =
          (st === 'ACCEPTED' && !done) ||
          (st === 'SENT' && !!q.valid_until && !quoteLapsed(q as unknown as Record<string, unknown>, now) && q.outcome !== 'rejected');
        const delta = official - price;
        if (!live || delta < 0.2) continue;
        const litres = fuel / price;
        rows.push({ q, price, litres, short: litres * delta });
      }
    }
    const total = rows.reduce((s, r) => s + r.short, 0);
    if (rows.length && total >= THRESHOLD) {
      const lo = Math.min(...rows.map((r) => r.price));
      // Only a diesel price the company chose is "your setting": the 23,50
      // factory default is not (resolveDieselPrice marks that case).
      const setting = diesel.source === 'own' && diesel.price ? diesel.price : 0;
      const source = typeof input.fuel.source === 'string' && input.fuel.source ? `, ${input.fuel.source}` : '';
      out.push({
        id: 'diesel',
        kind: 'diesel',
        category: 'Quote better',
        basis: 'Estimated',
        confidence: 'high',
        severity: 'medium',
        amount: total,
        headline: 'Quotes short on diesel',
        line: `Diesel is ${rand2(official)}/L; ${rows.length === 1 ? `this quote used ${rand2(lo)}` : `these quotes used from ${rand2(lo)}`}.${setting > 0 && Math.abs(setting - official) > 0.5 ? ` Your setting: ${rand2(setting)}.` : ''}`,
        action: { label: 'Update your diesel price', target: { kind: 'company-settings' } },
        method: `Accepted quotes not yet delivered, and sent quotes still valid. Litres = the quote's fuel line divided by the diesel price it used. Shortfall = litres times (today's ${zone === 'COASTAL' ? 'coastal' : 'inland'} 50ppm price ${rand2(official)}${source} less the quote's price). An estimate.`,
        evidence: [...rows]
          .sort((a, b) => b.short - a.short)
          .map((r) => ({
            id: `q-${r.q.id}`,
            ref: r.q.quote_number,
            label: r.q.customer_name ?? '',
            note: `${Math.round(r.litres)} L at ${rand2(r.price)}`,
            amount: r.short,
            target: { kind: 'quote', id: r.q.id } as Target,
          })),
        evidenceNoun: ['quote', 'quotes'],
        invoiceIds: [],
        loadIds: [],
        cash: false,
      });
    }
  }

  // 8. Loads left open (the one stale-work rule, lib/staleWork.ts) ----------------
  // The same loads Orders, Home and the fleet pages flag. Together the two
  // cards below count every such load, so they match Home. Only loads that
  // already have a vehicle (Assigned, Loading, In transit) can still be
  // delivered and invoiced, so only they are "cash held up". A Pending load
  // was never picked up: it gets its own card with no cash value.
  {
    const stale = staleLoads(loads, now);
    const isPendingLoad = (l: Load) => up(l.status) === 'PENDING';
    const billable = stale.filter((l) => !isPendingLoad(l));
    const pending = stale.filter(isPendingLoad);
    const evidenceOf = (rows: Load[]): EvidenceRow[] =>
      rows.map((l) => {
        const st = staleWork(l, now);
        return {
          id: `load-${l.id}`,
          ref: l.load_number,
          label: l.customer_name,
          note: st
            ? st.overdue
              ? `due ${st.since}, ${plural(st.days, 'day')} ago`
              : `open since ${st.since} (${plural(st.days, 'day')})`
            : '',
          amount: num(l.total_amount),
          target: { kind: 'load', id: l.id },
        };
      });
    const total = billable.reduce((s, l) => s + num(l.total_amount), 0);
    const topBillable = billable[0];
    const topStale = topBillable ? staleWork(topBillable, now) : null;
    if (topBillable && topStale && total >= THRESHOLD) {
      const by = new Map<string, number>();
      billable.forEach((l) => {
        const k = up(l.status);
        by.set(k, (by.get(k) || 0) + 1);
      });
      const words: Record<string, string> = { IN_TRANSIT: 'in transit', LOADING: 'loading', ASSIGNED: 'assigned' };
      const mix = ['IN_TRANSIT', 'LOADING', 'ASSIGNED']
        .filter((k) => by.get(k))
        .map((k) => `${by.get(k)} ${words[k]}`)
        .join(', ');
      const oldest = staleLabel(topStale);
      out.push({
        id: 'open_loads',
        kind: 'open_loads',
        category: 'Bill your work',
        basis: 'Measured',
        confidence: 'medium',
        severity: 'medium',
        amount: total,
        headline: billable.length === 1 ? 'Load left open' : 'Loads left open',
        line: `${plural(billable.length, 'load')} left open (${mix}); the oldest ${oldest.text}.`,
        // None of these is delivered, so none can be invoiced yet. The action
        // is staleAction's move for the status (said of them all when they
        // share one), else "Update or cancel each load".
        action: {
          label:
            by.size === 1
              ? staleAction(topBillable).replace(/ it$/, billable.length === 1 ? ' it' : ' them')
              : 'Update or cancel each load',
          target: billable.length === 1 ? { kind: 'load', id: topBillable.id } : { kind: 'orders' },
        },
        method: `Loads with a vehicle (Assigned, Loading or In transit) past their delivery date, or open more than ${STALE_AFTER_DAYS} days: the same rule as Orders, Home and the fleet pages. None is delivered, so none can be invoiced yet. In transit: mark it delivered (then invoice it) or cancel it. Loading: mark it in transit or cancel it. Assigned: start it, reassign it or cancel it. Value is the load total, excluding VAT. Pending loads were never picked up, so they are not counted here.${loadNote}`,
        evidence: evidenceOf(billable),
        evidenceNoun: ['load', 'loads'],
        invoiceIds: [],
        loadIds: billable.map((l) => l.id),
        cash: true,
      });
    }
    const pendingTotal = pending.reduce((s, l) => s + num(l.total_amount), 0);
    const topPending = pending[0];
    const topPendingStale = topPending ? staleWork(topPending, now) : null;
    if (topPending && topPendingStale && pendingTotal >= THRESHOLD) {
      const oldest = staleLabel(topPendingStale);
      // "Assign a vehicle or cancel it" (staleAction), said of every load in the card.
      const act = staleAction(topPending).replace(/ it$/, pending.length === 1 ? ' it' : ' them');
      out.push({
        id: 'pending_loads',
        kind: 'pending_loads',
        category: 'Clear old orders',
        basis: 'Measured',
        confidence: 'medium',
        severity: 'low',
        amount: pendingTotal,
        headline: pending.length === 1 ? 'Order never picked up' : 'Orders never picked up',
        line: `${plural(pending.length, 'pending load')} past ${pending.length === 1 ? 'its dates' : 'their dates'}; the oldest ${oldest.text}.`,
        action: {
          label: act,
          target: pending.length === 1 ? { kind: 'load', id: topPending.id } : { kind: 'orders' },
        },
        method: `Pending loads (no vehicle yet) past their delivery date, or open more than ${STALE_AFTER_DAYS} days: the same rule as Orders, Home and the fleet pages. They were never picked up, so there is nothing to invoice: assign a vehicle or cancel each one. Value is the order total, excluding VAT. Not money owed, so it is not counted in cash held up.${loadNote}`,
        evidence: evidenceOf(pending),
        evidenceNoun: ['load', 'loads'],
        invoiceIds: [],
        loadIds: [],
        cash: false,
      });
    }
  }

  // 9. Sent quotes that lapsed without a reply (worth checking) --------------------
  {
    const lapsed = quotes
      .filter(
        (q) =>
          up(q.status) === 'SENT' &&
          quoteStage(q as unknown as Record<string, unknown>, now) === 'EXPIRED' &&
          num(q.total_amount) > 0,
      )
      .sort((a, b) => num(b.total_amount) - num(a.total_amount));
    const total = lapsed.reduce((s, q) => s + num(q.total_amount), 0);
    if (lapsed.length && total >= THRESHOLD) {
      out.push({
        id: 'expired_quotes',
        kind: 'expired_quotes',
        category: 'Quote better',
        basis: 'Measured',
        confidence: 'low',
        severity: 'low',
        amount: total,
        headline: 'Quotes lapsed, no reply',
        line: `${plural(lapsed.length, 'sent quote')} expired with no answer from the customer.`,
        action: { label: 'Follow up on quotes', target: { kind: 'quotes' } },
        method:
          'Quotes in Sent status whose valid-until date has passed, with no acceptance or rejection recorded and not booked. Value is the quoted total. Not money owed, so it is not counted in cash held up.',
        evidence: lapsed.map((q) => ({
          id: `q-${q.id}`,
          ref: q.quote_number,
          label: q.customer_name ?? '',
          note: `expired ${q.valid_until ? formatDate(q.valid_until) : ''}`.trim(),
          amount: num(q.total_amount),
          target: { kind: 'quote', id: q.id } as Target,
        })),
        evidenceNoun: ['quote', 'quotes'],
        invoiceIds: [],
        loadIds: [],
        cash: false,
      });
    }
  }

  // 10. Predicted cash shortfall (forecast, before the bank balance) ----------------
  // The next 8 weeks from the weekly forecast, added up from zero today. Fires
  // only when that running position falls at least R 5 000 below zero. When the
  // forecast is unavailable (HTTP 503) there is no finding and no invented figure.
  const rawWeeks = Array.isArray(input.cashflow?.forecast) ? (input.cashflow?.forecast as unknown[]) : [];
  const weeks = rawWeeks
    .slice(0, SHORTFALL_WEEKS)
    .map((w) => {
      const r = (w ?? {}) as Record<string, unknown>;
      return { start: String(r.start_date ?? ''), in: num(r.expected_in), out: num(r.expected_out) };
    })
    .filter((w) => /^\d{4}-\d{2}-\d{2}/.test(w.start));
  if (weeks.length) {
    let pos = 0;
    const run = weeks.map((w) => ({ ...w, pos: (pos += w.in - w.out) }));
    const firstIdx = run.findIndex((w) => w.pos < 0);
    const lowest = run.reduce((m, w) => (w.pos < m.pos ? w : m), run[0]!);
    const first = firstIdx >= 0 ? run[firstIdx] : undefined;
    if (first && -lowest.pos >= SHORTFALL_MIN) {
      const overdueOpen = invoices.filter((i) => isOpen(i) && lateDays(i) > 0);
      const weeksAway = Math.max(0, Math.round(days(now, first.start.slice(0, 10)) / 7));
      out.push({
        id: 'cash_shortfall',
        kind: 'cash_shortfall',
        category: 'Cash ahead',
        basis: 'Estimated',
        confidence: 'medium',
        severity: weeksAway <= 4 ? 'high' : 'medium',
        amount: -lowest.pos,
        headline: `Short of cash from ${shortDay(first.start)}`,
        line: `Week of ${shortDay(first.start)}: expected costs pass receipts. Excludes your bank balance.`,
        action: overdueOpen.length
          ? { label: 'Chase overdue invoices', target: { kind: 'invoices' } }
          : { label: 'See cash movement', target: { kind: 'reports' } },
        method: `Forecast for the next ${weeks.length} weeks. Each unpaid invoice is placed on the date that customer usually pays; expected costs come from approved expenses over the last 90 days. Weeks are added up from zero today, so your bank balance is not included: check it covers the gap. Shows only when the running position falls R 5 000 or more below zero. Value is the lowest point. An estimate.`,
        evidence: run.map((w) => ({
          id: `wk-${w.start}`,
          ref: `Week of ${shortDay(w.start)}`,
          label: `In ${randWhole(w.in)}, out ${randWhole(w.out)}`,
          note: w.pos < 0 ? 'short' : 'covered',
          amount: w.pos,
          target: { kind: 'reports' } as Target,
        })),
        evidenceNoun: ['week', 'weeks'],
        invoiceIds: [],
        loadIds: [],
        cash: false,
      });
    }
  }

  // Rank by rand value. Low-confidence findings sit in "Worth checking".
  return out.sort((a, b) => b.amount - a.amount);
}

/**
 * Summary across findings. Each invoice and load is counted once, even when it
 * appears in two cards (e.g. never chased and no proof of delivery).
 */
export function summarise(findings: Finding[], input: FindingInputs, now: Date = new Date()): FindingsSummary {
  const invById = new Map(input.invoices.map((i) => [i.id, i]));
  const loadById = new Map(input.loads.map((l) => [l.id, l]));
  const invIds = new Set<number>();
  const loadIds = new Set<number>();
  for (const f of findings) {
    if (!f.cash) continue;
    f.invoiceIds.forEach((id) => invIds.add(id));
    f.loadIds.forEach((id) => loadIds.add(id));
  }
  let cash = 0;
  const customers = new Set<string>();
  invIds.forEach((id) => {
    const i = invById.get(id);
    if (!i) return;
    cash += isDraft(i) ? num(i.total_amount) : num(i.balance);
    customers.add(String(i.customer ?? i.customer_name));
  });
  loadIds.forEach((id) => {
    const l = loadById.get(id);
    if (!l) return;
    cash += num(l.total_amount);
    customers.add(String(l.customer ?? l.customer_name));
  });
  const open = input.invoices.filter(isOpen);
  const late = (i: Invoice) => (i.due_date ? days(i.due_date, now) : 0);
  const overdue = open.filter((i) => late(i) > 0);
  return {
    cash,
    invoiceCount: invIds.size,
    loadCount: loadIds.size,
    customerCount: customers.size,
    oldestLate: open.length ? Math.max(0, ...open.map(late)) : 0,
    overdueCount: overdue.length,
    reminded: overdue.filter((i) => !neverReminded(i)).length,
  };
}

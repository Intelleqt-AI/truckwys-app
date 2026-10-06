import type { IconName } from '@/components/ui';
import {
  DELIVERED,
  expenseNet,
  expenseVat,
  inPeriod,
  isApproved,
  isIssued,
  isOpen,
  isRejected,
  moneyWhole,
  num,
  resolvePeriod,
  revenueByMonth,
} from '@/lib/ledger';
import type { PeriodId } from '@/lib/ledger';
import type { Ledger, SourceName } from '@/lib/useLedger';
import type { ReportId } from './types';

// The library of statements: one row per report, with the headline for the last
// 12 months and the newest entry behind it. Port of the web's
// components/reports/library.tsx (REPORTS, keyFigure).

export interface ReportDef {
  id: ReportId;
  group: string;
  title: string;
  purpose: string;
  basis: string;
  icon: IconName;
  needs: SourceName[];
  /** Date of the newest record behind the report. */
  latest: (d: Ledger) => string | undefined;
}

const maxDate = (xs: (string | null | undefined)[]) =>
  xs
    .filter(Boolean)
    .map((x) => x!.slice(0, 10))
    .sort()
    .pop();
const latestInvoice = (d: Ledger) => maxDate(d.invoices.filter(isIssued).map((i) => i.issue_date));
const latestPayment = (d: Ledger) => maxDate(d.payments.map((p) => p.payment_date));
const latestMoney = (d: Ledger) =>
  maxDate([latestPayment(d), maxDate(d.expenses.filter(isApproved).map((e) => e.expense_date))]);

export const REPORTS: ReportDef[] = [
  { id: 'pl', group: 'Profit', title: 'Profit and loss', purpose: 'Did you make a profit, month by month?', basis: 'Excl. VAT · cash or accrual', icon: 'trend', needs: ['invoices', 'payments', 'expenses', 'creditNotes'], latest: latestMoney },
  { id: 'sales', group: 'Profit', title: 'Sales by month', purpose: 'How much you invoiced each month, less credit notes, and what is paid.', basis: 'Excl. VAT · accrual (invoiced)', icon: 'calendar', needs: ['invoices', 'creditNotes'], latest: latestInvoice },
  { id: 'cash', group: 'Cash', title: 'Cash movement', purpose: 'What money came in and went out?', basis: 'Payment date · excl. bank balance', icon: 'banknote', needs: ['invoices', 'payments', 'expenses'], latest: latestMoney },
  { id: 'debtors', group: 'Customers and debtors', title: 'Debtors age analysis', purpose: 'Who owes you, and how late is it?', basis: 'As at a date · by due date', icon: 'clock', needs: ['invoices', 'payments'], latest: (d) => maxDate([latestInvoice(d), latestPayment(d)]) },
  { id: 'statement', group: 'Customers and debtors', title: 'Customer statement', purpose: 'What one customer owes, invoice by invoice.', basis: 'Printable · incl. VAT', icon: 'file', needs: ['invoices', 'payments', 'customers', 'creditNotes'], latest: (d) => maxDate([latestInvoice(d), latestPayment(d)]) },
  { id: 'customers', group: 'Customers and debtors', title: 'Revenue by customer', purpose: 'Which customers bring in the revenue?', basis: 'Excl. VAT · accrual or cash', icon: 'users', needs: ['invoices', 'payments', 'creditNotes'], latest: latestInvoice },
  { id: 'lanes', group: 'Customers and debtors', title: 'Revenue by lane', purpose: 'Which routes earn the most, and per km?', basis: 'Load prices · excl. VAT', icon: 'route', needs: ['loads'], latest: (d) => maxDate(d.loads.map((l) => l.delivery_date)) },
  { id: 'margin', group: 'Customers and debtors', title: 'Lane margin', purpose: 'What each route really earns after its costs.', basis: 'Excl. VAT · actual vs estimate', icon: 'gauge', needs: [], latest: () => undefined },
  { id: 'expenses', group: 'Costs', title: 'Expense report', purpose: 'Where the money goes, by category and truck.', basis: 'Expense date · excl. VAT', icon: 'receipt', needs: ['expenses', 'vehicles'], latest: (d) => maxDate(d.expenses.map((e) => e.expense_date)) },
  { id: 'vat', group: 'Tax and accountant', title: 'VAT report', purpose: 'Output VAT charged, input VAT paid, and the net.', basis: 'Invoice or payments basis', icon: 'building', needs: ['invoices', 'payments', 'creditNotes', 'expenses'], latest: (d) => maxDate([latestInvoice(d), latestPayment(d)]) },
];

export const GROUPS = ['Profit', 'Cash', 'Customers and debtors', 'Costs', 'Tax and accountant'];

/** Everything the library row for any report needs loaded. */
export const LIBRARY_NEEDS: SourceName[] = ['invoices', 'payments', 'expenses', 'loads', 'creditNotes'];

/** One headline per report over the last 12 months (the reports' default
 *  period), from the same ledger rules the reports use; null when there is
 *  nothing to show. */
export type KeyFigure = { value: string; caption: string } | null;
const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

export function keyFigure(id: ReportId, d: Ledger): KeyFigure {
  const p = resolvePeriod('last-12');
  const paid = d.payments.filter((x) => inPeriod(x.payment_date, p));
  const issued = d.invoices.filter((i) => isIssued(i) && inPeriod(i.issue_date, p));
  // Costs: not rejected (approved and pending), excl. input VAT, as the P&L counts them.
  const costs = sum(d.expenses.filter((e) => !isRejected(e) && inPeriod(e.expense_date, p)).map(expenseNet));
  const fig = (v: number, caption: string): KeyFigure => ({ value: moneyWhole(v), caption });
  switch (id) {
    case 'pl': {
      if (!paid.length && !costs) return null;
      const rev = revenueByMonth(d, 'cash', p).excl;
      return fig(rev - costs, 'Net profit excl. VAT, cash');
    }
    case 'sales':
      return issued.length ? fig(revenueByMonth(d, 'accrual', p).excl, 'Revenue excl. VAT, accrual') : null;
    case 'cash': {
      // Cash movement: approved expenses as paid, incl. VAT (the Cash report's rule).
      const out = sum(d.expenses.filter((e) => isApproved(e) && inPeriod(e.expense_date, p)).map((e) => num(e.amount)));
      return paid.length || out ? fig(sum(paid.map((x) => num(x.amount))) - out, 'Net movement') : null;
    }
    case 'debtors': {
      const open = d.invoices.filter(isOpen);
      return open.length ? fig(sum(open.map((i) => num(i.balance))), 'Owed to you now') : null;
    }
    case 'statement': {
      const owing = new Set(d.invoices.filter(isOpen).map((i) => i.customer ?? i.customer_name)).size;
      return owing ? { value: String(owing), caption: owing === 1 ? 'Customer owes you' : 'Customers owe you' } : null;
    }
    case 'customers': {
      const n = new Set(issued.map((i) => i.customer ?? i.customer_name)).size;
      return n ? { value: String(n), caption: n === 1 ? 'Customer invoiced' : 'Customers invoiced' } : null;
    }
    case 'lanes': {
      const done = d.loads.filter((l) => DELIVERED.has((l.status || '').toUpperCase()) && inPeriod(l.delivery_date, p));
      return done.length ? fig(sum(done.map((l) => num(l.total_amount))), 'Delivered, excl. VAT') : null;
    }
    case 'expenses':
      return costs ? fig(costs, 'Costs excl. VAT') : null;
    case 'vat': {
      if (!issued.length) return null;
      const output = revenueByMonth(d, 'accrual', p).vat;
      const input = sum(d.expenses.filter((e) => !isRejected(e) && inPeriod(e.expense_date, p)).map(expenseVat));
      return fig(output - input, 'Net VAT, output less input');
    }
    default:
      return null;
  }
}

/** What every report screen gets from the shell. */
export interface ReportProps {
  d: Ledger;
  /** company/profile/ fields the reports print; empty until the profile loads. */
  companyName?: string;
  vatNumber?: string;
  company?: Record<string, unknown> | null;
  /** Open a customer's statement (debtors, revenue by customer). */
  openStatement: (customerId: number | string) => void;
  /** Customer to preselect on the statement. */
  initialCustomer?: string;
  /** Period to open on, when the report was opened from Insights. */
  initialPeriod?: { id: PeriodId; from?: string; to?: string };
}

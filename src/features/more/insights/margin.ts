import {
  expenseNet,
  inPeriod,
  isApproved,
  isPending,
  monthsIn,
  revenueEntries,
  ymOf,
  type Expense,
  type Invoice,
  type Payment,
} from '@/lib/ledger';

// Margin on the ledgers: port of the web's components/insights/margin-ledger.ts.
// The Profit and loss report's default basis, so the Margin tab and the
// "costs left out of profit" finding print the same numbers:
//
//   revenue = payments received in the month, less each invoice's VAT share,
//             overpayment excluded (cash basis, excl. VAT; lib/ledger
//             revenueEntries 'cash', the backend's cash definition)
//   costs   = every expense that is not rejected (approved and pending), by
//             expense date, net of its input VAT: the backend's definition
//   net     = revenue - costs
//   pending = the part of costs still awaiting approval (informational)

export interface MarginMonth {
  ym: string;
  revenue: number;
  costs: number;
  pending: number;
  net: number;
}

export interface MarginResult {
  revenue: number;
  vat: number;
  costs: number;
  /** The part of `costs` still awaiting approval (already deducted). */
  pending: number;
  pendingCount: number;
  net: number;
  /** Net margin as a % of revenue; null when there is no revenue. */
  pct: number | null;
  /** Every month of the period, in order (zeros included). */
  months: MarginMonth[];
  paymentCount: number;
}

export function marginFromLedger(
  d: { invoices: Invoice[]; payments: Payment[]; expenses: Expense[] },
  period: { from: string; to: string },
): MarginResult {
  const all = monthsIn(period.from, period.to);
  const by = new Map<string, MarginMonth>(
    all.map((ym) => [ym, { ym, revenue: 0, costs: 0, pending: 0, net: 0 }]),
  );
  let revenue = 0;
  let vat = 0;
  let costs = 0;
  let pending = 0;
  let pendingCount = 0;
  let paymentCount = 0;

  for (const p of revenueEntries(d, 'cash', period)) {
    const m = by.get(ymOf(p.date));
    if (m) m.revenue += p.excl;
    revenue += p.excl;
    vat += p.vat;
    paymentCount += 1;
  }
  for (const e of d.expenses) {
    if (!inPeriod(e.expense_date, period)) continue;
    // Rejected: never a cost.
    if (!isApproved(e) && !isPending(e)) continue;
    const m = by.get(ymOf(e.expense_date));
    const net = expenseNet(e);
    costs += net;
    if (m) m.costs += net;
    if (isPending(e)) {
      pending += net;
      pendingCount += 1;
      if (m) m.pending += net;
    }
  }
  const months = all.map((ym) => {
    const m = by.get(ym) ?? { ym, revenue: 0, costs: 0, pending: 0, net: 0 };
    return { ...m, net: m.revenue - m.costs };
  });
  const net = revenue - costs;
  return {
    revenue,
    vat,
    costs,
    pending,
    pendingCount,
    net,
    pct: revenue > 0 ? (net / revenue) * 100 : null,
    months,
    paymentCount,
  };
}

/**
 * The months worth drawing: leading and trailing months with nothing received or
 * spent are cut (a 12 month period for a business that started in March should not
 * open on nine empty bars). Empty months between two active ones stay. `before` and
 * `after` name what was cut so the chart can say so.
 */
export function chartMonths(months: MarginMonth[]): {
  shown: MarginMonth[];
  before: string[];
  after: string[];
} {
  const active = (m: MarginMonth) => Math.abs(m.revenue) > 0.005 || Math.abs(m.costs) > 0.005;
  const first = months.findIndex(active);
  if (first < 0) return { shown: [], before: [], after: [] };
  let last = months.length - 1;
  while (last > first && !active(months[last]!)) last -= 1;
  return {
    shown: months.slice(first, last + 1),
    before: months.slice(0, first).map((m) => m.ym),
    after: months.slice(last + 1).map((m) => m.ym),
  };
}

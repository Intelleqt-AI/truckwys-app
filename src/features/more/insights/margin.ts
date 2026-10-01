import {
  inPeriod,
  isApproved,
  isPending,
  monthsIn,
  num,
  vatShare,
  ymOf,
  type Expense,
  type Invoice,
  type Payment,
} from '@/lib/ledger';

// Margin on the ledgers: port of the web's components/insights/margin-ledger.ts.
// The Profit and loss report's default basis, so the Margin tab and the
// "costs left out of profit" finding print the same numbers:
//
//   revenue = payments received in the month, less each invoice's VAT share
//             (cash basis, excl. VAT)
//   costs   = approved expenses by expense date (all categories)
//   net     = revenue - costs
//   pending = expenses still waiting for approval (not deducted)

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
  const invById = new Map(d.invoices.map((i) => [i.id, i]));
  let revenue = 0;
  let vat = 0;
  let costs = 0;
  let pending = 0;
  let pendingCount = 0;
  let paymentCount = 0;

  for (const p of d.payments) {
    if (!inPeriod(p.payment_date, period)) continue;
    const amt = num(p.amount);
    const v = amt * vatShare(p.invoice != null ? invById.get(p.invoice) : undefined);
    const m = by.get(ymOf(p.payment_date));
    if (m) m.revenue += amt - v;
    revenue += amt - v;
    vat += v;
    paymentCount += 1;
  }
  for (const e of d.expenses) {
    if (!inPeriod(e.expense_date, period)) continue;
    const m = by.get(ymOf(e.expense_date));
    if (isApproved(e)) {
      costs += num(e.amount);
      if (m) m.costs += num(e.amount);
    } else if (isPending(e)) {
      pending += num(e.amount);
      pendingCount += 1;
      if (m) m.pending += num(e.amount);
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

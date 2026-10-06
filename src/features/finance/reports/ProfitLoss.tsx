import { useState } from 'react';
import {
  BASIS_LABEL,
  CATEGORY_LABEL,
  DIRECT,
  OVERHEADS,
  basisText as basisLine,
  catLabel,
  expenseNet,
  inPeriod,
  isPending,
  isRejected,
  money,
  monthLabel,
  monthsIn,
  periodText,
  plural,
  priorPeriod,
  revenueByMonth,
  shownMonths,
  trimNote,
  ymOf,
  type Period,
  type RevenueBasis,
} from '@/lib/ledger';
import type { Ledger } from '@/lib/useLedger';
import { statementCsv } from './export';
import type { ReportProps } from './library';
import type { SRow, Statement } from './types';
import { Check, Choice, PeriodControl, ReportFrame, StatementTable, usePeriod } from './ui';

type Basis = RevenueBasis;
type Range = { from: string; to: string };

/** Revenue excluding VAT by month, on the chosen basis (accrual nets issued
 *  credit notes, cash leaves out overpayments). */
function revenue(d: Ledger, basis: Basis, r: Range) {
  const x = revenueByMonth(d, basis, r);
  const invM = new Map<string, number>();
  const cnM = new Map<string, number>();
  x.entries.forEach((e) => {
    const m = ymOf(e.date);
    const map = e.kind === 'credit' ? cnM : invM;
    map.set(m, (map.get(m) || 0) + e.excl);
  });
  const credited = -x.credits.reduce((s, c) => s + c.excl, 0);
  return {
    byMonth: x.byMonth,
    invM,
    cnM,
    excl: x.excl,
    vat: x.vat,
    incl: x.incl,
    count: x.entries.length,
    invoices: x.invoices,
    creditCount: x.credits.length,
    credited,
    over: x.over,
  };
}

/** Costs: every expense that is not rejected (approved and pending), net of
 *  its input VAT, by category and month. */
function costs(d: Ledger, r: Range) {
  const byCat = new Map<string, Map<string, number>>();
  d.expenses
    .filter((e) => !isRejected(e) && inPeriod(e.expense_date, r))
    .forEach((e) => {
      const c = (e.category || 'OTHER').toUpperCase();
      const m = ymOf(e.expense_date);
      const row = byCat.get(c) || new Map<string, number>();
      row.set(m, (row.get(m) || 0) + expenseNet(e));
      byCat.set(c, row);
    });
  return byCat;
}
const sumMap = (m?: Map<string, number>) => [...(m?.values() ?? [])].reduce((s, v) => s + v, 0);

export function ProfitLoss({ d, companyName, initialPeriod }: ReportProps) {
  const [period, setPeriod] = usePeriod('last-12', initialPeriod);
  const [basis, setBasis] = useState<Basis>('cash');

  const t = build(d, period, basis);
  const basisText = basisLine(basis).replace(/^e/, 'E');

  return (
    <ReportFrame
      title="Profit and loss"
      sub={`${periodText(period)} · ${basisLine(basis)}`}
      companyName={companyName}
      info={[
        basis === 'cash'
          ? 'Cash (received): money received from customers, by payment date, excluding the VAT share of each invoice. Any amount paid above an invoice total is not revenue.'
          : 'Accrual (invoiced): invoices issued (not drafts or void), by issue date, excluding VAT, less issued credit notes on their own date.',
        'Costs: every expense that is not rejected (approved or awaiting approval), by expense date, excluding its input VAT. Rejected expenses are left out.',
        'Direct costs: fuel, tolls, driver costs, subcontractors, maintenance. Overheads: insurance, admin and the rest.',
        'The line below the result shows how much of the costs is still awaiting approval; it is already deducted.',
        'Prior: the same number of months immediately before.',
      ]}
      controls={
        <>
          <PeriodControl period={period} onChange={setPeriod} />
          <Choice
            label="Basis"
            value={basis}
            onChange={setBasis}
            options={[
              { id: 'cash', label: BASIS_LABEL.cash },
              { id: 'accrual', label: BASIS_LABEL.accrual },
            ]}
          />
        </>
      }
      table={t.table}
      gaps={t.trimmed ? [t.trimmed] : undefined}
      csv={() => statementCsv(`Profit and loss, ${periodText(period)}`, basisText, t.table)}
      csvName={`profit-and-loss-${period.from}-to-${period.to}-${basis}`}
    >
      <StatementTable
        table={t.table}
        caption={`Profit and loss, ${periodText(period)}`}
        footer={t.check}
        fit
        pinLast={!t.showPrior}
      />
    </ReportFrame>
  );
}

function build(d: Ledger, period: Period, basis: Basis) {
  const allMonths = monthsIn(period.from, period.to);
  const prior = priorPeriod(period);
  const rNow = revenue(d, basis, period);
  const rPrev = revenue(d, basis, prior);
  const cNow = costs(d, period);
  const cPrev = costs(d, prior);
  const pendingList = d.expenses.filter((e) => isPending(e) && inPeriod(e.expense_date, period));
  const pendingByMonth = new Map<string, number>();
  pendingList.forEach((e) => {
    const m = ymOf(e.expense_date);
    pendingByMonth.set(m, (pendingByMonth.get(m) || 0) + expenseNet(e));
  });
  const pendingPrev = d.expenses
    .filter((e) => isPending(e) && inPeriod(e.expense_date, prior))
    .reduce((s, e) => s + expenseNet(e), 0);

  // Columns end at the last month with any entry; totals still cover the whole
  // period. The prior comparison shows only when the prior period holds entries.
  const months = shownMonths(
    allMonths,
    (m) => rNow.byMonth.has(m) || pendingByMonth.has(m) || [...cNow.values()].some((x) => x.has(m)),
  );
  const showPrior = rPrev.count > 0 || cPrev.size > 0 || pendingPrev > 0.005;
  const known = new Set([...DIRECT, ...OVERHEADS]);
  const extra = [...new Set([...cNow.keys(), ...cPrev.keys()])].filter((c) => !known.has(c)).sort();
  // The four classic direct lines always show; newer categories only when used.
  const direct = DIRECT.filter(
    (c) => ['FUEL', 'TOLLS', 'DRIVER', 'MAINTENANCE'].includes(c) || cNow.has(c) || cPrev.has(c),
  );
  const overheads = [...OVERHEADS, ...extra];

  const line = (
    label: string,
    get: (m: string) => number,
    now: number,
    prev: number,
    kind: SRow['kind'] = 'row',
    indent = false,
  ): SRow => ({
    key: `${kind}-${label}`,
    kind,
    indent,
    cells: [label, ...months.map(get), now, ...(showPrior ? [prev, now - prev] : [])],
  });
  const catRow = (c: string) =>
    line(
      CATEGORY_LABEL[c] ?? catLabel(c),
      (m) => cNow.get(c)?.get(m) || 0,
      sumMap(cNow.get(c)),
      sumMap(cPrev.get(c)),
      'row',
      true,
    );
  const group = (cats: string[], map: Map<string, Map<string, number>>) => ({
    m: (month: string) => cats.reduce((s, c) => s + (map.get(c)?.get(month) || 0), 0),
    total: cats.reduce((s, c) => s + sumMap(map.get(c)), 0),
  });
  const dNow = group(direct, cNow);
  const dPrev = group(direct, cPrev);
  const oNow = group(overheads, cNow);
  const oPrev = group(overheads, cPrev);
  const rev = rNow.excl;
  const prevRev = rPrev.excl;
  const gross = rev - dNow.total;
  const prevGross = prevRev - dPrev.total;
  const net = gross - oNow.total;
  const prevNet = prevGross - oPrev.total;
  const revM = (m: string) => rNow.byMonth.get(m) || 0;
  const grossM = (m: string) => revM(m) - dNow.m(m);
  const netM = (m: string) => grossM(m) - oNow.m(m);
  const ratio = (label: string, f: (m: string) => number, now: number, prev: number): SRow => ({
    key: `ratio-${label}`,
    kind: 'ratio',
    fmt: 'pct',
    cells: [
      label,
      ...months.map((m) => (revM(m) > 0 ? (f(m) / revM(m)) * 100 : null)),
      rev > 0 ? (now / rev) * 100 : null,
      ...(showPrior ? [prevRev > 0 ? (prev / prevRev) * 100 : null, null] : []),
    ],
  });

  const pending = pendingList.reduce((s, e) => s + expenseNet(e), 0);
  const rows: SRow[] = [
    { key: 's-rev', kind: 'section', cells: ['Revenue'] },
    ...(basis === 'accrual' && (rNow.creditCount > 0 || rPrev.creditCount > 0)
      ? [
          line('Sales invoiced', (m) => rNow.invM.get(m) || 0, rev + rNow.credited, prevRev + rPrev.credited, 'row', true),
          line('Less credit notes', (m) => rNow.cnM.get(m) || 0, -rNow.credited, -rPrev.credited, 'row', true),
        ]
      : [line(basis === 'cash' ? 'Sales received' : 'Sales invoiced', revM, rev, prevRev, 'row', true)]),
    line('Total revenue', revM, rev, prevRev, 'subtotal'),
    { key: 's-direct', kind: 'section', cells: ['Direct costs'] },
    ...direct.map(catRow),
    line('Total direct costs', dNow.m, dNow.total, dPrev.total, 'subtotal'),
    line('Gross profit', grossM, gross, prevGross, 'total'),
    ratio('Gross margin', grossM, gross, prevGross),
    { key: 's-over', kind: 'section', cells: ['Overheads'] },
    ...overheads.map(catRow),
    line('Total overheads', oNow.m, oNow.total, oPrev.total, 'subtotal'),
    line('Net profit', netM, net, prevNet, 'grand'),
    ratio('Net margin', netM, net, prevNet),
    line(
      `Of the costs, awaiting approval (${pendingList.length})`,
      (m) => pendingByMonth.get(m) || 0,
      pending,
      pendingPrev,
      'muted',
    ),
  ];

  const table: Statement = {
    columns: [
      { label: 'Account' },
      ...months.map((m) => ({ label: monthLabel(m), type: 'money' as const })),
      { label: 'Total', type: 'money' as const },
      ...(showPrior
        ? [
            { label: `Prior ${allMonths.length} months`, type: 'money' as const },
            { label: 'Change', type: 'money' as const },
          ]
        : []),
    ],
    rows,
  };

  const check =
    basis === 'cash' ? (
      <Check>
        Total revenue plus VAT {money(rNow.vat)} equals {money(rNow.incl)} received, {plural(rNow.count, 'payment')}
        {rNow.over > 0.005 ? `; ${money(rNow.over)} paid above invoice totals is left out` : ''}.
      </Check>
    ) : (
      <Check>
        Total revenue plus VAT {money(rNow.vat)} equals {money(rNow.incl)} invoiced, {plural(rNow.invoices, 'invoice')}
        {rNow.creditCount ? `, less ${plural(rNow.creditCount, 'credit note')}` : ''}.
      </Check>
    );

  return { table, check, showPrior, trimmed: trimNote(allMonths, months) };
}

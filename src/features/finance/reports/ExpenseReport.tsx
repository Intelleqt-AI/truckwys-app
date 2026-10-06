import { useState } from 'react';
import {
  catLabel,
  expenseNet,
  expenseVat,
  inPeriod,
  isApproved,
  isPending,
  moneyWhole,
  pct,
  periodText,
  plural,
  type Expense,
} from '@/lib/ledger';
import { statementCsv } from './export';
import type { ReportProps } from './library';
import type { SRow, Statement } from './types';
import { Check, Choice, Empty, PeriodControl, ReportFrame, StatementTable, usePeriod } from './ui';

type ExpView = 'category' | 'vehicle' | 'register';

export function ExpenseReport(props: ReportProps) {
  const { d, companyName } = props;
  const [period, setPeriod] = usePeriod('last-12');
  const [view, setView] = useState<ExpView>('category');

  const list = d.expenses.filter((e) => inPeriod(e.expense_date, period) && (isApproved(e) || isPending(e)));
  const approved = list.filter(isApproved);
  const pending = list.filter(isPending);
  const rejected = d.expenses.filter((e) => inPeriod(e.expense_date, period) && !isApproved(e) && !isPending(e));
  // Costs are net of their input VAT (amount − vat_amount), as in the P&L.
  const sum = (l: Expense[]) => l.reduce((s, e) => s + expenseNet(e), 0);
  const vatOf = (l: Expense[]) => l.reduce((s, e) => s + expenseVat(e), 0);
  const aTotal = sum(approved);
  const pTotal = sum(pending);
  const vehicleName = (id: number | null) => {
    if (id == null) return 'No vehicle linked';
    const veh = d.vehicles.find((x) => x.id === id);
    return veh ? [veh.plate, [veh.make, veh.model].filter(Boolean).join(' ')].filter(Boolean).join(', ') : `Vehicle ${id}`;
  };

  const grouped = (keyOf: (e: Expense) => string, labelOf: (k: string) => string) => {
    const keys = [...new Set(list.map(keyOf))];
    return keys
      .map((k) => {
        const l = list.filter((e) => keyOf(e) === k);
        const a = sum(l.filter(isApproved));
        return { k, label: labelOf(k), count: l.length, a, v: vatOf(l.filter(isApproved)), p: sum(l.filter(isPending)) };
      })
      .sort((x, y) => y.a - x.a || y.p - x.p);
  };
  const byCat = grouped((e) => (e.category || 'OTHER').toUpperCase(), catLabel);
  const byVeh = grouped(
    (e) => (e.vehicle == null ? 'none' : String(e.vehicle)),
    (k) => vehicleName(k === 'none' ? null : Number(k)),
  ).sort((x, y) => (x.k === 'none' ? 1 : 0) - (y.k === 'none' ? 1 : 0) || y.a - x.a);

  const groupTable = (rows: typeof byCat, head: string): Statement => ({
    columns: [
      { label: head },
      { label: 'Expenses', type: 'int', phone: false },
      { label: 'Approved excl. VAT', type: 'money' },
      { label: 'Input VAT', type: 'money', phone: false },
      { label: 'Share', type: 'pct' },
      { label: 'Pending excl. VAT', type: 'money' },
    ],
    rows: [
      ...rows.map<SRow>((r) => ({
        key: r.k,
        kind: r.k === 'none' ? 'muted' : undefined,
        cells: [r.label, r.count, r.a, r.v, aTotal > 0 ? (r.a / aTotal) * 100 : null, r.p],
      })),
      { key: 'tot', kind: 'grand', cells: ['Total', list.length, aTotal, vatOf(approved), aTotal > 0 ? 100 : null, pTotal] },
    ],
  });
  const register: Statement = {
    columns: [
      { label: 'Date', type: 'date' },
      { label: 'Number' },
      { label: 'Category' },
      { label: 'Vehicle' },
      { label: 'Supplier or detail' },
      { label: 'Status' },
      { label: 'Excl. VAT', type: 'money' },
      { label: 'Input VAT', type: 'money' },
    ],
    rows: [
      ...[...list]
        .sort((a, b) => a.expense_date.localeCompare(b.expense_date))
        .map<SRow>((e) => ({
          key: `x${e.id}`,
          kind: isPending(e) ? 'muted' : undefined,
          cells: [
            e.expense_date,
            e.expense_number || `EXP-${e.id}`,
            catLabel(e.category),
            e.vehicle != null ? (vehicleName(e.vehicle).split(',')[0] ?? '') : '',
            e.supplier_name || e.vendor || e.description || '',
            isPending(e) ? 'Pending' : 'Approved',
            expenseNet(e),
            expenseVat(e),
          ],
        })),
      { key: 'tot-a', kind: 'subtotal', cells: ['Approved', '', '', '', plural(approved.length, 'expense'), '', aTotal, vatOf(approved)] },
      { key: 'tot-p', kind: 'muted', cells: ['Pending', '', '', '', plural(pending.length, 'expense'), '', pTotal, vatOf(pending)] },
      { key: 'tot', kind: 'grand', cells: ['Total', '', '', '', plural(list.length, 'expense'), '', aTotal + pTotal, vatOf(list)] },
    ],
  };
  const table = view === 'register' ? register : view === 'vehicle' ? groupTable(byVeh, 'Vehicle') : groupTable(byCat, 'Category');
  const noVehicle = approved.filter((e) => e.vehicle == null);
  const topCat = byCat[0];

  return (
    <ReportFrame
      title="Expense report"
      sub={`${periodText(period)} · excl. VAT`}
      companyName={companyName}
      info={[
        'Expenses by expense date. Approved and pending expenses both count as costs in the profit and loss; pending ones are shown apart so they can be approved.',
        'Amounts exclude input VAT (the VAT inside each expense, from its tax code); input VAT is shown beside them and in the VAT report.',
        `${plural(rejected.length, 'rejected expense')} in the period ${rejected.length === 1 ? 'is' : 'are'} left out.`,
      ]}
      controls={
        <>
          <PeriodControl period={period} onChange={setPeriod} />
          <Choice
            label="View"
            value={view}
            onChange={setView}
            options={[
              { id: 'category', label: 'By category' },
              { id: 'vehicle', label: 'By vehicle' },
              { id: 'register', label: 'Register' },
            ]}
          />
        </>
      }
      tiles={
        list.length
          ? [
              { label: 'Approved excl. VAT', value: moneyWhole(aTotal), note: plural(approved.length, 'expense'), amount: aTotal },
              { label: 'Pending approval', value: moneyWhole(pTotal), note: plural(pending.length, 'expense'), amount: pTotal },
              {
                label: 'Largest category',
                value: moneyWhole(topCat?.a ?? 0),
                note: topCat ? `${topCat.label}, ${pct(aTotal > 0 ? (topCat.a / aTotal) * 100 : 0, 0)}` : undefined,
                amount: topCat?.a ?? 0,
              },
              {
                label: 'Not linked to a vehicle',
                value: moneyWhole(sum(noVehicle)),
                note: plural(noVehicle.length, 'approved expense'),
                amount: sum(noVehicle),
              },
            ]
          : undefined
      }
      table={table}
      csv={() => statementCsv(`Expense report, ${periodText(period)}`, view === 'register' ? 'Register' : `By ${view}`, table)}
      csvName={`expenses-${view}-${period.from}-to-${period.to}`}
    >
      {list.length === 0 ? (
        <Empty line={`No expenses dated in ${periodText(period)}.`} />
      ) : (
        <StatementTable
          fit
          table={table}
          caption={`Expenses ${view === 'register' ? 'register' : `by ${view}`}`}
          footer={
            <Check>
              Approved plus pending equals the costs in the profit and loss for {periodText(period)}; rejected expenses are left
              out of both.
            </Check>
          }
        />
      )}
    </ReportFrame>
  );
}

export default ExpenseReport;

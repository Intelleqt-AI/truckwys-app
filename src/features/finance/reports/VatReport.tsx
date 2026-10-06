import { Fragment, useState } from 'react';
import { SectionLabel } from '@/components/ui';
import {
  expenseNet,
  expenseVat,
  inPeriod,
  isPending,
  isRejected,
  money,
  moneyWhole,
  monthLabel,
  monthsIn,
  num,
  periodText,
  plural,
  revenueEntries,
  shownMonths,
  trimNote,
  ymOf,
} from '@/lib/ledger';
import { statementCsv } from './export';
import type { ReportProps } from './library';
import type { SRow, Statement } from './types';
import { Check, Choice, Empty, PeriodControl, ReportFrame, StatementTable, usePeriod } from './ui';

type VatBasis = 'invoice' | 'payments';
type VatView = 'month' | 'invoice';

/**
 * Output VAT: VAT on issued invoices less VAT on issued credit notes (invoice
 * basis), or the VAT share of each payment (payments basis). Input VAT: the
 * VAT inside every expense that is not rejected, by expense date. Net VAT =
 * output − input.
 */
export function VatReport(props: ReportProps) {
  const { d, companyName, vatNumber } = props;
  const [period, setPeriod] = usePeriod('last-12');
  const [basis, setBasis] = useState<VatBasis>('invoice');
  const [view, setView] = useState<VatView>('month');
  const allMonths = monthsIn(period.from, period.to);

  // Output: one line per supply (invoice, credit note or payment), signed.
  const lines = revenueEntries(d, basis === 'invoice' ? 'accrual' : 'cash', period)
    .map((e) => ({ date: e.date, ref: e.ref, party: e.party, incl: e.incl, vat: e.vat }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const incl = lines.reduce((s, l) => s + l.incl, 0);
  const vat = lines.reduce((s, l) => s + l.vat, 0);
  const zeroRated = lines.filter((l) => l.incl > 0 && l.vat < 0.005);
  const creditLines = lines.filter((l) => l.incl < 0).length;

  // Input: expenses that are not rejected, by expense date.
  const purchases = d.expenses
    .filter((e) => !isRejected(e) && inPeriod(e.expense_date, period))
    .sort((a, b) => a.expense_date.localeCompare(b.expense_date));
  const inputVat = purchases.reduce((s, e) => s + expenseVat(e), 0);
  const netVat = vat - inputVat;
  const noVatPurchases = purchases.filter((e) => expenseVat(e) < 0.005 && (e.tax_code ?? 'STANDARD') === 'STANDARD');

  // Rows end at the last month with an entry; the total covers the whole period.
  const months = shownMonths(allMonths, (m) => lines.some((l) => ymOf(l.date) === m) || purchases.some((e) => ymOf(e.expense_date) === m));
  const trimmed = view === 'month' ? trimNote(allMonths, months) : null;

  const tables: Statement[] =
    view === 'month'
      ? [
          {
            columns: [
              { label: 'Month' },
              { label: 'Supplies excl. VAT', type: 'money', phone: false },
              { label: 'Output VAT', type: 'money' },
              { label: 'Input VAT', type: 'money' },
              { label: 'Net VAT', type: 'money' },
            ],
            rows: [
              ...months.map<SRow>((m) => {
                const l = lines.filter((x) => ymOf(x.date) === m);
                const a = l.reduce((s, x) => s + x.incl, 0);
                const v = l.reduce((s, x) => s + x.vat, 0);
                const iv = purchases.filter((e) => ymOf(e.expense_date) === m).reduce((s, e) => s + expenseVat(e), 0);
                return { key: m, cells: [monthLabel(m), a - v, v, iv, v - iv] };
              }),
              { key: 'tot', kind: 'grand', cells: ['Total', incl - vat, vat, inputVat, netVat] },
            ],
          },
        ]
      : [
          {
            columns: [
              { label: 'Date', type: 'date' },
              { label: 'Reference' },
              { label: 'Customer' },
              { label: 'Excl. VAT', type: 'money' },
              { label: 'Output VAT', type: 'money' },
              { label: 'Incl. VAT', type: 'money' },
            ],
            rows: [
              ...lines.map<SRow>((l, i) => ({ key: `l${i}`, cells: [l.date, l.ref, l.party, l.incl - l.vat, l.vat, l.incl] })),
              { key: 'tot', kind: 'grand', cells: ['Output VAT', plural(lines.length, 'line'), '', incl - vat, vat, incl] },
            ],
          },
          {
            columns: [
              { label: 'Date', type: 'date' },
              { label: 'Expense' },
              { label: 'Supplier' },
              { label: 'Excl. VAT', type: 'money' },
              { label: 'Input VAT', type: 'money' },
              { label: 'Incl. VAT', type: 'money' },
            ],
            rows: [
              ...purchases.map<SRow>((e) => ({
                key: `e${e.id}`,
                kind: isPending(e) ? 'muted' : undefined,
                cells: [e.expense_date, e.expense_number || `EXP-${e.id}`, e.supplier_name || e.vendor || e.description || '', expenseNet(e), expenseVat(e), num(e.amount)],
              })),
              {
                key: 'tot-in',
                kind: 'grand',
                cells: ['Input VAT', plural(purchases.length, 'expense'), '', purchases.reduce((s, e) => s + expenseNet(e), 0), inputVat, purchases.reduce((s, e) => s + num(e.amount), 0)],
              },
            ],
          },
        ];
  const basisLabel = basis === 'invoice' ? 'Invoice basis' : 'Payments basis';

  const checks = (
    <>
      <Check>
        Net VAT {money(netVat)} is output VAT {money(vat)} less input VAT {money(inputVat)}.
      </Check>
      {zeroRated.length > 0 && <Check ok={false}>{plural(zeroRated.length, 'supply', 'supplies')} carry no VAT. Check they are zero-rated.</Check>}
      {noVatPurchases.length > 0 && (
        <Check ok={false}>{plural(noVatPurchases.length, 'standard-rated expense')} show no input VAT. Check the amounts.</Check>
      )}
    </>
  );

  return (
    <ReportFrame
      title="VAT report"
      sub={`${periodText(period)} · output and input VAT`}
      companyName={companyName}
      info={[
        'Output VAT, invoice basis: VAT on issued invoices (not drafts or void) by issue date, less VAT on issued credit notes by their own date.',
        'Output VAT, payments basis: VAT in each customer payment, in the same proportion as its invoice, by payment date.',
        'Input VAT: the VAT inside each expense that is not rejected (approved and pending), by expense date. Only standard-rated expenses carry input VAT.',
        'Net VAT is output VAT less input VAT: what would be payable (or refundable) for the period. Check it with your accountant before filing.',
        vatNumber ? `VAT number on your company profile: ${vatNumber}.` : 'No VAT number on your company profile.',
      ]}
      controls={
        <>
          <PeriodControl period={period} onChange={setPeriod} />
          <Choice
            label="Basis"
            value={basis}
            onChange={setBasis}
            options={[
              { id: 'invoice', label: 'Invoice basis' },
              { id: 'payments', label: 'Payments basis' },
            ]}
          />
          <Choice
            label="View"
            value={view}
            onChange={setView}
            options={[
              { id: 'month', label: 'By month' },
              { id: 'invoice', label: 'By line' },
            ]}
          />
        </>
      }
      tiles={
        lines.length || purchases.length
          ? [
              { label: 'Output VAT', value: moneyWhole(vat), note: basisLabel + (creditLines ? `, after ${plural(creditLines, 'credit note')}` : ''), amount: vat },
              { label: 'Input VAT', value: moneyWhole(inputVat), note: plural(purchases.length, 'expense'), amount: inputVat },
              { label: netVat >= 0 ? 'Net VAT payable' : 'Net VAT refundable', value: moneyWhole(Math.abs(netVat)), note: 'Output less input', amount: netVat },
            ]
          : undefined
      }
      table={tables}
      gaps={trimmed ? [trimmed] : undefined}
      csv={() =>
        tables.flatMap((t, i) =>
          statementCsv(
            i === 0 ? `VAT report, ${periodText(period)}` : 'Input VAT',
            i === 0 ? `Output VAT, ${basisLabel}; input VAT by expense date` : 'Expenses by expense date',
            t,
          ),
        )
      }
      csvName={`vat-${basis}-${period.from}-to-${period.to}`}
    >
      {lines.length === 0 && purchases.length === 0 ? (
        <Empty line={`No ${basis === 'invoice' ? 'invoices issued' : 'payments received'} or expenses in ${periodText(period)}.`} />
      ) : (
        <>
          {tables.map((t, i) => (
            <Fragment key={i}>
              {view === 'invoice' && <SectionLabel>{i === 0 ? 'Output VAT' : 'Input VAT'}</SectionLabel>}
              <StatementTable
                fit
                table={t}
                caption={view === 'month' ? 'Output and input VAT' : i === 0 ? 'Output VAT' : 'Input VAT'}
                footer={i === tables.length - 1 ? checks : undefined}
              />
            </Fragment>
          ))}
        </>
      )}
    </ReportFrame>
  );
}

export default VatReport;

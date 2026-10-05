import {
  inPeriod,
  isCreditIssued,
  isDraft,
  isIssued,
  moneyWhole,
  monthLabel,
  monthsIn,
  num,
  pct,
  periodText,
  plural,
  shownMonths,
  trimNote,
  ymOf,
  type CreditNoteRec,
  type Invoice,
} from '@/lib/ledger';
import { statementCsv } from './export';
import type { ReportProps } from './library';
import type { SRow, Statement, Tile } from './types';
import { Check, Empty, PeriodControl, ReportFrame, StatementTable, usePeriod } from './ui';

export function SalesByMonth({ d, companyName }: ReportProps) {
  const [period, setPeriod] = usePeriod('last-12');
  const allMonths = monthsIn(period.from, period.to);
  const issued = d.invoices.filter((i) => isIssued(i) && inPeriod(i.issue_date, period));
  // Issued credit notes reduce revenue in their own month (accrual, as the backend).
  const credits = (d.creditNotes ?? []).filter((c) => isCreditIssued(c) && inPeriod(c.issue_date, period));
  // Rows end at the last month with an invoice or credit note; the total covers the whole period.
  const months = shownMonths(
    allMonths,
    (m) => issued.some((i) => ymOf(i.issue_date) === m) || credits.some((c) => ymOf(c.issue_date) === m),
  );
  const trimmed = trimNote(allMonths, months);
  const drafts = d.invoices.filter((i) => isDraft(i) && inPeriod(i.issue_date, period));

  const rowFor = (label: string, list: Invoice[], cns: CreditNoteRec[], kind?: SRow['kind'], key = label): SRow => {
    const incl = list.reduce((s, i) => s + num(i.total_amount), 0);
    const vat = list.reduce((s, i) => s + num(i.vat_amount), 0);
    const cnExcl = cns.reduce((s, c) => s + num(c.subtotal), 0);
    const cnVat = cns.reduce((s, c) => s + num(c.vat_amount), 0);
    const paid = list.reduce((s, i) => s + num(i.paid_amount), 0);
    const bal = list.reduce((s, i) => s + num(i.balance), 0);
    return { key, kind, cells: [label, list.length, incl - vat, cnExcl ? -cnExcl : 0, incl - vat - cnExcl, vat - cnVat, paid, bal] };
  };
  const inMonth = (m: string): [Invoice[], CreditNoteRec[]] => [
    issued.filter((i) => ymOf(i.issue_date) === m),
    credits.filter((c) => ymOf(c.issue_date) === m),
  ];
  const issuedVat = issued.reduce((s, i) => s + num(i.vat_amount), 0);
  const excl =
    issued.reduce((s, i) => s + num(i.total_amount) - num(i.vat_amount), 0) -
    credits.reduce((s, c) => s + num(c.subtotal), 0);
  const incl = issued.reduce((s, i) => s + num(i.total_amount), 0);
  const paid = issued.reduce((s, i) => s + num(i.paid_amount), 0);
  const draftExcl = drafts.reduce((s, i) => s + num(i.total_amount) - num(i.vat_amount), 0);
  const avgInvoice = issued.length ? (incl - issuedVat) / issued.length : 0;

  const table: Statement = {
    columns: [
      { label: 'Month' },
      { label: 'Invoices', type: 'int', phone: false },
      { label: 'Invoiced excl. VAT', type: 'money', phone: false },
      { label: 'Credit notes excl. VAT', type: 'money', phone: false },
      { label: 'Revenue excl. VAT', type: 'money' },
      { label: 'VAT', type: 'money', phone: false },
      { label: 'Paid to date', type: 'money', phone: false },
      { label: 'Still owed', type: 'money' },
    ],
    rows: [
      ...months.map((m) => {
        const [l, c] = inMonth(m);
        return rowFor(monthLabel(m), l, c, undefined, m);
      }),
      rowFor('Total', issued, credits, 'grand', 'tot'),
      ...(drafts.length
        ? [{ key: 'drafts', kind: 'muted' as const, cells: ['Drafts, not issued', drafts.length, draftExcl, '', '', '', '', ''] }]
        : []),
    ],
  };

  const tiles: Tile[] = issued.length
    ? [
        {
          label: 'Revenue excl. VAT',
          value: moneyWhole(excl),
          note: plural(issued.length, 'invoice') + (credits.length ? `, ${plural(credits.length, 'credit note')}` : ''),
          amount: excl,
        },
        {
          label: 'Average invoice excl. VAT',
          value: moneyWhole(avgInvoice),
          note: `Across ${plural(issued.length, 'invoice')}`,
          amount: avgInvoice,
        },
        {
          label: 'Collected so far',
          value: pct(incl > 0 ? (paid / incl) * 100 : 0, 0),
          note: `${moneyWhole(paid)} paid, incl. VAT`,
          noteAmount: paid,
          noteFallback: 'Of sales incl. VAT, paid to date',
        },
      ]
    : [];

  return (
    <ReportFrame
      title="Sales by month"
      sub={`${periodText(period)} · excl. VAT, accrual (invoiced)`}
      companyName={companyName}
      info={[
        'Accrual (invoiced): every issued invoice (not drafts or void) by issue date, less issued credit notes in the month of the credit note.',
        'Revenue is excl. VAT and matches the Profit and loss on the accrual basis.',
        'Paid to date and still owed are incl. VAT, as at today, for the invoices issued in that month; still owed is after credit notes.',
        'Drafts are listed below the total and not counted.',
      ]}
      controls={<PeriodControl period={period} onChange={setPeriod} />}
      gaps={trimmed ? [trimmed] : undefined}
      tiles={tiles}
      table={table}
      csv={() =>
        statementCsv(
          `Sales by month, ${periodText(period)}`,
          'Accrual (invoiced): issued invoices by issue date less credit notes, excl. VAT',
          table,
        )
      }
      csvName={`sales-by-month-${period.from}-to-${period.to}`}
    >
      {issued.length === 0 && credits.length === 0 ? (
        <Empty line={`No invoices issued in ${periodText(period)}.`} />
      ) : (
        <StatementTable
          table={table}
          caption="Sales by month"
          footer={
            <Check>
              Revenue equals the {plural(issued.length, 'issued invoice')} dated in the period
              {credits.length ? ` less ${plural(credits.length, 'credit note')}` : ''}, excl. VAT.
            </Check>
          }
        />
      )}
    </ReportFrame>
  );
}

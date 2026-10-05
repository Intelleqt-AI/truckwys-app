import { useState } from 'react';
import {
  BASIS_LABEL,
  basisText as basisLine,
  moneyWhole,
  money,
  pct,
  periodText,
  plural,
  revenueEntries,
  type RevenueBasis,
} from '@/lib/ledger';
import { statementCsv } from './export';
import type { ReportProps } from './library';
import type { SRow, Statement } from './types';
import { Check, Choice, Empty, PeriodControl, ReportFrame, StatementTable, usePeriod } from './ui';

type Acc = { key: string; name: string; id: number | null; count: number; excl: number; vat: number };

export function RevenueByCustomer({ d, companyName, openStatement }: ReportProps) {
  const [period, setPeriod] = usePeriod('last-12');
  const [basis, setBasis] = useState<RevenueBasis>('accrual');

  const acc = new Map<string, Acc>();
  // Revenue as the P&L and the backend count it: accrual nets credit notes
  // against the customer; cash leaves out amounts paid above an invoice total.
  const entries = revenueEntries(d, basis, period);
  entries.forEach((e) => {
    const k = e.customer != null ? `c${e.customer}` : `n${e.party}`;
    const a = acc.get(k) || { key: k, name: e.party || 'Unknown customer', id: e.customer, count: 0, excl: 0, vat: 0 };
    a.count += 1;
    a.excl += e.excl;
    a.vat += e.vat;
    acc.set(k, a);
  });
  const sourceCount = entries.length;
  const sourceTotal = entries.reduce((s2, e) => s2 + e.incl, 0);
  const credits = entries.filter((e) => e.kind === 'credit').length;
  const rows = [...acc.values()].sort((a, b) => b.excl - a.excl);
  const excl = rows.reduce((s, r) => s + r.excl, 0);
  const vat = rows.reduce((s, r) => s + r.vat, 0);
  const noun = basis === 'accrual' ? (credits ? 'Documents' : 'Invoices') : 'Payments';
  const nounOne = basis === 'accrual' ? (credits ? 'invoice or credit note' : 'invoice') : 'payment';
  const nounMany = basis === 'accrual' ? (credits ? 'invoices and credit notes' : 'invoices') : 'payments';
  const table: Statement = {
    columns: [
      { label: 'Customer' },
      { label: noun, type: 'int', phone: false },
      { label: 'Excl. VAT', type: 'money', phone: false },
      { label: 'VAT', type: 'money', phone: false },
      { label: basis === 'accrual' ? 'Incl. VAT' : 'Received', type: 'money' },
      { label: 'Share', type: 'pct' },
    ],
    rows: [
      ...rows.map<SRow>((r) => ({
        key: r.key,
        cells: [r.name, r.count, r.excl, r.vat, r.excl + r.vat, excl > 0 ? (r.excl / excl) * 100 : null],
        onPress: r.id != null ? () => openStatement(r.id!) : undefined,
      })),
      { key: 'tot', kind: 'grand', cells: ['Total', sourceCount, excl, vat, excl + vat, excl > 0 ? 100 : null] },
    ],
  };
  const top = rows[0];
  const top3 = rows.slice(0, 3).reduce((s, r) => s + r.excl, 0);
  const basisText =
    basis === 'accrual'
      ? 'Accrual (invoiced), by issue date, net of credit notes, excl. VAT'
      : 'Cash (received), by payment date, excl. VAT';
  const issuedWord = basis === 'accrual' ? 'issued' : 'received';

  return (
    <ReportFrame
      title="Revenue by customer"
      sub={`${periodText(period)} · ${basisLine(basis)}`}
      companyName={companyName}
      info={[
        'Accrual (invoiced): issued invoices (not drafts or void) by issue date, less issued credit notes on their own date.',
        'Cash (received): customer payments by payment date, VAT split in the same proportion as the invoice; amounts paid above an invoice total are left out.',
        'Share is of revenue excluding VAT. Select a customer to open their statement.',
      ]}
      controls={
        <>
          <PeriodControl period={period} onChange={setPeriod} />
          <Choice
            label="Basis"
            value={basis}
            onChange={setBasis}
            options={[
              { id: 'accrual', label: BASIS_LABEL.accrual },
              { id: 'cash', label: BASIS_LABEL.cash },
            ]}
          />
        </>
      }
      tiles={
        rows.length
          ? [
              {
                label: 'Revenue excl. VAT',
                value: moneyWhole(excl),
                note: plural(sourceCount, nounOne, nounMany),
                amount: excl,
              },
              {
                label: 'Largest customer',
                value: moneyWhole(top?.excl ?? 0),
                note: top ? `${top.name}, ${pct(excl > 0 ? (top.excl / excl) * 100 : 0, 0)}` : undefined,
                amount: top?.excl ?? 0,
              },
              ...(rows.length > 3
                ? [
                    {
                      label: 'Top three share',
                      value: pct(excl > 0 ? (top3 / excl) * 100 : 0, 0),
                      note: `of revenue excl. VAT, ${plural(rows.length, 'customer')}`,
                    },
                  ]
                : []),
            ]
          : undefined
      }
      table={table}
      csv={() => statementCsv(`Revenue by customer, ${periodText(period)}`, basisText, table)}
      csvName={`revenue-by-customer-${period.from}-to-${period.to}-${basis}`}
    >
      {rows.length === 0 ? (
        <Empty line={`No ${basis === 'accrual' ? 'invoices issued' : 'payments received'} in ${periodText(period)}.`} />
      ) : (
        <StatementTable
          fit
          table={table}
          caption="Revenue by customer"
          footer={
            Math.abs(excl + vat - sourceTotal) < 0.01 ? (
              <Check>
                Total equals the {plural(sourceCount, nounOne, nounMany)} {issuedWord} in the period.
              </Check>
            ) : (
              <Check ok={false}>
                Total {money(excl + vat)} differs from the {plural(sourceCount, nounOne, nounMany)} {issuedWord} in the
                period ({money(sourceTotal)}).
              </Check>
            )
          }
        />
      )}
    </ReportFrame>
  );
}

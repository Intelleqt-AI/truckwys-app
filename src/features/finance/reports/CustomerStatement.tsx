import { useState } from 'react';
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import {
  addMonths,
  day,
  isCreditIssued,
  isIssued,
  isOpen,
  methodLabel,
  money,
  moneyWhole,
  monthLabel,
  num,
  plural,
  todayISO,
  ymNow,
} from '@/lib/ledger';
import { statementCsv } from './export';
import type { ReportProps } from './library';
import type { SRow, Statement } from './types';
import { Check, Choice, Empty, ReportFrame, StatementTable } from './ui';
import { ageInvoices } from './DebtorsAge';

const BUCKETS = ['Current', '1 to 30 days', '31 to 60 days', '61 to 90 days', 'Over 90 days'];

type Entry = { date: string; type: string; ref: string; due?: string; debit: number; credit: number; order: number };

function Party({ label, name, lines }: { label: string; name: string; lines: string[] }) {
  return (
    <View className="gap-0.5">
      <Txt className="text-caption uppercase text-faint">{label}</Txt>
      <Txt className="text-body font-semibold">{name}</Txt>
      {lines.map((l) => (
        <Txt key={l} className="text-caption text-muted">
          {l}
        </Txt>
      ))}
    </View>
  );
}

export function CustomerStatement({ d, companyName, vatNumber, company, initialCustomer }: ReportProps) {
  const [picked, setPicked] = useState(initialCustomer ?? '');
  const [since, setSince] = useState('');
  const sinceDate = since ? `${since}-01` : null;

  // Customers with issued invoices, largest balance first for the default.
  const withInvoices = new Map<number, { id: number; name: string; balance: number }>();
  d.invoices
    .filter((i) => isIssued(i) && i.customer != null)
    .forEach((i) => {
      const id = i.customer as number;
      const c = withInvoices.get(id) || { id, name: i.customer_name, balance: 0 };
      if (isOpen(i)) c.balance += num(i.balance);
      withInvoices.set(id, c);
    });
  const options = [...withInvoices.values()].sort((a, b) => a.name.localeCompare(b.name));
  const fallback = [...withInvoices.values()].sort((a, b) => b.balance - a.balance)[0];
  const selected = Number(picked) || fallback?.id;

  if (!options.length || selected == null) return <Empty line="No issued invoices yet." />;

  const cust = d.customers.find((c) => c.id === selected);
  const custExtra = (cust ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof custExtra[k] === 'string' ? (custExtra[k] as string) : '');
  const name = cust?.company_name || cust?.name || withInvoices.get(selected)?.name || 'Customer';
  const invoices = d.invoices.filter((i) => isIssued(i) && i.customer === selected);
  const invIds = new Set(invoices.map((i) => i.id));
  const payments = d.payments.filter((p) => (p.invoice != null ? invIds.has(p.invoice) : p.customer === selected));
  const withPayments = new Set(payments.map((p) => p.invoice));

  const entries: Entry[] = [
    ...invoices.map<Entry>((i) => ({
      date: i.issue_date,
      type: 'Invoice',
      ref: i.invoice_number,
      due: i.due_date,
      debit: num(i.total_amount),
      credit: 0,
      order: 0,
    })),
    // Issued credit notes reduce what is owed, on their own date.
    ...(d.creditNotes ?? [])
      .filter((c) => isCreditIssued(c) && invIds.has(c.invoice))
      .map<Entry>((c) => ({
        date: c.issue_date,
        type: 'Credit note',
        ref: `${c.credit_note_number} for ${c.invoice_number}`,
        debit: 0,
        credit: num(c.total_amount),
        order: 1,
      })),
    ...payments.map<Entry>((p) => ({
      date: p.payment_date,
      type: `Payment, ${methodLabel(p.payment_method)}`,
      ref: `${p.payment_number || `PMT-${p.id}`}${p.invoice_number ? ` for ${p.invoice_number}` : ''}`,
      debit: 0,
      credit: num(p.amount),
      order: 1,
    })),
    // Invoices marked paid with no payment recorded: credit on the paid date so the balance holds.
    ...invoices
      .filter((i) => (i.status || '').toUpperCase() === 'PAID' && !withPayments.has(i.id) && i.paid_at)
      .map<Entry>((i) => ({
        date: (i.paid_at as string).slice(0, 10),
        type: 'Marked paid',
        ref: i.invoice_number,
        debit: 0,
        credit: num(i.total_amount),
        order: 1,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  const before = sinceDate ? entries.filter((e) => e.date < sinceDate) : [];
  const shown = sinceDate ? entries.filter((e) => e.date >= sinceDate) : entries;
  const opening = before.reduce((s, e) => s + e.debit - e.credit, 0);
  let bal = opening;
  const invoiced = shown.reduce((s, e) => s + e.debit, 0);
  const paid = shown.reduce((s, e) => s + e.credit, 0);
  const closing = opening + invoiced - paid;

  const table: Statement = {
    columns: [
      { label: 'Date', type: 'date' },
      { label: 'Transaction' },
      { label: 'Reference' },
      { label: 'Due', type: 'date', phone: false },
      { label: 'Invoiced', type: 'money' },
      { label: 'Paid or credited', type: 'money' },
      { label: 'Balance', type: 'money' },
    ],
    rows: [
      ...(sinceDate
        ? [{ key: 'open', kind: 'subtotal' as const, cells: [sinceDate, 'Opening balance', '', '', '', '', opening] }]
        : []),
      ...shown.map<SRow>((e, i) => ({
        key: `e${i}`,
        cells: [e.date, e.type, e.ref, e.due ?? '', e.debit || '', e.credit || '', (bal += e.debit - e.credit)],
      })),
      { key: 'close', kind: 'grand', cells: [todayISO(), 'Closing balance', '', '', invoiced, paid, closing] },
    ],
  };

  const aged = ageInvoices(d, null).filter((a) => a.inv.customer === selected);
  const ageB = BUCKETS.map((_, b) => aged.filter((a) => a.bucket === b).reduce((s, a) => s + a.balance, 0));
  const openLedger = invoices.filter(isOpen).reduce((s, i) => s + num(i.balance), 0);
  const ties = Math.abs(openLedger - closing) < 0.01;
  const ageTable: Statement = {
    columns: [{ label: 'Age' }, ...BUCKETS.map((l) => ({ label: l, type: 'money' as const })), { label: 'Total due', type: 'money' as const }],
    rows: [{ key: 'age', kind: 'grand', cells: ['Amount due', ...ageB, ageB.reduce((s, v) => s + v, 0)] }],
  };
  const hasDue = ageB.some((v) => Math.abs(v) >= 0.005);

  const now = ymNow();
  const sinceOptions = [
    { id: '', label: 'All activity' },
    ...[2, 5, 11].map((n) => {
      const m = addMonths(now, -n);
      return { id: m, label: `From ${monthLabel(m)}` };
    }),
  ];
  // The city only when the address does not already end with it ("…, Port Elizabeth").
  const street = (str('billing_address') || str('address')).trim();
  const city = str('city').trim();
  const address = [street, city && !street.toLowerCase().includes(city.toLowerCase()) ? city : ''].filter(Boolean).join(', ');

  const fromName = companyName || (typeof company?.company_name === 'string' ? company.company_name : '');
  const vat = vatNumber || (typeof company?.vat_number === 'string' ? company.vat_number : '');
  const overdue = closing - (ageB[0] ?? 0);

  return (
    <ReportFrame
      title="Customer statement"
      sub="Invoices and payments, oldest first"
      companyName={fromName || undefined}
      info={[
        'Issued invoices, credit notes and recorded payments for one customer, oldest first, with the running balance. Amounts include VAT.',
        'Drafts and cancelled invoices are left out. Opening balance: everything before the start month.',
        'Print it or export it to send to the customer.',
      ]}
      controls={
        <>
          <Choice
            label="Customer"
            full
            value={String(selected)}
            onChange={setPicked}
            options={options.map((o) => ({ id: String(o.id), label: o.name }))}
          />
          <Choice label="Period" full value={since} onChange={setSince} options={sinceOptions} />
        </>
      }
      tiles={[
        { label: 'Balance due', value: moneyWhole(closing), note: plural(aged.length, 'open invoice'), amount: closing },
        { label: 'Overdue', value: moneyWhole(overdue), amount: overdue },
        {
          label: 'Invoiced',
          value: moneyWhole(invoiced),
          note: plural(shown.filter((e) => e.debit > 0).length, 'invoice'),
          amount: invoiced,
        },
        {
          label: 'Paid',
          value: moneyWhole(paid),
          note: plural(shown.filter((e) => e.credit > 0).length, 'payment'),
          amount: paid,
        },
      ]}
      table={[table, ageTable]}
      csv={() => [
        [`Statement for ${name}`],
        [`From ${fromName}${vat ? `, VAT ${vat}` : ''}`],
        [`Statement date ${todayISO()}`],
        [],
        ...statementCsv('', '', table).slice(3),
        ...(hasDue ? [[], ...statementCsv('', '', ageTable).slice(3)] : []),
      ]}
      csvName={`statement-${name}-${todayISO()}`}
    >
      <View className="mb-4 gap-4 rounded-card border border-line bg-surface p-4">
        <Party label="From" name={fromName || 'Your company'} lines={vat ? [`VAT ${vat}`] : []} />
        <Party label="To" name={name} lines={[address, cust?.email ?? ''].filter(Boolean)} />
        <Party label="Statement date" name={day(todayISO())} lines={['Amounts in rand, incl. VAT']} />
      </View>
      <StatementTable
        table={table}
        caption={`Statement for ${name}`}
        fit
        stack={{ date: 0, title: 1, ref: 2, plus: 4, minus: 5, balance: 6, balanceLabel: 'Balance' }}
        footer={
          ties ? (
            <Check>Closing balance equals the open invoice balances for {name}.</Check>
          ) : (
            <Check ok={false}>
              Closing balance differs from the open invoice balances for {name} ({money(openLedger)}).
            </Check>
          )
        }
      />
      {/* Nothing due: no row of R 0,00 buckets. */}
      {hasDue && <StatementTable table={ageTable} caption="Amount due by age" stack="pairs" />}
    </ReportFrame>
  );
}

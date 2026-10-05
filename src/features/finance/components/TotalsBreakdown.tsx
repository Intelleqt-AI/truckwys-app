import { View } from 'react-native';
import { Group, DetailRow, Txt, Mono } from '@/components/ui';
import { formatCurrency } from '@/lib/formatters';
import { addDecimals, taxCodeShort, toNumber, type TaxBucket } from '@/lib/finance/tax';
import type { Decimal } from '@/lib/finance/types';

// Totals for an invoice or credit note, laid out as the web does: discount
// first (when there is one), the subtotal excl. VAT, VAT (one row per tax code
// when the document mixes them), then the total. For a saved invoice the
// settlement rows (paid, credited, balance) follow. Every figure is passed in
// as the server's decimal string; nothing is recomputed here.

const money = (v: Decimal | number | null | undefined) => formatCurrency(toNumber(v));

function vatLabel(byCode: TaxBucket[]): string {
  const only = byCode.length === 1 ? byCode[0] : undefined;
  if (!only) return 'VAT';
  return only.code === 'STANDARD' ? taxCodeShort(only.code) : `VAT (${taxCodeShort(only.code).toLowerCase()})`;
}

export function TotalsBreakdown({
  subtotal,
  discount,
  vat,
  total,
  byCode = [],
  paid,
  credited,
  balance,
  label,
}: {
  /** Net of discount, excl. VAT. */
  subtotal: Decimal | number;
  discount?: Decimal | number;
  vat: Decimal | number;
  total: Decimal | number;
  /** Net and VAT per tax code; more than one shows a VAT row for each. */
  byCode?: TaxBucket[];
  paid?: Decimal | number;
  credited?: Decimal | number;
  balance?: Decimal | number;
  label?: string;
}) {
  const hasDiscount = toNumber(discount) > 0;
  const mixed = byCode.length > 1;
  const settled = paid != null || credited != null || balance != null;
  return (
    <Group label={label ?? 'Amounts'}>
      {hasDiscount && (
        <>
          <DetailRow label="Before discount" value={money(addDecimals(subtotal, discount ?? 0))} />
          <DetailRow label="Discount" value={`−${money(discount)}`} />
        </>
      )}
      <DetailRow label="Subtotal excl. VAT" value={money(subtotal)} />
      {mixed ? (
        <>
          <DetailRow label="VAT" value={money(vat)} />
          {byCode.map((b) => (
            <DetailRow
              key={b.code}
              label={`${taxCodeShort(b.code)} on ${money(b.net)}`}
              value={money(b.vat)}
            />
          ))}
        </>
      ) : (
        <DetailRow label={vatLabel(byCode)} value={money(vat)} />
      )}
      <View
        className={`flex-row items-center justify-between bg-surface-hover px-3.5 py-3.5 ${
          settled ? 'border-b border-line-row' : ''
        }`}
      >
        <Txt className="text-callout font-semibold text-fg">Total</Txt>
        <Mono className="text-heading font-semibold text-fg">{money(total)}</Mono>
      </View>
      {paid != null && <DetailRow label="Paid to date" value={money(paid)} last={credited == null && balance == null} />}
      {credited != null && toNumber(credited) > 0 && (
        <DetailRow label="Credited" value={`−${money(credited)}`} last={balance == null} />
      )}
      {balance != null && <DetailRow label="Balance due" value={money(balance)} boldValue last />}
    </Group>
  );
}

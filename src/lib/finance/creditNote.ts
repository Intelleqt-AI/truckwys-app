/**
 * Credit note line building, ported from the web's CreditNoteDialog.
 *
 * A credit note's lines carry the tax code and `invoice_line` of the invoice
 * line they reduce (the server refuses a different code), and can never credit
 * more than what is left of that line.
 */
import { formatQuantity, normaliseDecimalInput, subtractDecimals, toNumber } from './tax';
import type { CreditNoteLineInput, InvoiceLine } from './types';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Net (excl. VAT) still creditable on an invoice line. */
export const lineRemaining = (l: InvoiceLine): string =>
  subtractDecimals(l.net_amount, l.credited_net_amount ?? '0');

/**
 * The credit line for part (or all) of an invoice line.
 *
 * Everything left on the line: the plain quantity x price when nothing was
 * discounted or credited yet, else one unit of the remaining net. Part of a
 * line: the effective price (net / quantity), so a credit never gives back more
 * than was charged; the caller checks it against what is left.
 */
export function creditFromLine(line: InvoiceLine, qtyText: string): CreditNoteLineInput | null {
  const qty = toNumber(normaliseDecimalInput(qtyText));
  const full = toNumber(line.quantity);
  if (!(qty > 0)) return null;
  const base = { tax_code: line.tax_code, invoice_line: line.id };
  const discounted = toNumber(line.discount_amount) > 0;
  const partlyCredited = toNumber(line.credited_net_amount) > 0;
  const all = Math.abs(qty - full) < 1e-9;
  if (all && (discounted || partlyCredited)) {
    return {
      ...base,
      description: `${line.description} (${partlyCredited ? 'remaining' : `${formatQuantity(full)} × after discount`})`,
      quantity: '1',
      unit_price: lineRemaining(line),
    };
  }
  if (!discounted) {
    return { ...base, description: line.description, quantity: String(qty), unit_price: line.unit_price };
  }
  const unit = round2(toNumber(line.net_amount) / full);
  return { ...base, description: line.description, quantity: String(qty), unit_price: unit.toFixed(2) };
}

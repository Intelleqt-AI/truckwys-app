import { addDecimals, computeLine } from '@/lib/finance/tax';
import type { TaxCode } from '@/lib/finance/types';

/**
 * The price a quote or order is shown to the customer at: the price excl. VAT,
 * the VAT on it and the total incl. VAT (15%, or 0% for international
 * transport), straight from the backend's `customer_price`
 * (core/services/quote_vat.py), so lists, detail pages and what the customer is
 * sent all show the same figure. Strings, like total_amount.
 */
export interface CustomerPrice {
  vat_registered: boolean;
  zero_rated?: boolean;
  vat_label?: string;
  vat_rate_percent?: string | null;
  subtotal_excl_vat?: string | number | null;
  vat_amount?: string | number | null;
  total_incl_vat?: string | number | null;
}

const toNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * The price a quote or order is listed at: incl. VAT from `customer_price`,
 * else total_amount (excl. VAT) for a response without the breakdown.
 */
export function priceInclVat(
  row: { total_amount?: string | number | null; customer_price?: CustomerPrice | null } | null | undefined,
): number {
  return toNum(row?.customer_price?.total_incl_vat ?? row?.total_amount);
}

export const INTERNATIONAL_VAT_LABEL = 'VAT 0% (zero-rated international transport)';

/**
 * The backend rule (quote_vat) on the figures on screen, for a quote that isn't
 * saved yet: the send preview then matches the email the save sends. Same exact
 * decimal maths as invoices.
 */
export function previewQuoteVat(input: {
  totalExcl: number;
  vatRegistered: boolean;
  international: boolean;
}): CustomerPrice {
  const excl = (Math.round(input.totalExcl * 100) / 100).toFixed(2);
  if (!input.vatRegistered) {
    return {
      vat_registered: false,
      zero_rated: false,
      vat_label: 'VAT',
      vat_rate_percent: null,
      subtotal_excl_vat: excl,
      vat_amount: '0.00',
      total_incl_vat: excl,
    };
  }
  const code: TaxCode = input.international ? 'ZERO_RATED' : 'STANDARD';
  const line = computeLine({
    quantity: '1',
    unit_price: excl,
    discount: '0',
    discount_mode: 'amount',
    tax_code: code,
  });
  return {
    vat_registered: true,
    zero_rated: input.international,
    vat_label: input.international ? INTERNATIONAL_VAT_LABEL : 'VAT (15%)',
    vat_rate_percent: input.international ? '0.00' : '15.00',
    subtotal_excl_vat: line.net,
    vat_amount: line.vat,
    total_incl_vat: addDecimals(line.net, line.vat),
  };
}

/**
 * The price lines the customer is sent (WhatsApp text), as the web writes them:
 * price excl. VAT, the VAT, the total incl. VAT. Without a breakdown (older
 * backend), just the price excl. VAT.
 */
export function customerPriceLines(
  totalExcl: number,
  price: CustomerPrice | null | undefined,
  money: (n: number) => string,
): string[] {
  if (!price) return totalExcl > 0 ? [`Price: ${money(totalExcl)} excl. VAT`] : [];
  if (!price.vat_registered) return [`Total: ${money(toNum(price.total_incl_vat))} (no VAT charged)`];
  return [
    `Price: ${money(toNum(price.subtotal_excl_vat))} excl. VAT`,
    `${price.vat_label || 'VAT'}: ${money(toNum(price.vat_amount))}`,
    `Total: ${money(toNum(price.total_incl_vat))} incl. VAT`,
  ];
}

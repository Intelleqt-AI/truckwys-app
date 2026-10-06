import { computeLine, normaliseDecimalInput, toNumber, type DiscountMode, type LineDraft } from './tax';
import type { InvoiceLine, InvoiceLineInput, RevenueType, TaxCode } from './types';

/** A line in the editor: the draft plus a stable React key. */
export interface EditorLine extends LineDraft {
  key: string;
  load?: number | null;
  revenue_type: RevenueType;
}

let seq = 0;
const nextKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const blankLine = (tax_code: TaxCode): EditorLine => ({
  key: nextKey(),
  description: '',
  quantity: '1',
  unit_price: '',
  discount: '',
  discount_mode: 'amount',
  tax_code,
  revenue_type: 'FREIGHT',
});

const trimZeros = (q: string) => (q.includes('.') ? q.replace(/0+$/, '').replace(/\.$/, '') : q) || '0';

/**
 * Editor lines from a saved invoice. A legacy invoice (no lines) becomes one
 * line for its subtotal, so saving it moves it onto lines.
 */
export function linesFromInvoice(
  lines: InvoiceLine[] | undefined,
  legacySubtotal: string | number | undefined,
  tax_code: TaxCode,
): EditorLine[] {
  if (lines && lines.length) {
    return [...lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        key: nextKey(),
        description: l.description,
        quantity: trimZeros(l.quantity),
        unit_price: l.unit_price,
        discount: toNumber(l.discount_amount) ? l.discount_amount : '',
        discount_mode: 'amount' as DiscountMode,
        tax_code: l.tax_code,
        revenue_type: l.revenue_type ?? 'FREIGHT',
        load: l.load ?? null,
      }));
  }
  const sub = toNumber(legacySubtotal);
  return [{ ...blankLine(tax_code), description: sub ? 'Transport' : '', unit_price: sub ? sub.toFixed(2) : '' }];
}

/** Lines for the API: blank lines dropped, numbers normalised. */
export function linesForApi(lines: EditorLine[]): InvoiceLineInput[] {
  return lines
    .filter((l) => l.description.trim() || toNumber(normaliseDecimalInput(l.unit_price)) !== 0)
    .map((l) => {
      const disc = normaliseDecimalInput(l.discount);
      const base: InvoiceLineInput = {
        description: l.description.trim(),
        quantity: normaliseDecimalInput(l.quantity) || '0',
        unit_price: normaliseDecimalInput(l.unit_price) || '0',
        tax_code: l.tax_code,
        revenue_type: l.revenue_type ?? 'FREIGHT',
      };
      if (l.load !== undefined) base.load = l.load;
      if (disc && toNumber(disc) !== 0) {
        if (l.discount_mode === 'percent') base.discount_percent = disc;
        else base.discount_amount = disc;
      }
      return base;
    });
}

/** Problems that stop a save, in line order. */
export function lineProblems(lines: EditorLine[]): string[] {
  const out: string[] = [];
  lines.forEach((l, i) => {
    const blank = !l.description.trim() && !normaliseDecimalInput(l.unit_price);
    if (blank) return;
    const n = i + 1;
    if (!l.description.trim()) out.push(`Line ${n} needs a description.`);
    const q = normaliseDecimalInput(l.quantity);
    if (!q || toNumber(q) <= 0) out.push(`Line ${n} needs a quantity above 0.`);
    if (l.unit_price && !normaliseDecimalInput(l.unit_price)) out.push(`Line ${n}: the unit price is not a number.`);
    if (l.discount && !normaliseDecimalInput(l.discount)) out.push(`Line ${n}: the discount is not a number.`);
    if (l.discount_mode === 'percent' && toNumber(normaliseDecimalInput(l.discount)) > 100) {
      out.push(`Line ${n}: a discount can't be more than 100%.`);
    }
    const a = computeLine(l);
    if (toNumber(a.net) < 0) out.push(`Line ${n}: the discount is more than the line amount.`);
  });
  return out;
}

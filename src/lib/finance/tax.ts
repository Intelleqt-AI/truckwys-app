/**
 * Invoice / credit note line maths, matching the server exactly. Port of the
 * web's lib/finance/tax.ts (backend: core/tax_codes.py).
 *
 * Per line:
 *   gross = quantity x unit_price            (exact)
 *   net   = round2(gross - discount)         (ROUND_HALF_UP)
 *   vat   = round2(net x rate / 100)         (ROUND_HALF_UP)
 *   total = net + vat
 * Document totals are sums of the rounded line values. Discount is applied
 * before VAT. Rates: STANDARD 15 %, every other code 0 %.
 *
 * Arithmetic is done on scaled BigInts, never floats, so a preview can never
 * differ from the server by a cent (0.1 + 0.2 style drift, or 2.675 x 1
 * rounding down in binary). Quantity (3 dp) x unit price (4 dp) alone can run
 * past 2^53, which is why this isn't plain integer maths either.
 *
 * `**` is avoided on purpose: Babel can lower it to Math.pow, which throws on
 * a BigInt.
 */
import type { Decimal, TaxCode, TaxCodeOption } from './types';

// ------------------------------------------------------------ exact decimals

interface Dec {
  v: bigint;
  s: number; // value = v / 10^s
}

const TEN = BigInt(10);
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

const pow10 = (n: number): bigint => {
  let out = ONE;
  for (let i = 0; i < n; i++) out *= TEN;
  return out;
};

/** Normalise user text to an API decimal: "1 234,50" -> "1234.50"; junk -> "". */
export function normaliseDecimalInput(text: string): string {
  const t = String(text ?? '')
    .replace(/[\s  ]/g, '')
    .replace(/^R/i, '');
  if (!t) return '';
  // A lone comma is the decimal separator (en-ZA); with both, comma groups thousands.
  const s = t.includes('.') ? t.replace(/,/g, '') : t.replace(',', '.');
  return /^-?\d*\.?\d*$/.test(s) && /\d/.test(s) ? s : '';
}

function parse(x: Decimal | number | null | undefined): Dec {
  if (x == null || x === '') return { v: ZERO, s: 0 };
  const str = typeof x === 'number' ? (Number.isFinite(x) ? x.toFixed(10) : '0') : normaliseDecimalInput(x);
  if (!str || str === '-' || str === '.') return { v: ZERO, s: 0 };
  const neg = str.startsWith('-');
  const [i = '0', f = ''] = (neg ? str.slice(1) : str).split('.');
  const v = BigInt((i || '0') + f);
  return { v: neg ? -v : v, s: f.length };
}

const align = (a: Dec, s: number): bigint => a.v * pow10(s - a.s);
const add = (a: Dec, b: Dec): Dec => {
  const s = Math.max(a.s, b.s);
  return { v: align(a, s) + align(b, s), s };
};
const sub = (a: Dec, b: Dec): Dec => add(a, { v: -b.v, s: b.s });
const mul = (a: Dec, b: Dec): Dec => ({ v: a.v * b.v, s: a.s + b.s });

/** Round to `dp` places, half away from zero (Python's ROUND_HALF_UP). */
function round(a: Dec, dp = 2): Dec {
  if (a.s <= dp) return { v: align(a, dp), s: dp };
  const div = pow10(a.s - dp);
  let q = a.v / div; // truncates toward zero
  const r = a.v % div;
  const absR = r < ZERO ? -r : r;
  if (absR * TWO >= div) q += a.v < ZERO ? -ONE : ONE;
  return { v: q, s: dp };
}

const toStr = (a: Dec): string => {
  const neg = a.v < ZERO;
  const digits = (neg ? -a.v : a.v).toString().padStart(a.s + 1, '0');
  const int = a.s ? digits.slice(0, -a.s) : digits;
  const frac = a.s ? `.${digits.slice(-a.s)}` : '';
  return `${neg ? '-' : ''}${int}${frac}`;
};

/** Read an API decimal (or a number) as a JS number, for display only. */
export function toNumber(x: Decimal | number | null | undefined): number {
  if (x == null || x === '') return 0;
  const n = typeof x === 'number' ? x : parseFloat(x);
  return Number.isFinite(n) ? n : 0;
}

// ------------------------------------------------------------ tax codes

export const DEFAULT_TAX_CODES: TaxCodeOption[] = [
  { code: 'STANDARD', label: 'Standard rate (15%)', rate: '15.00' },
  { code: 'ZERO_RATED', label: 'Zero-rated (0%)', rate: '0.00' },
  { code: 'EXEMPT', label: 'Exempt', rate: '0.00' },
  { code: 'NO_VAT', label: 'No VAT', rate: '0.00' },
];

/** Short labels for tight cells and the totals breakdown. */
export const TAX_CODE_SHORT: Record<TaxCode, string> = {
  STANDARD: 'VAT 15%',
  ZERO_RATED: 'Zero-rated',
  EXEMPT: 'Exempt',
  NO_VAT: 'No VAT',
};

export const taxCodeShort = (code?: string | null): string =>
  (code && TAX_CODE_SHORT[code as TaxCode]) ||
  (code ? code.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : 'VAT 15%');

/** Rate in percent for a code, from the server's list when we have it. */
export function rateFor(code: TaxCode | string, codes: TaxCodeOption[] = DEFAULT_TAX_CODES): Decimal {
  const hit = codes.find((c) => c.code === code);
  if (hit) return hit.rate;
  return code === 'STANDARD' ? '15.00' : '0.00';
}

// ------------------------------------------------------------ lines and totals

export type DiscountMode = 'amount' | 'percent';

export interface LineDraft {
  description: string;
  quantity: Decimal;
  unit_price: Decimal;
  /** Rand excl. VAT when mode is 'amount', percent when 'percent'. */
  discount: Decimal;
  discount_mode: DiscountMode;
  tax_code: TaxCode;
}

export interface LineAmounts {
  gross: string;
  discount: string;
  net: string;
  vat: string;
  total: string;
  rate: string;
}

export function computeLine(
  line: Pick<LineDraft, 'quantity' | 'unit_price' | 'discount' | 'discount_mode' | 'tax_code'>,
  codes?: TaxCodeOption[],
): LineAmounts {
  // gross stays unrounded (unit prices may carry 4 decimals).
  const gross = mul(parse(line.quantity), parse(line.unit_price));
  const percent = line.discount_mode === 'percent';
  // Percent: the raw discount (gross x pct / 100, unrounded) comes off before
  // rounding, and the discount shown is round2(gross) - net, as the server does.
  // Amount: net = round2(gross - discount_amount).
  const discountRaw = percent ? mul(gross, mul(parse(line.discount), { v: ONE, s: 2 })) : parse(line.discount);
  const net = round(sub(gross, discountRaw));
  const discount = percent ? sub(round(gross), net) : round(discountRaw);
  const rate = parse(rateFor(line.tax_code, codes));
  const vat = round(mul(net, mul(rate, { v: ONE, s: 2 })));
  return {
    gross: toStr(round(gross)),
    discount: toStr(round(discount)),
    net: toStr(net),
    vat: toStr(vat),
    total: toStr(add(net, vat)),
    rate: toStr(rate),
  };
}

export interface TaxBucket {
  code: TaxCode;
  net: string;
  vat: string;
}

export interface DocTotals {
  /** Sum of line nets (excl. VAT, after discount). */
  subtotal: string;
  discount: string;
  vat: string;
  total: string;
  /** Net and VAT per tax code, in first-seen order. */
  byCode: TaxBucket[];
}

/** Sum already-rounded line amounts (the server's document totals). */
export function sumLines(lines: { net: string; vat: string; discount?: string; tax_code: TaxCode }[]): DocTotals {
  let subtotal: Dec = { v: ZERO, s: 2 };
  let vat: Dec = { v: ZERO, s: 2 };
  let discount: Dec = { v: ZERO, s: 2 };
  const buckets = new Map<TaxCode, { net: Dec; vat: Dec }>();
  for (const l of lines) {
    const n = parse(l.net);
    const v = parse(l.vat);
    subtotal = add(subtotal, n);
    vat = add(vat, v);
    if (l.discount) discount = add(discount, parse(l.discount));
    const b = buckets.get(l.tax_code) ?? { net: { v: ZERO, s: 2 }, vat: { v: ZERO, s: 2 } };
    buckets.set(l.tax_code, { net: add(b.net, n), vat: add(b.vat, v) });
  }
  return {
    subtotal: toStr(round(subtotal)),
    discount: toStr(round(discount)),
    vat: toStr(round(vat)),
    total: toStr(round(add(subtotal, vat))),
    byCode: [...buckets.entries()].map(([code, b]) => ({
      code,
      net: toStr(round(b.net)),
      vat: toStr(round(b.vat)),
    })),
  };
}

export function computeTotals(lines: LineDraft[], codes?: TaxCodeOption[]): DocTotals {
  return sumLines(
    lines.map((l) => {
      const a = computeLine(l, codes);
      return { net: a.net, vat: a.vat, discount: a.discount, tax_code: l.tax_code };
    }),
  );
}

/** True when a line has nothing to bill (no description and a zero unit price). */
export const lineIsBlank = (l: LineDraft) => !l.description.trim() && parse(l.unit_price).v === ZERO;

/**
 * Input VAT inside a gross (VAT-inclusive) amount: gross x rate / (100 + rate),
 * rounded half up to the cent. STANDARD: amount x 15 / 115, as the server does
 * when an expense is saved without a VAT amount. Other codes: 0.
 */
export function vatFromGross(gross: Decimal | number, code: TaxCode | string, codes?: TaxCodeOption[]): string {
  const g = parse(gross);
  const r = parse(rateFor(code, codes));
  if (r.v === ZERO || g.v === ZERO) return '0.00';
  const num = mul(g, r); // gross x rate
  const den = add({ v: BigInt(100), s: 0 }, r); // 100 + rate
  // (num.v / 10^num.s) / (den.v / 10^den.s), scaled to cents.
  const N = num.v * pow10(den.s + 2);
  const D = den.v * pow10(num.s);
  let q = N / D;
  const rem = N % D;
  const absRem = rem < ZERO ? -rem : rem;
  if (absRem * TWO >= D) q += N < ZERO ? -ONE : ONE;
  return toStr({ v: q, s: 2 });
}

/** a - b on API decimals, to the cent (net = gross - VAT). */
export function subtractDecimals(a: Decimal | number, b: Decimal | number): string {
  return toStr(round(sub(parse(a), parse(b))));
}

/** "2.000" -> "2", "1.5" -> "1,5": a quantity without trailing zeros, comma decimal (en-ZA). */
export function formatQuantity(q: Decimal | number): string {
  const n = toNumber(q);
  const s = Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(3)));
  return s.replace('.', ',');
}

/** a + b on API decimals, to the cent. */
export function addDecimals(a: Decimal | number, b: Decimal | number): string {
  return toStr(round(add(parse(a), parse(b))));
}

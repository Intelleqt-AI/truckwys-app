// Company settings: client-side price checks and the server's 400 field
// errors, mapped to the box they belong to. Pure, no imports: runs under
// `node --test`.

/** The settings boxes a server field error can land in. */
export type CompanyBox = 'diesel' | 'petrol' | 'electric' | 'hybrid' | 'baseRate' | 'minimumCharge';

const FIELD_TO_BOX: Record<string, CompanyBox> = {
  fuel_price_own: 'diesel',
  fuel_price_per_litre: 'diesel',
  fuel_price_mode: 'diesel',
  fuel_price_petrol: 'petrol',
  fuel_price_petrol_mode: 'petrol',
  fuel_price_petrol_grade: 'petrol',
  fuel_price_electric: 'electric',
  fuel_price_hybrid: 'hybrid',
  default_base_rate_per_km: 'baseRate',
  minimum_charge: 'minimumCharge',
};

/** DRF {field: ["msg"]} → {box: "msg"} for the boxes on this screen. */
export function companyFieldErrors(body: unknown): Partial<Record<CompanyBox, string>> {
  const out: Partial<Record<CompanyBox, string>> = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return out;
  for (const [field, v] of Object.entries(body as Record<string, unknown>)) {
    const box = FIELD_TO_BOX[field];
    if (!box || out[box]) continue;
    const msg = Array.isArray(v) ? v[0] : v;
    if (typeof msg === 'string' && msg) out[box] = msg;
  }
  return out;
}

/** Own fuel price per litre: R 5 – R 100 (backend rule). Null when fine. */
export function ownPricePerLitreError(value: number | null): string | null {
  if (value === null) return 'Enter your price, or choose Official price';
  if (value < 5 || value > 100) return 'Between R 5 and R 100 per litre';
  return null;
}

/** Electricity cost per kWh: above 0, at most R 20 (backend rule). */
export function electricError(value: number | null): string | null {
  if (value === null) return null;
  return value > 0 && value <= 20 ? null : 'Between R 0 and R 20 per kWh';
}

/** Hybrid price per litre: above 0, at most R 100 (backend rule). */
export function hybridError(value: number | null): string | null {
  if (value === null) return null;
  return value > 0 && value <= 100 ? null : 'Between R 0 and R 100 per litre';
}

/** Default price per km: 0 – R 1 000 (backend rule). */
export function baseRateError(value: number | null): string | null {
  if (value === null) return null;
  return value >= 0 && value <= 1000 ? null : 'Between R 0 and R 1 000 per km';
}

/** A stored price as the box shows it: comma decimal ("29,11"), blank when unset. */
export function priceText(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n).replace('.', ',') : '';
}

export interface PriceBoxes {
  electric: number | null;
  hybrid: number | null;
  baseRate: number | null;
}

/**
 * Which price boxes to check and send on Save. Only a box changed since load
 * is checked and sent: a stored out-of-range figure is shown on its box but
 * never blocks saving something else (and isn't sent back for the server to
 * refuse). On a newer backend (petrolRule) hybrid trucks price on petrol: the
 * hidden hybrid box is neither checked nor sent.
 */
export function priceBoxPlan(
  now: PriceBoxes,
  loaded: PriceBoxes,
  opts: { petrolRule: boolean },
): {
  block: Partial<Record<CompanyBox, string>>;
  show: Partial<Record<CompanyBox, string>>;
  send: { electric: boolean; hybrid: boolean; baseRate: boolean };
} {
  const check: Record<keyof PriceBoxes, (v: number | null) => string | null> = {
    electric: electricError,
    hybrid: hybridError,
    baseRate: baseRateError,
  };
  const block: Partial<Record<CompanyBox, string>> = {};
  const show: Partial<Record<CompanyBox, string>> = {};
  const send = { electric: false, hybrid: false, baseRate: false };
  for (const key of ['electric', 'hybrid', 'baseRate'] as const) {
    if (key === 'hybrid' && opts.petrolRule) continue;
    const changed = now[key] !== loaded[key];
    const err = check[key](now[key]);
    send[key] = changed;
    if (err) (changed ? block : show)[key] = err;
  }
  return { block, show, send };
}

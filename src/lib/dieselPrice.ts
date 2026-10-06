// Which diesel price a quote is priced on, and how to label it. Port of the web
// app's src/lib/dieselPrice.ts. Pure: inputs are the company profile
// (company/profile/) and the response of GET fuel-prices/current/, which carries
// both the original keys (inland_price / coastal_price) and the extended ones
// (zone, zone_price, diesel_grade, effective_from, last_failed_check_at).
//
// Rule:
//  - The company's fuel_price_per_litre is the fleet's OWN price (fuel card,
//    bulk rate) when it is set to anything other than the untouched model
//    default (Company.fuel_price_per_litre default=23.50). Then it is used as-is.
//  - Otherwise (default or empty) the live price for the company's fuel zone is
//    used: zone_price, else inland_price/coastal_price by company.fuel_zone.
//  - No usable live price: the company setting.

/** Company.fuel_price_per_litre model default on the backend. */
export const COMPANY_DEFAULT_DIESEL_PRICE = 23.5;

export type DieselPriceSource = 'own' | 'live' | 'company';

export interface ResolvedDieselPrice {
  /** R/L the quote is priced on. Null only when neither live nor company has a number. */
  price: number | null;
  source: DieselPriceSource;
  /** The live zone price, when the endpoint gave one (also when it isn't used). */
  livePrice: number | null;
  /** Backend marks the live price stale, or the last refresh failed. */
  liveStale: boolean;
  zone: 'INLAND' | 'COASTAL';
  grade: string | null;
  /** Short date text: "2 Sep" from effective_from, else "Sep 2026" from the price month. */
  effectiveText: string | null;
}

type Loose = Record<string, unknown> | null | undefined;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const positive = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const effectiveTextOf = (live: Loose): string | null => {
  // effective_from is an ISO timestamp in SAST ("2026-09-02T00:01:00+02:00"):
  // read the date part as written rather than re-zoning it on the phone.
  const eff =
    typeof live?.effective_from === 'string' ? live.effective_from.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (eff) return `${Number(eff[3])} ${MONTHS[Number(eff[2]) - 1]}`;
  // Older backend: only the calendar month the price belongs to.
  const month = typeof live?.last_updated === 'string' ? live.last_updated.match(/^(\d{4})-(\d{2})/) : null;
  if (month) return `${MONTHS[Number(month[2]) - 1]} ${month[1]}`;
  return null;
};

export function resolveDieselPrice({ company, live }: { company: Loose; live: Loose }): ResolvedDieselPrice {
  const zone: 'INLAND' | 'COASTAL' = (live?.zone || company?.fuel_zone) === 'COASTAL' ? 'COASTAL' : 'INLAND';

  let livePrice: number | null = null;
  if (live && live.success !== false) {
    livePrice =
      positive(live.zone_price) ?? positive(zone === 'COASTAL' ? live.coastal_price : live.inland_price);
  }
  const liveStale = !!live && (live.is_stale === true || !!live.last_failed_check_at);

  const companyPrice = positive(company?.fuel_price_per_litre);
  const isOwnPrice = companyPrice !== null && Math.abs(companyPrice - COMPANY_DEFAULT_DIESEL_PRICE) > 0.00005;

  const base = {
    livePrice,
    liveStale,
    zone,
    grade: typeof live?.diesel_grade === 'string' && live.diesel_grade ? live.diesel_grade : null,
    effectiveText: livePrice !== null ? effectiveTextOf(live) : null,
  };

  if (isOwnPrice) return { ...base, price: companyPrice, source: 'own' };
  if (livePrice !== null) return { ...base, price: livePrice, source: 'live' };
  return { ...base, price: companyPrice, source: 'company' };
}

/** " · live, 50ppm inland, from 2 Sep" / " · your price" / " · inland". */
export function dieselBasisNote(r: ResolvedDieselPrice): string {
  const zoneWord = r.zone === 'COASTAL' ? 'coastal' : 'inland';
  if (r.source === 'own') return ' · your price';
  if (r.source === 'live') {
    const what = [r.grade, zoneWord].filter(Boolean).join(' ');
    return ` · live, ${what}${r.effectiveText ? `, from ${r.effectiveText}` : ''}${r.liveStale ? ' · stale' : ''}`;
  }
  return ` · ${zoneWord}`;
}

/** Hint shown when the fleet's own price is used: "Live diesel: R29.56/L (effective 2 Sep)". */
export function liveDieselHint(r: ResolvedDieselPrice): string | null {
  if (r.source !== 'own' || r.livePrice === null) return null;
  const parts = [r.effectiveText ? `effective ${r.effectiveText}` : null, r.liveStale ? 'stale' : null].filter(
    Boolean,
  );
  return `Live diesel: R${r.livePrice.toFixed(2)}/L${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

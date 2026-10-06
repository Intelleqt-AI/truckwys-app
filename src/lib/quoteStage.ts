import { localDateISO } from './dates';

// One stage rule for a quote, shared by the Quotes list, Home's pipeline and
// Customer detail so their counts agree. Port of the web app's quoteLapsed /
// boardStage (components/overview/today.tsx), plus the Booked stage.
//
// Quote.status is DRAFT, SENT, ACCEPTED, DECLINED, EXPIRED, and the legacy IT /
// COMPLETED. BOOKED is never stored: it means "converted into a load", which
// the API reports as `booked_load` ({id, load_number, status}) and `converted`.
// `?status=BOOKED` on quotes/ is the matching server filter, and `?status=
// ACCEPTED` now means accepted but not yet booked.

type Raw = Record<string, unknown>;

export interface BookedLoad {
  id: number | string;
  load_number?: string;
  status?: string;
}

/**
 * True once a quote's valid-until day is over. Compared as local calendar days,
 * so a quote valid until 20 Jul is still live all of 20 Jul.
 */
export function quoteLapsed(q: Raw | null | undefined, now: Date = new Date()): boolean {
  const v = String(q?.valid_until ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return v < localDateISO(now);
}

/** The load a quote was converted into, from the quote API's own `booked_load`. */
export function bookedLoadOf(q: Raw | null | undefined): BookedLoad | null {
  const b = q?.booked_load;
  if (b && typeof b === 'object' && (b as Raw).id != null) return b as BookedLoad;
  return null;
}

/**
 * Converted into a booking. `converted` also covers the legacy IT / COMPLETED
 * statuses that have no linked load.
 */
export const isBookedQuote = (q: Raw | null | undefined): boolean =>
  bookedLoadOf(q) !== null || q?.converted === true;

export type QuoteStage = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'BOOKED' | 'DECLINED' | 'EXPIRED';

/**
 * Accepted here means "still to book". A Sent quote marked lost sits in
 * Declined. A Draft or Sent quote past its valid-until date is Expired: it is
 * not live work, so it is never counted under Draft or Sent.
 */
export function quoteStage(q: Raw | null | undefined, now?: Date): QuoteStage | null {
  if (isBookedQuote(q)) return 'BOOKED';
  const st = String(q?.status ?? '').toUpperCase();
  if (st === 'SENT' && q?.outcome === 'rejected') return 'DECLINED';
  if (st === 'DRAFT' || st === 'SENT') return quoteLapsed(q, now) ? 'EXPIRED' : st;
  if (st === 'ACCEPTED' || st === 'IT' || st === 'COMPLETED') return 'ACCEPTED';
  if (st === 'DECLINED') return 'DECLINED';
  if (st === 'EXPIRED') return 'EXPIRED';
  return null;
}

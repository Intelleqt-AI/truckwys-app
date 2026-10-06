import { fetchData } from './client';

// DRF paginates every list at 20 rows by default, and screens that read a list
// with `asArray(await fetchData('invoices/'))` silently see page 1 only: KPI
// tiles, "Outstanding", utilisation and the customer pickers all undercount
// once a company has more than 20 rows. The backend now honours `?page_size=`
// (max 100), so this asks for 100 and pages through the rest.
//
// Pages are requested by number rather than by following the absolute `next`
// link, so every request goes through the configured client and its auth.

const PAGE_SIZE = 100;
const BATCH = 4;
/** Safety cap: a runaway list must not turn into hundreds of requests. */
const MAX_ROWS = 1000;

interface Envelope<T> {
  count?: number;
  next?: string | null;
  results?: T[];
}

export interface AllPages<T> {
  rows: T[];
  /** The server's total, which can exceed rows.length when `complete` is false. */
  count: number;
  /** False when MAX_ROWS cut the list short. */
  complete: boolean;
}

const withQuery = (path: string, params: string) =>
  `${path}${path.includes('?') ? '&' : '?'}${params}`;

/**
 * Every row of a DRF list endpoint (GET only), up to 1 000. A bare-array
 * response (an unpaginated endpoint) is returned as is.
 */
export async function fetchAllPages<T = Record<string, unknown>>(
  path: string,
  maxRows = MAX_ROWS,
): Promise<AllPages<T>> {
  const first = await fetchData<Envelope<T> | T[]>(withQuery(path, `page_size=${PAGE_SIZE}&page=1`));
  if (Array.isArray(first)) return { rows: first, count: first.length, complete: true };

  const rows = [...(first?.results ?? [])];
  const count = Number(first?.count ?? rows.length);
  if (!first?.next || rows.length === 0) return { rows, count, complete: true };

  // Size pages from what actually came back, in case page_size was ignored or
  // clamped, so the page count below is never too small.
  const perPage = rows.length;
  const lastPage = Math.ceil(Math.min(count, maxRows) / perPage);

  for (let start = 2; start <= lastPage; start += BATCH) {
    const pages = Array.from({ length: Math.min(BATCH, lastPage - start + 1) }, (_, i) => start + i);
    const results = await Promise.all(
      pages.map((p) => fetchData<Envelope<T>>(withQuery(path, `page_size=${PAGE_SIZE}&page=${p}`))),
    );
    for (const r of results) rows.push(...(r?.results ?? []));
  }

  return { rows, count, complete: rows.length >= count };
}

/** Just the rows, for call sites that don't care whether the cap was hit. */
export async function fetchAllRows<T = Record<string, unknown>>(path: string): Promise<T[]> {
  return (await fetchAllPages<T>(path)).rows;
}

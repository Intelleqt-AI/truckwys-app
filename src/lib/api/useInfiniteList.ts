import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchData } from './client';
import { asArray, pick } from './list';

interface PageEnvelope<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// DRF paginates every list endpoint at PAGE_SIZE=20 by default, which callers
// used to read as if it were the whole list (`asArray` alone), silently
// dropping anything past page 1. This follows `next` via FlashList's
// onEndReached instead, one hook shared by every paginated list rather than
// each call site re-implementing page bookkeeping.
//
// The backend now honours `?page_size=` (max 100, larger values are clamped),
// so pages are asked for at 50: fewer round trips than 20 without making the
// first paint wait on a 100-row payload.
const PAGE_SIZE = 50;

/**
 * `key` is the first segment of the query key (invalidation is by prefix, so
 * `invalidateQueries(['quotes'])` reaches every variant). Pass an array to key
 * a filtered variant, e.g. ['quotes', 'BOOKED'].
 */
export interface InfiniteListOptions {
  /** Rows per request. The server's cost grows with page size, so a list whose
      rows are expensive to serialize can ask for fewer. Defaults to 50. */
  pageSize?: number;
  /**
   * Rows already in memory (e.g. the ledger Home downloaded), shown while the
   * real first page loads. Placeholder only, never written to the cache: the
   * real page 1 is always requested and replaces it, so nothing stale sticks.
   * Rows are expected to be raw API records, the same shape `normalize` takes.
   */
  seed?: () => Record<string, unknown>[] | undefined;
  /** Keep showing the previous key's rows while a new key loads (filter switch). */
  keepPrevious?: boolean;
}

/**
 * Everything on page 1's envelope except `results`: the server-side lists send
 * their tiles and chip counts alongside the rows (`summary`, `flags`,
 * `status_counts`, `counts`, `issued_total`).
 */
export type ListExtras<X> = { count: number } & X;

export function useInfiniteList<T, X extends object = Record<string, unknown>>(
  key: string | readonly unknown[],
  path: string,
  normalize: (raw: Record<string, unknown>) => T,
  opts: InfiniteListOptions = {},
) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const { seed, keepPrevious } = opts;
  const query = useInfiniteQuery({
    queryKey: typeof key === 'string' ? [key] : key,
    queryFn: ({ pageParam }) =>
      fetchData<PageEnvelope<Record<string, unknown>> | Record<string, unknown>[]>(
        `${path}${path.includes('?') ? '&' : '?'}page_size=${pageSize}&page=${pageParam}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      Array.isArray(lastPage) ? undefined : lastPage.next ? pages.length + 1 : undefined,
    placeholderData:
      seed || keepPrevious
        ? (previous) => {
            const rows = seed?.();
            // In-memory rows win over the previous key's: they cover every
            // filter, where the previous key's rows may be a different subset.
            if (rows && rows.length > 0) {
              return {
                pages: [{ count: rows.length, next: null, previous: null, results: rows }],
                pageParams: [1],
              };
            }
            return keepPrevious ? previous : undefined;
          }
        : undefined,
  });

  // Pages are offset-based and the server's sort can tie (same created_at), and
  // rows can be added or removed between page fetches. Either way the same
  // record can come back on two pages, which gives FlashList two rows with one
  // key (blank cells, jumps, bad measurements), so repeats are dropped here.
  const combinedData = useMemo(() => {
    const seen = new Set<string>();
    let dropped = 0;
    const rows = (query.data?.pages ?? [])
      .flatMap((p) => asArray<Record<string, unknown>>(p))
      .filter((raw) => {
        const id = pick(raw, ['id', 'pk']);
        if (id == null) return true;
        const k = String(id);
        if (seen.has(k)) {
          dropped += 1;
          return false;
        }
        seen.add(k);
        return true;
      });
    if (__DEV__ && dropped > 0) {
      console.warn(`[useInfiniteList ${String(path)}] dropped ${dropped} duplicate row(s)`);
    }
    return rows.map(normalize);
  }, [query.data, normalize, path]);

  // Page 1's envelope is the freshest word on the totals (later pages repeat
  // them, but were fetched earlier on a long scroll).
  const first = query.data?.pages[0];
  const extras =
    first && !Array.isArray(first) ? (first as unknown as ListExtras<X>) : undefined;

  return {
    combinedData,
    /** Total rows the server matched (not just those loaded so far). */
    count: extras?.count,
    extras,
    loadMore: query.fetchNextPage,
    refresh: query.refetch,
    // No paging off a placeholder: its single page has no real `next`, and the
    // real first page is still on its way.
    hasMore: !query.isPlaceholderData && !!query.hasNextPage,
    isPlaceholderData: query.isPlaceholderData,
    isLoading: query.isLoading,
    isFetching: query.isFetchingNextPage,
    /** Any request in flight: the first page, a refresh, or the next page. */
    isFetchingAny: query.isFetching,
    isError: query.isError,
    /** A refresh failed while rows from an earlier load are still shown. */
    isRefetchError: query.isRefetchError,
    /** When the rows shown were last loaded (epoch ms), for stale-data notices. */
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchData } from './client';
import { asArray } from './list';

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
export function useInfiniteList<T>(
  key: string | readonly unknown[],
  path: string,
  normalize: (raw: Record<string, unknown>) => T,
) {
  const query = useInfiniteQuery({
    queryKey: typeof key === 'string' ? [key] : key,
    queryFn: ({ pageParam }) =>
      fetchData<PageEnvelope<Record<string, unknown>> | Record<string, unknown>[]>(
        `${path}${path.includes('?') ? '&' : '?'}page_size=${PAGE_SIZE}&page=${pageParam}`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      Array.isArray(lastPage) ? undefined : lastPage.next ? pages.length + 1 : undefined,
  });

  const combinedData = useMemo(
    () => query.data?.pages.flatMap((p) => asArray<Record<string, unknown>>(p)).map(normalize) ?? [],
    [query.data, normalize],
  );

  return {
    combinedData,
    loadMore: query.fetchNextPage,
    refresh: query.refetch,
    hasMore: !!query.hasNextPage,
    isLoading: query.isLoading,
    isFetching: query.isFetchingNextPage,
    isError: query.isError,
  };
}

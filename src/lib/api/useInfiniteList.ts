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
export function useInfiniteList<T>(
  key: string,
  path: string,
  normalize: (raw: Record<string, unknown>) => T,
) {
  const query = useInfiniteQuery({
    queryKey: [key],
    queryFn: ({ pageParam }) =>
      fetchData<PageEnvelope<Record<string, unknown>> | Record<string, unknown>[]>(
        `${path}${path.includes('?') ? '&' : '?'}page=${pageParam}`,
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

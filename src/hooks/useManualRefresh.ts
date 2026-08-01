import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh state that reflects ONLY a user-initiated pull.
 *
 * Screens used to pass React Query's `isRefetching` straight to the
 * RefreshControl, but that flag is true for *any* refetch — including the
 * background ones triggered by focus, reconnect, or an invalidation after a
 * mutation. The result was a refresh spinner every time you switched tabs, so
 * the app looked like it was reloading itself constantly.
 *
 * Background updates should be invisible: the data just changes. The spinner is
 * feedback for a gesture the user made, and nothing else.
 */
export function useManualRefresh(refetch: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      try {
        await refetch();
      } finally {
        setRefreshing(false);
      }
    })();
    // refetch identity from React Query is stable per query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { refreshing, onRefresh };
}

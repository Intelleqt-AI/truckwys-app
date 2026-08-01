import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Revalidate a screen's data whenever the user navigates back to it.
 *
 * The bottom-tab screens (Home especially) mount once and then stay mounted, so
 * React Query's `refetchOnMount` never fires again for them — switching tabs
 * back to Home showed whatever was cached, which is why a status changed on a
 * detail screen still read the old value on Home.
 *
 * This is the safety net that makes that class of bug impossible: even if a
 * write site forgets to invalidate something, the data is at most one screen
 * visit stale. The equivalent on web is useAutoRefresh's focus/visibilitychange
 * listeners.
 *
 * Skips the very first focus, because the query has just fetched on mount and
 * an immediate second request would be pure waste.
 */
export function useRefetchOnFocus(refetch: () => unknown) {
  // Held in a ref so an unstable inline callback doesn't re-run the effect.
  const cb = useRef(refetch);
  cb.current = refetch;
  const primed = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!primed.current) {
        primed.current = true;
        return;
      }
      void cb.current();
    }, []),
  );
}

import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';

// How this app stays current, in order of who does the work:
//
//   1. A mutation invalidates the keys it affects (lib/queryInvalidation.ts).
//      Every mounted screen showing that data refetches itself, in the
//      background, with no spinner. This is the primary mechanism.
//   2. A WebSocket event does the same for changes made elsewhere — a teammate,
//      or the web dashboard (hooks/useLiveEvents.ts).
//   3. A push notification carries the same event name, covering the case where
//      the socket is down or the app was killed.
//   4. Bringing the app back to the foreground refetches anything stale.
//   5. A deliberate pull-to-refresh, which is the ONLY case that shows a
//      spinner (hooks/useManualRefresh.ts).
//
// Navigating between tabs and screens deliberately triggers no requests at all:
// the cache is already correct, because anything that could have changed it went
// through (1), (2) or (3). Browsing the app should cost nothing.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered current for 5 minutes. Invalidation ignores this, so
      // a real change still refetches immediately — this only stops *repeat*
      // reads of data nothing has touched.
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      // refetchOnWindowFocus stays at its default (true) and is driven by the
      // AppState bridge below, so it means "app came back to the foreground",
      // not "user switched tab".
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 3;
      },
    },
  },
});

// React Query's focus and online detection are both built on browser APIs that
// don't exist in React Native, so without the two bridges below
// `refetchOnWindowFocus` and `refetchOnReconnect` are dead settings — which is
// half of why data went stale until a manual pull-to-refresh.

// Foreground/background instead of window focus. 'active' only; 'inactive' on
// iOS also fires for transient things like the app switcher or a notification
// shade, and treating those as a blur would cause needless refetch churn.
export function startAppStateFocusBridge(): void {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) =>
      handleFocus(state === 'active'),
    );
    return () => sub.remove();
  });
}

// NetInfo instead of window online/offline. This is what makes queries that
// failed while offline retry the moment connectivity is back.
export function startNetworkBridge(): void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // isInternetReachable is null while it's still probing — treat unknown as
      // connected so a slow probe can't wrongly mark the app offline.
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    }),
  );
}

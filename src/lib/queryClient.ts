import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';

// Mirrors the web app's QueryClient tuning: don't retry auth failures, retry
// transient errors a few times (backend cold starts), 5-minute staleness.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
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

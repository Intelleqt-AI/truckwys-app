import { QueryClient } from '@tanstack/react-query';

// Mirrors the web app's QueryClient tuning: don't retry auth failures, retry
// transient errors a few times (backend cold starts), 5-minute staleness.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 3;
      },
    },
  },
});

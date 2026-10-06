import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { focusManager, useQueryClient, type QueryKey } from '@tanstack/react-query';

/** How long a screen's figures count as current; matches the global staleTime. */
export const STALE_MS = 5 * 60_000;

/**
 * Keeps a screen's figures current on their own: when the oldest one turns stale
 * while the screen is focused, and when the user returns to it with stale figures.
 * Only stale, mounted queries refetch, quietly (no spinner). Without this nothing
 * fires when staleTime runs out, so a StaleDataNotice on the screen shows "may be
 * out of date" and the user has to tap "Refresh now". Pair every StaleDataNotice
 * with this.
 *
 * `updatedAt` is the OLDEST load among the data shown (epoch ms); 0 does nothing.
 */
export function useAutoRefreshStale(keys: QueryKey[], updatedAt: number, staleMs = STALE_MS) {
  const qc = useQueryClient();
  // Callers pass a fresh array each render; key the effect on its contents instead.
  const keysId = JSON.stringify(keys);
  useFocusEffect(
    useCallback(() => {
      const queryKeys = JSON.parse(keysId) as QueryKey[];
      const refresh = () => {
        if (!focusManager.isFocused()) return;
        queryKeys.forEach((queryKey) => void qc.refetchQueries({ queryKey, type: 'active', stale: true }));
      };
      if (!updatedAt) return;
      const wait = updatedAt + staleMs - Date.now();
      if (wait <= 0) {
        refresh();
        return;
      }
      const id = setTimeout(refresh, wait + 500);
      return () => clearTimeout(id);
    }, [qc, keysId, updatedAt, staleMs]),
  );
}

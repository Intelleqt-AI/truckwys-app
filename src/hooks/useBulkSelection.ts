import { useCallback, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

export type SelectableId = string | number;

/**
 * Multi-select state shared by the Customers list and Fleet's Vehicles tab —
 * pulled out once instead of hand-rolled per screen so long-press-to-select,
 * the "search hid a selected row" cleanup, and Android back-to-cancel all
 * behave the same way everywhere.
 */
export function useBulkSelection<T extends SelectableId = SelectableId>() {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<T>>(new Set());

  const haptic = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  };

  // Starts selection mode. Called from a row's long-press (preselecting that
  // row) or a header "Select" tap (id omitted — nothing preselected yet).
  const enter = useCallback((id?: T) => {
    haptic();
    setSelectMode(true);
    setSelected(id === undefined ? new Set() : new Set([id]));
  }, []);

  const exit = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const toggle = useCallback((id: T) => {
    haptic();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((visibleIds: T[]) => {
    haptic();
    setSelected((prev) => (prev.size >= visibleIds.length ? new Set() : new Set(visibleIds)));
  }, []);

  // A search or filter that hides a selected row shouldn't leave it selected —
  // Delete and the "N selected" count would otherwise include rows nobody can
  // see. Call from an effect keyed on the host's own filtered list.
  const prune = useCallback(
    (visibleIds: T[]) => {
      if (!selectMode) return;
      setSelected((prev) => {
        const visible = new Set(visibleIds);
        const next = new Set([...prev].filter((id) => visible.has(id)));
        return next.size === prev.size ? prev : next;
      });
    },
    [selectMode],
  );

  // Android hardware back exits select mode instead of leaving the screen —
  // only while this screen is focused and only while selecting.
  useFocusEffect(
    useCallback(() => {
      if (!selectMode) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        exit();
        return true;
      });
      return () => sub.remove();
    }, [selectMode, exit]),
  );

  return { selectMode, selected, enter, exit, toggle, toggleAll, prune };
}

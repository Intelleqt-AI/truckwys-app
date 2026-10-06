import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RevenueBasis } from '@/lib/ledger';

// Which revenue Home shows: money received (cash, the default) or invoiced
// (accrual). Remembered between launches, as the web does with
// `tw-home-revenue-basis`. Loaded lazily by whatever reads it first.
const KEY = 'tw_home_revenue_basis';

interface RevenueBasisState {
  basis: RevenueBasis;
  hydrated: boolean;
  setBasis: (basis: RevenueBasis) => void;
  hydrate: () => Promise<void>;
}

export const useRevenueBasisStore = create<RevenueBasisState>((set, get) => ({
  basis: 'cash',
  hydrated: false,
  setBasis: (basis) => {
    set({ basis });
    void AsyncStorage.setItem(KEY, basis).catch(() => {
      // Remembering the choice is a convenience; the figures don't depend on it.
    });
  },
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const saved = await AsyncStorage.getItem(KEY);
      if (saved === 'cash' || saved === 'accrual') set({ basis: saved });
    } catch {
      // Storage unavailable: keep the default.
    }
    set({ hydrated: true });
  },
}));

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// User's theme preference. 'system' follows the OS; 'dark'/'light' override it.
export type ThemeMode = 'system' | 'dark' | 'light';
const KEY = 'tw_theme_mode';

interface ThemeState {
  mode: ThemeMode;
  hydrated: boolean;
  setMode: (mode: ThemeMode) => void;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',
  hydrated: false,
  setMode: (mode) => {
    set({ mode });
    void AsyncStorage.setItem(KEY, mode);
  },
  hydrate: async () => {
    const saved = (await AsyncStorage.getItem(KEY)) as ThemeMode | null;
    set({ mode: saved ?? 'system', hydrated: true });
  },
}));

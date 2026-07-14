import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { colorScheme as nwColorScheme } from 'nativewind';
import { palette, type Palette, type Scheme } from './tokens';
import { useThemeStore } from '@/stores/themeStore';

// Resolves the active scheme from the user's preference ('system' → OS) and keeps
// NativeWind's colorScheme in sync so the CSS-variable theme swaps too. Exposes
// the palette to JS consumers that can't use NativeWind classes.
type ThemeValue = { scheme: Scheme; colors: Palette };

const ThemeContext = createContext<ThemeValue>({ scheme: 'dark', colors: palette.dark });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const os = useRNColorScheme();
  const mode = useThemeStore((s) => s.mode);
  const hydrate = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const scheme: Scheme = mode === 'system' ? (os === 'light' ? 'light' : 'dark') : mode;

  useEffect(() => {
    // Drives the `dark:` variant AND the prefers-color-scheme blocks NativeWind
    // compiles, so CSS variables in global.css follow the preference.
    nwColorScheme.set(mode);
  }, [mode]);

  const value = useMemo<ThemeValue>(() => ({ scheme, colors: palette[scheme] }), [scheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

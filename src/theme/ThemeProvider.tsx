import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { View, useColorScheme as useRNColorScheme } from 'react-native';
import { colorScheme as nwColorScheme, vars } from 'nativewind';
import { palette, type Palette, type Scheme } from './tokens';
import { useThemeStore } from '@/stores/themeStore';

// Resolves the active scheme from the user's preference ('system' → OS). Colours
// are injected as CSS variables via NativeWind `vars()` on the root subtree, so
// every `var(--…)`-backed class (bg-surface, text-fg, border-line, …) updates
// instantly when the mode changes — independent of OS media queries.
type ThemeValue = { scheme: Scheme; colors: Palette };

const ThemeContext = createContext<ThemeValue>({ scheme: 'dark', colors: palette.dark });

function toVars(p: Palette) {
  return vars({
    '--bg-deep': p.bgDeep,
    '--bg-surface': p.surface,
    '--bg-surface-hover': p.surfaceHover,
    '--bg-elevated': p.elevated,
    '--border-subtle': p.line,
    '--border-active': p.lineActive,
    '--border-row': p.lineRow,
    '--accent-primary': p.accent,
    '--accent-dim': p.accentDim,
    '--text-primary': p.fg,
    '--text-secondary': p.muted,
    '--text-tertiary': p.faint,
    '--text-on-accent': p.onAccent,
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const os = useRNColorScheme();
  const mode = useThemeStore((s) => s.mode);
  const hydrate = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const scheme: Scheme = mode === 'system' ? (os === 'light' ? 'light' : 'dark') : mode;

  useEffect(() => {
    // Keeps the `dark:` variant in sync for any utility that uses it.
    nwColorScheme.set(mode);
  }, [mode]);

  const value = useMemo<ThemeValue>(() => ({ scheme, colors: palette[scheme] }), [scheme]);
  const rootVars = useMemo(() => toVars(palette[scheme]), [scheme]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, rootVars]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

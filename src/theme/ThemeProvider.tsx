import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { View, useColorScheme as useRNColorScheme } from 'react-native';
import { colorScheme as nwColorScheme, vars } from 'nativewind';
import * as SystemUI from 'expo-system-ui';
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
    '--bg-raised': p.raised,
    '--bg-elevated': p.elevated,
    '--bg-input': p.inputBg,
    '--backdrop': p.backdrop,
    '--border-subtle': p.line,
    '--border-active': p.lineActive,
    '--border-row': p.lineRow,
    '--border-strong': p.lineStrong,
    '--border-control': p.lineControl,
    '--accent-primary': p.accent,
    '--accent-dim': p.accentDim,
    '--link': p.link,
    '--text-primary': p.fg,
    '--text-secondary': p.muted,
    '--text-tertiary': p.faint,
    '--text-placeholder': p.placeholder,
    '--text-disabled': p.disabled,
    '--text-on-accent': p.onAccent,
    '--btn-primary-bg': p.btnPrimaryBg,
    '--btn-primary-fg': p.btnPrimaryFg,
    '--btn-danger-bg': p.btnDangerBg,
    '--btn-danger-fg': p.btnDangerFg,
    '--status-success-text': p.success,
    '--status-success-dot': p.successDot,
    '--status-success-bg': p.successBg,
    '--status-warning-text': p.warning,
    '--status-warning-dot': p.warningDot,
    '--status-warning-bg': p.warningBg,
    '--status-danger-text': p.danger,
    '--status-danger-dot': p.dangerDot,
    '--status-danger-bg': p.dangerBg,
    '--status-info-text': p.info,
    '--status-info-dot': p.infoDot,
    '--status-info-bg': p.infoBg,
    '--status-neutral-text': p.neutral,
    '--status-neutral-dot': p.neutralDot,
    '--status-neutral-bg': p.neutralBg,
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

  useEffect(() => {
    // Native window background follows the theme so screen transitions never
    // flash the opposite colour.
    void SystemUI.setBackgroundColorAsync(palette[scheme].bgDeep);
  }, [scheme]);

  const value = useMemo<ThemeValue>(() => ({ scheme, colors: palette[scheme] }), [scheme]);
  const rootVars = useMemo(() => toVars(palette[scheme]), [scheme]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, rootVars]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

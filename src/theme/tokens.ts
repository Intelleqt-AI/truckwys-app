import { Platform } from 'react-native';

// Runtime access to the Truckwys design tokens. Components style with NativeWind
// classes; this module is for the places that need raw values in JS — SVG fills,
// Reanimated, charts, navigation theme. Values are verbatim from the design system.

export const palette = {
  dark: {
    bgDeep: '#030303',
    surface: '#0A0A0A',
    surfaceHover: '#121212',
    elevated: '#141414',
    line: '#1F1F1F',
    lineActive: '#333333',
    lineRow: '#141414',
    accent: '#4D9EFF',
    accentDim: '#1A3A6B',
    fg: '#EDEDED',
    muted: '#888888',
    faint: '#444444',
    onAccent: '#030303',
    glow: 'rgba(77,158,255,0.08)',
    pulse: 'rgba(77,158,255,0.4)',
  },
  light: {
    bgDeep: '#F3F4F6',
    surface: '#FFFFFF',
    surfaceHover: '#F9FAFB',
    elevated: '#FFFFFF',
    line: '#E5E7EB',
    lineActive: '#D1D5DB',
    lineRow: '#E5E7EB',
    accent: '#2563EB',
    accentDim: '#EFF6FF',
    fg: '#111827',
    muted: '#374151',
    faint: '#6B7280',
    onAccent: '#FFFFFF',
    glow: 'rgba(59,130,246,0.08)',
    pulse: 'rgba(37,99,235,0.4)',
  },
} as const;

// Theme-independent status hues.
export const status = {
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#FF4949',
  info: '#4D9EFF',
  neutral: '#888888',
} as const;

export const pipeline = {
  draft: '#888888',
  sent: '#F59E0B',
  accepted: '#22C55E',
  transit: '#4D9EFF',
  completed: '#14B8A6',
} as const;

export type Scheme = 'dark' | 'light';
export type Palette = (typeof palette)[Scheme];

// The product ships native system fonts. Monospace carries every number/label/ID.
export const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' }) as string;

export const radius = { xs: 2, sm: 4, md: 8, lg: 12, pill: 100 } as const;
export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32 } as const;
export const TAP_MIN = 44;

export const motion = {
  fast: 150,
  smooth: 200,
  slow: 300,
  // Entrance reveal + per-module stagger step for the Home screen's
  // mount-once reveal (see useCountUp, Sparkline's draw-on, Home's modules).
  reveal: 380,
  stagger: 55,
} as const;

// The web app's house easing curve (theme.css `--ease-out`), reused here so
// mobile's entrance/count-up motion reads as the same product.
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

// A plain, non-worklet cubic-bezier evaluator for the same curve — Reanimated's
// `Easing.bezier(...)` returns an `EasingFunctionFactory` object (not directly
// callable) meant for worklet contexts (withTiming, layout animations), so
// JS-thread-only code (useCountUp's requestAnimationFrame ramp) needs its own
// evaluator over the same four control points. Standard Newton-Raphson +
// bisection solve, as used by the `bezier-easing` reference implementation.
function makeBezierEasing(mX1: number, mY1: number, mX2: number, mY2: number) {
  const a = (x1: number, x2: number) => 1 - 3 * x2 + 3 * x1;
  const b = (x1: number, x2: number) => 3 * x2 - 6 * x1;
  const c = (x1: number) => 3 * x1;
  const calc = (t: number, x1: number, x2: number) => ((a(x1, x2) * t + b(x1, x2)) * t + c(x1)) * t;
  const slope = (t: number, x1: number, x2: number) =>
    3 * a(x1, x2) * t * t + 2 * b(x1, x2) * t + c(x1);

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    // A handful of Newton-Raphson iterations converges for any well-formed
    // easing curve; bisection is the fallback if the slope ever flattens.
    for (let i = 0; i < 8; i++) {
      const s = slope(t, mX1, mX2);
      if (Math.abs(s) < 1e-6) break;
      t -= (calc(t, mX1, mX2) - x) / s;
    }
    let lo = 0;
    let hi = 1;
    let guess = calc(t, mX1, mX2) - x;
    for (let i = 0; Math.abs(guess) > 1e-6 && i < 10; i++) {
      if (guess > 0) hi = t;
      else lo = t;
      t = lo + (hi - lo) / 2;
      guess = calc(t, mX1, mX2) - x;
    }
    return calc(t, mY1, mY2);
  };
}

export const easeOut = makeBezierEasing(...EASE_OUT);

import { Platform } from 'react-native';

// Runtime access to the Truckwys design tokens. Components style with NativeWind
// classes; this module is for the places that need raw values in JS — SVG fills,
// Reanimated, charts, navigation theme. Values mirror the web's "v3" theme.css
// (truckwyas-frontend/src/styles/theme.css); keep the two in step.
//
// v3 rules the roles below encode:
//  - primary actions are ink (btnPrimary*), never the accent;
//  - accent is for data, links, focus and selected marks — not a fill;
//  - status words use `<tone>`, dots use `<tone>Dot`, tinted fills (`<tone>Bg`)
//    are for banners only;
//  - cards carry a 1px border and no shadow; only overlays use `shadowPop`.

export const palette = {
  dark: {
    // Surfaces
    bgDeep: '#0B0C0E',
    surface: '#131518',
    surfaceHover: '#181B1F',
    raised: '#1C1F24',
    elevated: '#1C1F24',
    inputBg: '#0F1114',
    // Lines
    line: '#23262C',
    lineActive: '#2C3037',
    lineRow: '#1D2025',
    lineStrong: '#3A3F47',
    lineControl: '#6E7682',
    lineControlHover: '#8B919C',
    // Accent (data, links, focus)
    accent: '#6AA6FF',
    accentDim: 'rgba(106,166,255,0.10)',
    link: '#7DB2FF',
    onAccent: '#0B0C0E',
    focusRing: 'rgba(106,166,255,0.35)',
    // Text
    fg: '#EDEFF2',
    muted: '#B4BAC3',
    faint: '#9BA1AB',
    disabled: '#555B64',
    // Overlays + press feedback
    backdrop: 'rgba(0,0,0,0.64)',
    tintPressed: 'rgba(255,255,255,0.07)',
    shadowPop: '0 12px 32px rgba(0,0,0,0.5)',
    // Buttons + nav (ink)
    btnPrimaryBg: '#EDEFF2',
    btnPrimaryFg: '#0B0C0E',
    btnPrimaryPressed: '#D5D9DF',
    btnDangerBg: '#D93036',
    btnDangerFg: '#FFFFFF',
    navActiveBg: '#262A31',
    navActiveFg: '#EDEFF2',
    // Status: text / dot / banner fill
    success: '#4CC38A',
    successDot: '#3DB87E',
    successBg: 'rgba(76,195,138,0.10)',
    warning: '#EDB14F',
    warningDot: '#E09A2D',
    warningBg: 'rgba(237,177,79,0.10)',
    danger: '#F47A7A',
    dangerDot: '#E5534B',
    dangerBg: 'rgba(244,122,122,0.10)',
    info: '#7DB2FF',
    infoDot: '#6AA6FF',
    infoBg: 'rgba(106,166,255,0.10)',
    neutral: '#B4BAC3',
    neutralDot: '#6B717B',
    neutralBg: '#1C1F24',
    // Charts
    chartMuted: '#6B7280',
    chartGrid: '#262A30',
    chartAxis: '#3A3F47',
    chartBar: 'rgba(255,255,255,0.04)',
    chartNegative: '#F0894F',
    heat: ['#1A1D22', '#172338', '#1F3A66', '#2F5FAD', '#5592EE', '#9CC3FF'],
  },
  light: {
    bgDeep: '#F3F4F6',
    surface: '#FFFFFF',
    surfaceHover: '#F8F9FA',
    raised: '#EEF0F3',
    elevated: '#FFFFFF',
    inputBg: '#FFFFFF',
    line: '#E4E6EA',
    lineActive: '#D8DBE0',
    lineRow: '#EEF0F2',
    lineStrong: '#C3C7CE',
    lineControl: '#848B96',
    lineControlHover: '#6B7280',
    accent: '#2563EB',
    accentDim: '#EFF5FF',
    link: '#1D4ED8',
    onAccent: '#FFFFFF',
    focusRing: 'rgba(37,99,235,0.28)',
    fg: '#0E1116',
    muted: '#434A55',
    faint: '#636A75',
    disabled: '#A3A8B1',
    backdrop: 'rgba(14,17,22,0.40)',
    tintPressed: 'rgba(14,17,22,0.07)',
    shadowPop: '0 12px 32px rgba(14,17,22,0.12), 0 2px 6px rgba(14,17,22,0.06)',
    btnPrimaryBg: '#0E1116',
    btnPrimaryFg: '#FFFFFF',
    btnPrimaryPressed: '#000000',
    btnDangerBg: '#C81E1E',
    btnDangerFg: '#FFFFFF',
    navActiveBg: '#0E1116',
    navActiveFg: '#FFFFFF',
    success: '#137A3A',
    successDot: '#15803D',
    successBg: '#ECFDF3',
    warning: '#A84C08',
    warningDot: '#BA7607',
    warningBg: '#FFF7E6',
    danger: '#C81E1E',
    dangerDot: '#DC2626',
    dangerBg: '#FEF2F2',
    info: '#1D4ED8',
    infoDot: '#2563EB',
    infoBg: '#EFF5FF',
    neutral: '#434A55',
    neutralDot: '#7D848F',
    neutralBg: '#EEF0F3',
    chartMuted: '#838A95',
    chartGrid: '#E4E6EA',
    chartAxis: '#C3C7CE',
    chartBar: 'rgba(14,17,22,0.04)',
    chartNegative: '#C2410C',
    heat: ['#F1F3F5', '#DCE7FD', '#AFC8FB', '#6F9EF5', '#2563EB', '#1A3FA8'],
  },
} as const;

export type Scheme = 'dark' | 'light';
export type Palette = (typeof palette)[Scheme];

// The product ships native system fonts (same stack as the web). Figures, IDs and
// labels are sans with `tabular-nums`; only genuine code (copilot code blocks,
// the CSV paste box) uses a monospace face.
export const CODE_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' }) as string;

export const radius = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  pill: 100,
  // Role-based scale — mirrors the `borderRadius` entries in tailwind.config.js
  // for JS-style call sites (Badge, Skeleton, gorhom bottom-sheet backgroundStyle).
  // Same roles as the web: chip 6, control 8, card 12, menu 12, sheet/dialog 16.
  chip: 6,
  control: 8,
  card: 12,
  menu: 12,
  panel: 16,
} as const;
export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32 } as const;
export const TAP_MIN = 44;

export const motion = {
  fast: 150,
  smooth: 200,
  slow: 300,
  // Entrance reveal + per-module stagger step for the Home screen's
  // mount-once reveal (see useCountUp, RevenueCostBars' grow-in, Home's modules).
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

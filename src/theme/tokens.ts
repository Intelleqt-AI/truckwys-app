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
} as const;

/** @type {import('tailwindcss').Config} */
// Truckwys design tokens → NativeWind theme.
// Themeable roles resolve to CSS variables (see global.css) so dark/light swap
// automatically with the OS. Status/pipeline hues are theme-independent.
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Surfaces (themeable)
        'bg-deep': 'var(--bg-deep)',
        surface: 'var(--bg-surface)',
        'surface-hover': 'var(--bg-surface-hover)',
        elevated: 'var(--bg-elevated)',
        // Borders / hairlines (themeable)
        line: 'var(--border-subtle)',
        'line-active': 'var(--border-active)',
        'line-row': 'var(--border-row)',
        // Accent (themeable)
        accent: 'var(--accent-primary)',
        'accent-dim': 'var(--accent-dim)',
        // Text (themeable)
        fg: 'var(--text-primary)',
        muted: 'var(--text-secondary)',
        faint: 'var(--text-tertiary)',
        'on-accent': 'var(--text-on-accent)',
        // Status (theme-independent)
        success: '#22C55E',
        'success-bg': 'rgba(34,197,94,0.12)',
        warning: '#F59E0B',
        'warning-bg': 'rgba(245,158,11,0.10)',
        danger: '#FF4949',
        'danger-bg': 'rgba(255,73,73,0.10)',
        info: '#4D9EFF',
        'info-bg': 'rgba(77,158,255,0.10)',
        neutral: '#888888',
        'neutral-bg': 'rgba(136,136,136,0.12)',
        // Quote pipeline stages
        'stage-draft': '#888888',
        'stage-sent': '#F59E0B',
        'stage-accepted': '#22C55E',
        'stage-transit': '#4D9EFF',
        'stage-completed': '#14B8A6',
        // Confidence
        'conf-high': '#22C55E',
        'conf-medium': '#F59E0B',
        'conf-low': '#FF4949',
      },
      fontFamily: {
        sans: ['System'],
        mono: ['SpaceMono', 'Menlo', 'monospace'],
      },
      fontSize: {
        display: ['28px', { lineHeight: '32px', letterSpacing: '-0.84px' }],
        title: ['22px', { lineHeight: '28px' }],
        heading: ['17px', { lineHeight: '22px' }],
        body: ['15px', { lineHeight: '22px' }],
        callout: ['14px', { lineHeight: '20px' }],
        sub: ['13px', { lineHeight: '18px' }],
        caption: ['12px', { lineHeight: '16px' }],
        micro: ['11px', { lineHeight: '14px' }],
        nano: ['10px', { lineHeight: '13px' }],
      },
      letterSpacing: {
        label: '0.08em',
        wide: '0.05em',
        body: '-0.01em',
        display: '-0.03em',
      },
      borderRadius: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        pill: '100px',
      },
      spacing: {
        screen: '16px',
      },
    },
  },
  plugins: [],
};
